'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type AuditSeverity = 'error' | 'warning' | 'info' | 'ok'

export type DupeTxSnapshot = {
  id: string
  date: string | null
  amount: number
  vendor: string | null
  concept: string | null
  movement_type: string | null
  created_at: string
  notes: string | null
  is_settlement: boolean | null
}

export type AuditIssue = {
  id: string
  date?: string
  amount?: number
  description: string
  action?: string
  dupeMeta?: { orig: DupeTxSnapshot; dupe: DupeTxSnapshot }
  suggestedType?: 'income' | 'expense' | 'cash_withdrawal'
  txData?: {
    vendor: string | null
    concept: string | null
    movement_type: string | null
    expense_group: string | null
    is_passive_income: boolean | null
    is_settlement: boolean | null
    notes: string | null
    category_code: string | null
  }
}

function suggestMovementType(vendor: string | null, concept: string | null): 'income' | 'expense' | 'cash_withdrawal' {
  const text = `${vendor ?? ''} ${concept ?? ''}`.toLowerCase()
  if (/retiro|atm|cajero|efectivo/.test(text)) return 'cash_withdrawal'
  if (/salario|sueldo|aguinaldo|bono|liquidaci[oó]n|dividendo|rendimiento|utilidad|honorarios|comisi[oó]n|ingreso|abono|cr[eé]dito|dep[oó]sito|transferencia recibida|pago recibido|alquiler|renta/.test(text)) return 'income'
  return 'expense'
}

export type AuditCheck = {
  id: string
  label: string
  description: string
  severity: AuditSeverity
  count: number
  issues: AuditIssue[]
}

export type AuditReport = {
  ran_at: string
  checks: AuditCheck[]
  total_errors: number
  total_warnings: number
}

export async function runAudit(excludeIds: string[] = []): Promise<{ error: string } | AuditReport> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const checks: AuditCheck[] = []

  // Helper: apply exclude filter when there are ignored IDs
  function withExclude<T>(q: T): T {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return excludeIds.length ? (q as any).not('id', 'in', `(${excludeIds.join(',')})`) as T : q
  }

  // ── 1. Exact duplicates ────────────────────────────────────────────────────
  {
    const { data } = await admin
      .from('transactions')
      .select('id, date, amount, vendor, concept, movement_type, created_at, notes, is_settlement')
      .eq('user_id', user.id)
      .order('date')
      .order('amount')
      .order('created_at')

    const rows = data ?? []
    const seen = new Map<string, typeof rows[0]>()
    const dupes: AuditIssue[] = []

    for (const tx of rows) {
      const key = `${tx.date}|${tx.amount}|${(tx.vendor ?? '').toLowerCase().trim()}|${(tx.concept ?? '').toLowerCase().trim()}|${tx.movement_type}`
      if (seen.has(key)) {
        const orig = seen.get(key)!
        const snap = (r: typeof rows[0]): DupeTxSnapshot => ({
          id: r.id,
          date: r.date,
          amount: Number(r.amount),
          vendor: r.vendor,
          concept: r.concept,
          movement_type: r.movement_type,
          created_at: r.created_at ?? '',
          notes: (r as unknown as { notes?: string | null }).notes ?? null,
          is_settlement: (r as unknown as { is_settlement?: boolean | null }).is_settlement ?? null,
        })
        dupes.push({
          id: tx.id,
          date: tx.date ?? undefined,
          amount: Number(tx.amount),
          description: `"${tx.concept || tx.vendor || '—'}" — ${tx.movement_type} el ${tx.date}`,
          action: 'Expandí para comparar ambas transacciones y elegir cuál eliminar',
          dupeMeta: { orig: snap(orig), dupe: snap(tx) },
        })
      } else {
        seen.set(key, tx)
      }
    }

    const dupeTotal = dupes.reduce((s, d) => s + (d.amount ?? 0), 0)
    const fmtK = (n: number) => n >= 1_000_000 ? `₡${(n / 1_000_000).toFixed(2)}M` : `₡${Math.round(n).toLocaleString('es-CR')}`

    checks.push({
      id: 'duplicates',
      label: 'Transacciones duplicadas',
      description: dupes.length > 0
        ? `Mismo monto + vendedor + concepto + fecha + tipo. ${dupes.length} posibles duplicados · ${fmtK(dupeTotal)} en total. Revisión visual requerida.`
        : 'Mismo monto + vendedor + concepto + fecha + tipo.',
      severity: dupes.length > 0 ? 'error' : 'ok',
      count: dupes.length,
      issues: dupes.slice(0, 20),
    })
  }

  // ── 2. Expenses with expense_group = 'na' ─────────────────────────────────
  {
    const { data } = await withExclude(admin
      .from('transactions')
      .select('id, date, amount, vendor, concept, movement_type, expense_group, is_passive_income, is_settlement, notes, category_code')
      .eq('user_id', user.id)
      .eq('movement_type', 'expense')
      .eq('expense_group', 'na')
      .eq('is_settlement', false)
      .order('date', { ascending: false }))
      .limit(30)

    const issues = (data ?? []).map(tx => ({
      id: tx.id,
      date: tx.date ?? undefined,
      amount: Number(tx.amount),
      description: `"${tx.concept || tx.vendor || '—'}" sin categoría de gasto`,
      action: 'Editá el gasto y asigná grupo (personal, necesario, objetivos_financieros)',
      txData: {
        vendor: tx.vendor ?? null,
        concept: tx.concept ?? null,
        movement_type: tx.movement_type ?? null,
        expense_group: tx.expense_group ?? null,
        is_passive_income: tx.is_passive_income ?? null,
        is_settlement: tx.is_settlement ?? null,
        notes: tx.notes ?? null,
        category_code: tx.category_code ?? null,
      },
    }))

    checks.push({
      id: 'uncategorized_expenses',
      label: 'Gastos sin categoría',
      description: 'Gastos con expense_group = "na" (no clasificados como personal, necesario u objetivos).',
      severity: issues.length > 5 ? 'warning' : issues.length > 0 ? 'info' : 'ok',
      count: issues.length,
      issues,
    })
  }

  // ── 3. Income missing is_passive_income flag where category implies it ─────
  {
    const passiveCodes = ['RENTAL_INCOME', 'INTEREST', 'DIVIDENDS', 'PASSIVE_OTHER']
    const { data } = await withExclude(admin
      .from('transactions')
      .select('id, date, amount, vendor, concept, movement_type, expense_group, is_passive_income, is_settlement, notes, category_code')
      .eq('user_id', user.id)
      .eq('movement_type', 'income')
      .eq('is_passive_income', false)
      .in('category_code', passiveCodes)
      .order('date', { ascending: false }))
      .limit(20)

    const issues = (data ?? []).map(tx => ({
      id: tx.id,
      date: tx.date ?? undefined,
      amount: Number(tx.amount),
      description: `"${tx.concept || tx.vendor || '—'}" tiene categoría pasiva (${tx.category_code}) pero is_passive_income = false`,
      action: 'Editá el ingreso y marcalo como ingreso pasivo',
      txData: {
        vendor: tx.vendor ?? null,
        concept: tx.concept ?? null,
        movement_type: tx.movement_type ?? null,
        expense_group: tx.expense_group ?? null,
        is_passive_income: tx.is_passive_income ?? null,
        is_settlement: tx.is_settlement ?? null,
        notes: tx.notes ?? null,
        category_code: tx.category_code ?? null,
      },
    }))

    checks.push({
      id: 'passive_income_flag',
      label: 'Ingresos pasivos sin bandera',
      description: 'Transacciones categorizadas como renta, intereses o dividendos sin el flag is_passive_income.',
      severity: issues.length > 0 ? 'warning' : 'ok',
      count: issues.length,
      issues,
    })
  }

  // ── 4. Income with no concept and no vendor ────────────────────────────────
  {
    const { data } = await withExclude(admin
      .from('transactions')
      .select('id, date, amount, vendor, concept, movement_type, expense_group, is_passive_income, is_settlement, notes, category_code')
      .eq('user_id', user.id)
      .eq('movement_type', 'income')
      .is('concept', null)
      .is('vendor', null)
      .order('date', { ascending: false }))
      .limit(20)

    const issues = (data ?? []).map(tx => ({
      id: tx.id,
      date: tx.date ?? undefined,
      amount: Number(tx.amount),
      description: `Ingreso de ${Number(tx.amount).toLocaleString('es-CR', { style: 'currency', currency: 'CRC' })} sin concepto ni origen`,
      action: 'Editá el ingreso para agregar concepto o vendedor',
      txData: {
        vendor: tx.vendor ?? null,
        concept: tx.concept ?? null,
        movement_type: tx.movement_type ?? null,
        expense_group: tx.expense_group ?? null,
        is_passive_income: tx.is_passive_income ?? null,
        is_settlement: tx.is_settlement ?? null,
        notes: tx.notes ?? null,
        category_code: tx.category_code ?? null,
      },
    }))

    checks.push({
      id: 'anonymous_income',
      label: 'Ingresos sin concepto ni origen',
      description: 'Ingresos sin vendor ni concept — dificultan la trazabilidad.',
      severity: issues.length > 3 ? 'warning' : issues.length > 0 ? 'info' : 'ok',
      count: issues.length,
      issues,
    })
  }

  // ── 5. Savings without a corresponding envelope movement ──────────────────
  {
    const { data: savingsTx } = await withExclude(admin
      .from('transactions')
      .select('id, date, amount, vendor, concept, movement_type, expense_group, is_passive_income, is_settlement, notes, category_code')
      .eq('user_id', user.id)
      .eq('movement_type', 'expense')
      .eq('expense_group', 'objetivos_financieros')
      .eq('is_settlement', false)
      .order('date', { ascending: false }))

    const { data: envMovements } = await admin
      .from('envelope_movements')
      .select('date, amount')
      .eq('user_id', user.id)
      .eq('movement_type', 'deposito')

    const depositSet = new Set(
      (envMovements ?? []).map(m => `${m.date}|${Math.round(Number(m.amount))}`)
    )

    const orphanSavings: AuditIssue[] = []
    for (const tx of savingsTx ?? []) {
      const key = `${tx.date}|${Math.round(Number(tx.amount))}`
      if (!depositSet.has(key)) {
        orphanSavings.push({
          id: tx.id,
          date: tx.date ?? undefined,
          amount: Number(tx.amount),
          description: `"${tx.concept || tx.vendor || 'Ahorro'}" — gasto de objetivos sin depósito a sobre correspondiente`,
          action: 'Agregá un depósito en el sobre correcto para esta fecha y monto',
          txData: {
            vendor: tx.vendor ?? null,
            concept: tx.concept ?? null,
            movement_type: tx.movement_type ?? null,
            expense_group: tx.expense_group ?? null,
            is_passive_income: tx.is_passive_income ?? null,
            is_settlement: tx.is_settlement ?? null,
            notes: tx.notes ?? null,
            category_code: tx.category_code ?? null,
          },
        })
      }
    }

    checks.push({
      id: 'orphan_savings',
      label: 'Ahorros sin depósito en sobre',
      description: 'Gastos de objetivos_financieros sin movimiento deposito correspondiente en sobres.',
      severity: orphanSavings.length > 0 ? 'warning' : 'ok',
      count: orphanSavings.length,
      issues: orphanSavings.slice(0, 20),
    })
  }

  // ── 6. Large income (>50K CRC) with no envelope deposit within 7 days ─────
  {
    const { data: bigIncome } = await withExclude(admin
      .from('transactions')
      .select('id, date, amount, vendor, concept, movement_type, expense_group, is_passive_income, is_settlement, notes, category_code')
      .eq('user_id', user.id)
      .eq('movement_type', 'income')
      .gte('amount', 50000)
      .order('date', { ascending: false }))
      .limit(100)

    const { data: deposits } = await admin
      .from('envelope_movements')
      .select('date, amount')
      .eq('user_id', user.id)
      .eq('movement_type', 'deposito')

    const undeposited: AuditIssue[] = []
    for (const tx of bigIncome ?? []) {
      if (!tx.date) continue
      const txDate = new Date(tx.date)
      const txAmt  = Math.round(Number(tx.amount))
      // Check if any envelope deposit within ±7 days with similar amount (±10%)
      const matched = (deposits ?? []).some(d => {
        if (!d.date) return false
        const dDate = new Date(d.date)
        const dayDiff = Math.abs((dDate.getTime() - txDate.getTime()) / 86400000)
        const dAmt = Math.round(Number(d.amount))
        return dayDiff <= 7 && Math.abs(dAmt - txAmt) / txAmt <= 0.10
      })
      if (!matched) {
        undeposited.push({
          id: tx.id,
          date: tx.date,
          amount: Number(tx.amount),
          description: `"${tx.concept || tx.vendor || '—'}"${tx.is_settlement ? ' [liquidación]' : ''} — sin depósito a sobre en los 7 días siguientes`,
          action: 'Verificá si este ingreso fue depositado a un sobre o quedó en cuenta bancaria',
          txData: {
            vendor: tx.vendor ?? null,
            concept: tx.concept ?? null,
            movement_type: tx.movement_type ?? null,
            expense_group: tx.expense_group ?? null,
            is_passive_income: tx.is_passive_income ?? null,
            is_settlement: tx.is_settlement ?? null,
            notes: tx.notes ?? null,
            category_code: tx.category_code ?? null,
          },
        })
      }
    }

    checks.push({
      id: 'income_not_in_envelope',
      label: 'Ingresos grandes sin sobre asignado',
      description: 'Ingresos ≥ ₡50K sin depósito en sobres dentro de 7 días. Puede incluir liquidaciones no asignadas.',
      severity: undeposited.length > 5 ? 'warning' : undeposited.length > 0 ? 'info' : 'ok',
      count: undeposited.length,
      issues: undeposited.slice(0, 20),
    })
  }

  // ── 7. Transactions with null movement_type ───────────────────────────────
  {
    const { data } = await withExclude(admin
      .from('transactions')
      .select('id, date, amount, vendor, concept, movement_type, expense_group, is_passive_income, is_settlement, notes, category_code')
      .eq('user_id', user.id)
      .is('movement_type', null)
      .order('date', { ascending: false }))
      .limit(20)

    const issues = (data ?? []).map(tx => {
      const suggested = suggestMovementType(tx.vendor ?? null, tx.concept ?? null)
      return {
        id: tx.id,
        date: tx.date ?? undefined,
        amount: Number(tx.amount ?? 0),
        description: `"${tx.concept || tx.vendor || '—'}" sin tipo de movimiento`,
        suggestedType: suggested,
        txData: {
          vendor: tx.vendor ?? null,
          concept: tx.concept ?? null,
          movement_type: tx.movement_type ?? null,
          expense_group: tx.expense_group ?? null,
          is_passive_income: tx.is_passive_income ?? null,
          is_settlement: tx.is_settlement ?? null,
          notes: tx.notes ?? null,
          category_code: tx.category_code ?? null,
        },
      } satisfies AuditIssue
    })

    checks.push({
      id: 'null_movement_type',
      label: 'Transacciones sin tipo',
      description: 'Transacciones sin movement_type — no se contabilizan en flujo ni en liquidez.',
      severity: issues.length > 0 ? 'error' : 'ok',
      count: issues.length,
      issues,
    })
  }

  // ── 7b. Income without category_code ─────────────────────────────────────
  {
    const { data: uncatCount } = await admin
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('movement_type', 'income')
      .is('category_code', null)

    const total = (uncatCount as unknown as { count: number } | null)?.count
      ?? (await admin.from('transactions').select('id').eq('user_id', user.id).eq('movement_type', 'income').is('category_code', null)).data?.length
      ?? 0

    const { data } = await withExclude(admin
      .from('transactions')
      .select('id, date, amount, vendor, concept, movement_type, expense_group, is_passive_income, is_settlement, notes, category_code')
      .eq('user_id', user.id)
      .eq('movement_type', 'income')
      .is('category_code', null)
      .order('amount', { ascending: false }))
      .limit(20)

    const issues = (data ?? []).map(tx => ({
      id: tx.id,
      date: tx.date ?? undefined,
      amount: Number(tx.amount ?? 0),
      description: `"${tx.concept || tx.vendor || '—'}"${tx.is_passive_income ? ' · pasivo' : ''}${tx.is_settlement ? ' · liquidación' : ''}`,
      action: 'Verificá si es income, expense o retiro',
      txData: {
        vendor: tx.vendor ?? null,
        concept: tx.concept ?? null,
        movement_type: tx.movement_type ?? null,
        expense_group: tx.expense_group ?? null,
        is_passive_income: tx.is_passive_income ?? null,
        is_settlement: tx.is_settlement ?? null,
        notes: tx.notes ?? null,
        category_code: tx.category_code ?? null,
      },
    }))

    checks.push({
      id: 'uncategorized_income',
      label: 'Ingresos sin categoría',
      description: `${total} income sin category_code — revisalos para confirmar que son correctos o reclasificá los que sean gastos.`,
      severity: total > 100 ? 'warning' : total > 0 ? 'info' : 'ok',
      count: total as number,
      issues,
    })
  }

  // ── 8. Settlements without investment_bucket_id ───────────────────────────
  {
    const { data } = await withExclude(admin
      .from('transactions')
      .select('id, date, amount, vendor, concept, movement_type, expense_group, is_passive_income, is_settlement, notes, category_code')
      .eq('user_id', user.id)
      .eq('movement_type', 'income')
      .eq('is_settlement', true)
      .is('investment_bucket_id', null)
      .order('date', { ascending: false }))
      .limit(20)

    const issues = (data ?? []).map(tx => ({
      id: tx.id,
      date: tx.date ?? undefined,
      amount: Number(tx.amount),
      description: `Liquidación "${tx.concept || tx.vendor || '—'}" sin bucket de inversión asignado`,
      action: 'Asigná el bucket de inversión para que la liquidación descuente correctamente del portafolio',
      txData: {
        vendor: tx.vendor ?? null,
        concept: tx.concept ?? null,
        movement_type: tx.movement_type ?? null,
        expense_group: tx.expense_group ?? null,
        is_passive_income: tx.is_passive_income ?? null,
        is_settlement: tx.is_settlement ?? null,
        notes: tx.notes ?? null,
        category_code: tx.category_code ?? null,
      },
    }))

    checks.push({
      id: 'settlement_no_bucket',
      label: 'Liquidaciones sin bucket asignado',
      description: 'Estas txs YA cuentan como ingreso. Solo falta el bucket de inversión para que descuenten del portafolio. Ignorá este check si no usás seguimiento de portafolio.',
      severity: issues.length > 0 ? 'info' : 'ok',
      count: issues.length,
      issues,
    })
  }

  // ── 9. Amount = 0 or negative on income/expense ───────────────────────────
  {
    const { data } = await withExclude(admin
      .from('transactions')
      .select('id, date, amount, vendor, concept, movement_type, expense_group, is_passive_income, is_settlement, notes, category_code')
      .eq('user_id', user.id)
      .lte('amount', 0)
      .in('movement_type', ['income', 'expense'])
      .order('date', { ascending: false }))
      .limit(20)

    const issues = (data ?? []).map(tx => ({
      id: tx.id,
      date: tx.date ?? undefined,
      amount: Number(tx.amount),
      description: `"${tx.concept || tx.vendor || '—'}" (${tx.movement_type}) tiene monto ≤ 0`,
      action: 'Eliminá o corregí el monto',
      txData: {
        vendor: tx.vendor ?? null,
        concept: tx.concept ?? null,
        movement_type: tx.movement_type ?? null,
        expense_group: tx.expense_group ?? null,
        is_passive_income: tx.is_passive_income ?? null,
        is_settlement: tx.is_settlement ?? null,
        notes: tx.notes ?? null,
        category_code: tx.category_code ?? null,
      },
    }))

    checks.push({
      id: 'zero_amount',
      label: 'Montos cero o negativos',
      description: 'Transacciones con monto ≤ 0 en ingresos o gastos.',
      severity: issues.length > 0 ? 'error' : 'ok',
      count: issues.length,
      issues,
    })
  }

  // ── 10. Cross-module figure consistency ──────────────────────────────────
  {
    // Resumen total income vs flujo total income should be the same
    // We can check: sum of all income in system vs sum of all expenses
    const { data: totals } = await admin
      .from('transactions')
      .select('movement_type, is_settlement, amount')
      .eq('user_id', user.id)

    let income = 0, settlement = 0, expense = 0
    for (const t of totals ?? []) {
      const a = Number(t.amount ?? 0)
      if (t.movement_type === 'income' && !t.is_settlement) income += a
      else if (t.movement_type === 'income' && t.is_settlement) settlement += a
      else if (t.movement_type === 'expense') expense += a
    }

    const netFlow = income + settlement - expense
    const issues: AuditIssue[] = []
    if (netFlow < -500_000) {
      issues.push({
        id: 'negative-net',
        description: `Flujo neto negativo: ingresos (${(income / 1e6).toFixed(1)}M) + liquidaciones (${(settlement / 1e6).toFixed(1)}M) − gastos (${(expense / 1e6).toFixed(1)}M) = ${(netFlow / 1e6).toFixed(2)}M`,
        action: 'Revisá si hay gastos duplicados o ingresos faltantes',
      })
    }

    checks.push({
      id: 'flow_consistency',
      label: 'Consistencia de flujo global',
      description: 'Flujo neto acumulado (ingresos + liquidaciones − gastos).',
      severity: issues.length > 0 ? 'warning' : 'ok',
      count: issues.length,
      issues,
    })
  }

  const total_errors   = checks.filter(c => c.severity === 'error').reduce((s, c) => s + c.count, 0)
  const total_warnings = checks.filter(c => c.severity === 'warning').reduce((s, c) => s + c.count, 0)

  return {
    ran_at: new Date().toISOString(),
    checks,
    total_errors,
    total_warnings,
  }
}
