import Anthropic from '@anthropic-ai/sdk'
import type { createAdminClient } from '@/lib/supabase/admin'
import { outlierFence } from '@/lib/lifestyleExpenses'

type AdminClient = ReturnType<typeof createAdminClient>

// Tools the Oracle assistant can call mid-conversation to verify a claim or
// dig into a specific category/transaction instead of relying only on the
// static context dump built once per page load (@/app/(dashboard)/oracle/page.tsx).
// This is what lets it answer "why did X change" with a real transaction
// instead of guessing from an aggregate.
export const ORACLE_TOOLS: Anthropic.Tool[] = [
  {
    name: 'query_transactions',
    description:
      'Busca transacciones reales del usuario con filtros. Usala para verificar un monto, encontrar una compra específica, o listar el detalle detrás de un total que aparece en el contexto. Devuelve hasta 200 filas ordenadas por fecha descendente, más la cantidad total y la suma.',
    input_schema: {
      type: 'object',
      properties: {
        category_code: { type: 'string', description: 'Código exacto de categoría (ver catálogo en el contexto), ej. FOOD_SUPER' },
        vendor_contains: { type: 'string', description: 'Subcadena a buscar en el comercio (case-insensitive)' },
        concept_contains: { type: 'string', description: 'Subcadena a buscar en el concepto (case-insensitive)' },
        from: { type: 'string', description: 'Fecha inicio YYYY-MM-DD (inclusive)' },
        to: { type: 'string', description: 'Fecha fin YYYY-MM-DD (exclusive)' },
        min_amount: { type: 'number', description: 'Monto mínimo en CRC' },
        movement_type: { type: 'string', enum: ['expense', 'income', 'cash_withdrawal'] },
        limit: { type: 'number', description: 'Máximo de filas a devolver (default 100, máx 200)' },
      },
    },
  },
  {
    name: 'get_monthly_category_totals',
    description:
      'Trae el desglose mes a mes de una categoría específica, con el total crudo, el total limpio (sin outliers) y — clave — la lista exacta de transacciones excluidas como atípicas por mes (fecha, monto, concepto, comercio). Usala SIEMPRE que el usuario pregunte por qué una categoría subió/bajó/varió, en vez de adivinar a partir de un promedio.',
    input_schema: {
      type: 'object',
      properties: {
        category_code: { type: 'string', description: 'Código exacto de categoría (ver catálogo en el contexto), ej. FOOD_SUPER' },
        months: { type: 'number', description: 'Cuántos meses hacia atrás traer (default 24, máx 48)' },
      },
      required: ['category_code'],
    },
    // Marks the end of the tools block as a cache breakpoint — tiny on its
    // own, but it's processed before the (much larger) cached system prompt,
    // so caching it too avoids invalidating that larger cache on every call.
    cache_control: { type: 'ephemeral', ttl: '1h' },
  },
]

type QueryTransactionsInput = {
  category_code?: string
  vendor_contains?: string
  concept_contains?: string
  from?: string
  to?: string
  min_amount?: number
  movement_type?: 'expense' | 'income' | 'cash_withdrawal'
  limit?: number
}

async function queryTransactions(admin: AdminClient, userId: string, input: QueryTransactionsInput) {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 200)
  let q = admin
    .from('transactions')
    .select('date, amount, concept, vendor, category_code, movement_type, expense_group, notes, detail')
    .eq('user_id', userId)
    .not('amount', 'is', null)
    .order('date', { ascending: false })
    .range(0, limit - 1)

  if (input.category_code) q = q.eq('category_code', input.category_code)
  if (input.vendor_contains) q = q.ilike('vendor', `%${input.vendor_contains}%`)
  if (input.concept_contains) q = q.ilike('concept', `%${input.concept_contains}%`)
  if (input.from) q = q.gte('date', input.from)
  if (input.to) q = q.lt('date', input.to)
  if (input.min_amount) q = q.gte('amount', input.min_amount)
  if (input.movement_type) q = q.eq('movement_type', input.movement_type)

  const { data, error } = await q
  if (error) return { error: error.message }

  const rows = data ?? []
  return {
    count: rows.length,
    total_crc: rows.reduce((s, r) => s + Number(r.amount ?? 0), 0),
    transactions: rows,
  }
}

type MonthlyCategoryInput = {
  category_code: string
  months?: number
}

async function getMonthlyCategoryTotals(admin: AdminClient, userId: string, input: MonthlyCategoryInput) {
  if (!input.category_code) return { error: 'category_code es requerido' }
  const months = Math.min(Math.max(input.months ?? 24, 3), 48)
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - months, 1)
  const startStr = start.toISOString().slice(0, 10)

  const { data, error } = await admin
    .from('transactions')
    .select('date, amount, concept, vendor, movement_type')
    .eq('user_id', userId)
    .eq('category_code', input.category_code)
    .in('movement_type', ['expense', 'cash_withdrawal'])
    .gte('date', startStr)
    .not('amount', 'is', null)
    .range(0, 4999)

  if (error) return { error: error.message }

  const rows = (data ?? []).map(r => ({ ...r, amount: Number(r.amount ?? 0) }))
  const amounts = rows.map(r => r.amount).filter(a => a > 0)
  const sortedAmounts = [...amounts].sort((a, b) => a - b)
  const globalP95 = sortedAmounts.length > 0 ? sortedAmounts[Math.floor(sortedAmounts.length * 0.95)] : Infinity
  const fence = outlierFence(amounts, globalP95)

  const byMonth: Record<string, {
    total_crc: number
    cleaned_total_crc: number
    count: number
    outliers: { date: string; amount_crc: number; concept: string | null; vendor: string | null }[]
  }> = {}

  for (const r of rows) {
    const m = (r.date ?? '').slice(0, 7)
    if (!m) continue
    byMonth[m] ??= { total_crc: 0, cleaned_total_crc: 0, count: 0, outliers: [] }
    byMonth[m].total_crc += r.amount
    byMonth[m].count += 1
    if (r.amount > fence) {
      byMonth[m].outliers.push({ date: r.date!, amount_crc: r.amount, concept: r.concept, vendor: r.vendor })
    } else {
      byMonth[m].cleaned_total_crc += r.amount
    }
  }

  const monthly = Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, ...v }))

  return {
    category_code: input.category_code,
    outlier_fence_crc: fence,
    note: 'total_crc = suma cruda del mes. cleaned_total_crc = suma sin las transacciones marcadas como atípicas. outliers = transacciones excluidas ese mes con su detalle exacto.',
    monthly,
  }
}

export async function executeOracleTool(
  admin: AdminClient,
  userId: string,
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  if (name === 'query_transactions') return queryTransactions(admin, userId, input as QueryTransactionsInput)
  if (name === 'get_monthly_category_totals') return getMonthlyCategoryTotals(admin, userId, input as MonthlyCategoryInput)
  return { error: `Tool desconocida: ${name}` }
}
