import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { fetchExchangeRate } from '@/lib/exchange-rate'
import { ProgresoView } from './ProgresoView'
import { isLoanPayment } from '../resumen/categoryUtils'
import { buildRootCodeMap, cleanLifestyleOutliers, cleanSurvivalOutliers, avgMonthlyInWindow, outlierFence, computeGlobalP95, isExtraLoanPrincipalPayment } from '@/lib/lifestyleExpenses'
import { GENERIC_PASSIVE_CATEGORIES, normalizeVendorKey } from '@/lib/passiveIncomeCategory'
import { computeEnvelopeBalances } from '@/lib/envelopeBalances'

type ConceptMap = {
  depositConcepts: string[]
  rendimientosConcepts: string[]
  valorizacionConcepts: string[]
  liquidacionConcepts: string[]
}

function isValuation(concept: string | null) {
  return /p[eé]rdida\s*valor|aumento\s*valor/i.test(concept ?? '')
}

// The bare 'SAVINGS' code ("Ahorro") doesn't start with 'SAVINGS_' — a
// `.startsWith('SAVINGS_')` check silently excludes it. Real money: ₡7.37M
// across 99 transactions in this account, invisible to the savings rate
// until this helper replaced that check everywhere.
function isSavingsCategoryCode(code: string | null | undefined): boolean {
  return code === 'SAVINGS' || (code ?? '').startsWith('SAVINGS_')
}


// Within objetivos_financieros, which SAVINGS_* codes have market exposure
// (inversión, expected return) vs just sit liquid (ahorro puro).
const INVERSION_CATEGORY_CODES = new Set(['SAVINGS_INVESTMENT', 'SAVINGS_PENSION'])

export default async function ProgresoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  // Strictly last 12 complete months (excludes current partial month)
  const now = new Date()
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const rolling12Start    = new Date(now.getFullYear(), now.getMonth() - 12, 1)
  const rolling12StartStr = rolling12Start.toISOString().slice(0, 10)
  const rolling12EndStr   = currentMonthStart.toISOString().slice(0, 10)

  const [
    { data: fireConfig },
    { data: bucketRows },
    { data: txs },
    { data: movements },
    { data: envelopes },
    { data: assetRows },
    { data: snapshotRows },
    { data: categories },
    { data: savingsBudgets },
  ] = await Promise.all([
    admin.from('user_financial_config').select('*').eq('user_id', user.id).maybeSingle(),
    admin.from('user_investment_buckets')
      .select('id, name, bucket_type, vendors, concept_map, account_id')
      .eq('user_id', user.id).eq('is_active', true),
    admin.from('transactions')
      .select('vendor, concept, movement_type, expense_group, is_settlement, is_passive_income, is_survival_expense, amount, date, category_code, investment_bucket_id, notes, detail')
      .eq('user_id', user.id)
      .not('amount', 'is', null)
      .range(0, 49999),
    admin.from('envelope_movements')
      .select('amount, movement_type, envelope_id, date, notes')
      .eq('user_id', user.id),
    admin.from('savings_envelopes')
      .select('id, name, parent_envelope_id, envelope_type')
      .eq('user_id', user.id).eq('is_active', true),
    admin.from('assets')
      .select('value_crc, is_investable')
      .eq('user_id', user.id).eq('is_active', true),
    admin.from('net_worth_snapshots')
      .select('snapshot_date, net_worth_crc, invested_crc, liquid_crc')
      .eq('user_id', user.id)
      .order('snapshot_date', { ascending: true }),
    admin.from('transaction_categories')
      .select('code, name, group_gasto, parent_code')
      .eq('is_active', true)
      .order('sort_order'),
    // Ground truth for "is this envelope actually a savings/investment
    // goal" — envelope_type is null on most envelopes (only 6 of ~33 carry
    // emergencia/meta_especifica), but the budget the user built themselves
    // already tags each envelope-linked budget line as savings/expense/
    // income. "Ahorro impuestos casa", "Sita paseos", "Vacaciones", etc.
    // are budget_type='savings' with no envelope_type — real savings the
    // old emergencia/meta_especifica-only filter was silently dropping.
    admin.from('budgets')
      .select('envelope_id')
      .eq('user_id', user.id)
      .eq('budget_type', 'savings')
      .not('envelope_id', 'is', null),
  ])

  // FU Money chart: exclude locked retirement funds (ROP & FCL, Pensión
  // Voluntaria — not accessible before retirement age without penalty) from
  // the "invertido" side of the numerator. Everything else stays untouched
  // (FIRE number, activos invertibles, etc. still count them as real net worth).
  const lockedBucketIds = (bucketRows ?? [])
    .filter(b => b.name === 'ROP & FCL' || b.name === 'Pensión Voluntaria')
    .map(b => b.id)
  const { data: lockedYieldRows } = lockedBucketIds.length > 0
    ? await admin.from('investment_yield_history')
        .select('bucket_id, year_month, invested_usd, exchange_rate')
        .in('bucket_id', lockedBucketIds)
        .order('year_month', { ascending: true })
    : { data: [] as { bucket_id: string; year_month: string; invested_usd: number; exchange_rate: number }[] }

  const lockedInvestedByMonth: Record<string, number> = {}
  for (const r of lockedYieldRows ?? []) {
    const ym = String(r.year_month).slice(0, 7)
    lockedInvestedByMonth[ym] = (lockedInvestedByMonth[ym] ?? 0) + Number(r.invested_usd) * Number(r.exchange_rate)
  }

  // Snapshot-based bucket balances
  const snapshotBuckets = (bucketRows ?? []).filter(b => b.bucket_type === 'snapshot_based' && b.account_id)
  const snapshotResults = await Promise.all(
    snapshotBuckets.map(async b => {
      const { data } = await admin
        .from('account_balance_snapshots')
        .select('real_balance')
        .eq('account_id', b.account_id!)
        .order('snapshot_date', { ascending: false })
        .limit(1).maybeSingle()
      return { id: b.id, balance: data?.real_balance ? Number(data.real_balance) : 0 }
    })
  )
  const snapshotBalances: Record<string, number> = Object.fromEntries(snapshotResults.map(r => [r.id, r.balance]))

  // Liquid balance (leaf envelopes only)
  const parentEnvelopeIds = new Set(
    (envelopes ?? []).filter(e => e.parent_envelope_id !== null).map(e => e.parent_envelope_id as string)
  )
  const liquidBalance = (movements ?? [])
    .filter(m => m.movement_type !== 'interes' && !parentEnvelopeIds.has(m.envelope_id))
    .reduce((s, m) => s + Number(m.amount), 0)

  // Total invested (same logic as patrimonio page)
  let totalInvested = 0
  for (const def of bucketRows ?? []) {
    if (def.bucket_type === 'snapshot_based') {
      totalInvested += snapshotBalances[def.id] ?? 0
      continue
    }
    let deposits = 0, liquidaciones = 0, rendimientos = 0, passiveValuation = 0
    for (const tx of txs ?? []) {
      const amt = Number(tx.amount ?? 0)
      if (def.bucket_type === 'concept_based' && def.concept_map) {
        const cm = def.concept_map as unknown as ConceptMap
        const c = tx.concept ?? ''
        if ((tx as { investment_bucket_id?: string | null }).investment_bucket_id === def.id) {
          if (tx.movement_type === 'income' && tx.is_settlement) liquidaciones += amt
          else if (tx.expense_group === 'objetivos_financieros' && !tx.is_settlement) deposits += amt
        } else if (cm.depositConcepts.includes(c))           deposits += amt
        else if (cm.rendimientosConcepts.includes(c))  rendimientos += amt
        else if (cm.valorizacionConcepts.includes(c))  passiveValuation += amt
        else if (cm.liquidacionConcepts.includes(c))   liquidaciones += amt
      } else if (def.bucket_type === 'vendor_based') {
        const txVendor = (tx.vendor ?? '').toLowerCase().trim()
        const vendors = (def.vendors ?? []).map((v: string) => v.toLowerCase())
        if (!vendors.includes(txVendor)) continue
        if (tx.expense_group === 'objetivos_financieros' && !tx.is_settlement) deposits += amt
        else if (tx.is_settlement)                                               liquidaciones += amt
        else if (tx.is_passive_income && tx.movement_type === 'income')          rendimientos += amt
        else if (tx.is_passive_income && !tx.movement_type)                      passiveValuation += amt
      }
    }
    totalInvested += deposits + passiveValuation + rendimientos - liquidaciones
  }

  const iliquidInvestable = (assetRows ?? [])
    .filter(a => a.is_investable)
    .reduce((s, a) => s + Number(a.value_crc), 0)

  const activosInvertibles = liquidBalance + totalInvested + iliquidInvestable

  // Strictly last 12 complete months
  const recent = (txs ?? []).filter(tx =>
    tx.date && tx.date >= rolling12StartStr && tx.date < rolling12EndStr
  )

  // ── cleanedLifestyleTxs prep ─────────────────────────────────────────────
  // Built early so Runway/FIRE below reuse the same outlier-cleaned set as the
  // Lifestyle Inflation section — one purchase (e.g. a car) used to be able to
  // inflate avgMonthlyExpenses by 25%+ on its own even though the Inflation
  // section already had IQR-based cleaning for exactly this. Shared with the
  // dashboard's runway alert banner via @/lib/lifestyleExpenses so the two
  // can't drift apart again.
  const MONTH_LABELS_LIFESTYLE = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  const catNameMap  = new Map<string, string>()  // code → display name
  for (const cat of categories ?? []) {
    catNameMap.set(cat.code, cat.name)
  }
  const getRootCode = buildRootCodeMap((categories ?? []) as { code: string; parent_code?: string | null }[])

  const liCurEnd   = new Date(now.getFullYear(), now.getMonth(), 1)
  const liCurStart = new Date(now.getFullYear(), now.getMonth() - 12, 1)
  const liPrvStart = new Date(now.getFullYear(), now.getMonth() - 24, 1)
  const liCurEndStr   = liCurEnd.toISOString().slice(0, 10)
  const liCurStartStr = liCurStart.toISOString().slice(0, 10)
  const liPrvStartStr = liPrvStart.toISOString().slice(0, 10)

  // Top categories — two-pass outlier removal for fair YoY comparison:
  // Pass 1 (tx-level): remove single large one-off purchases per category (el sofá)
  // Pass 2 (monthly): remove atypical months from cleaned totals (el viaje)

  const toYM = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  const allYMs = Array.from({ length: 24 }, (_, i) =>
    toYM(new Date(liPrvStart.getFullYear(), liPrvStart.getMonth() + i, 1))
  )
  const curYMs = allYMs.slice(12)
  const prvYMs = allYMs.slice(0, 12)

  // Pass 1: tx-level outlier fence, computed from the user's full history
  const { cleaned: cleanedLifestyleTxs, excludedByRoot: rootTxExcluded } =
    cleanLifestyleOutliers(txs ?? [], getRootCode)

  // Lifestyle expenses: excludes savings/investments (objetivos_financieros), loan
  // payments, and outlier transactions (a car purchase, etc.) — same cleaning as
  // the Lifestyle Inflation section, so Runway/FIRE aren't skewed by one-off buys
  const avgMonthlyExpenses = avgMonthlyInWindow(cleanedLifestyleTxs, rolling12StartStr, rolling12EndStr)

  // Survival expenses: trust the user's is_survival_expense tags directly,
  // then run the same per-root-category outlier fence as the lifestyle set
  // (@/lib/lifestyleExpenses) — a one-off large purchase tagged as survival
  // (e.g. an emergency repair) shouldn't skew this any more than it's
  // allowed to skew avgMonthlyExpenses above. The regular mortgage/loan
  // installment IS a real monthly obligation and stays in — but an
  // extraordinary/discretionary paydown is exactly the kind of thing you'd
  // stop making in a real emergency, so it's excluded the same way it's
  // excluded from the main Runway.
  const { cleaned: cleanedSurvivalTxs } = cleanSurvivalOutliers(txs ?? [], getRootCode)
  const avgMonthlySurvivalExpenses = avgMonthlyInWindow(cleanedSurvivalTxs, rolling12StartStr, rolling12EndStr)

  // Include settlement income — salary may be tagged as settlement in some setups
  const avgMonthlyIncome = recent
    .filter(tx => tx.movement_type === 'income' && !tx.is_passive_income)
    .reduce((s, tx) => s + Number(tx.amount ?? 0), 0) / 12

  // Savings envelopes: leaf envelopes tagged 'emergencia' or 'meta_especifica'
  // (e.g. Emma, Mariam, FU Money, Reserva hipoteca SP), UNIONED with any
  // envelope the user's own budget already tags budget_type='savings' —
  // most savings envelopes (Ahorro impuestos casa, Sita paseos, Vacaciones,
  // Felipe Ahorro salidas...) never got an envelope_type set, so the old
  // type-only filter silently dropped them from every ahorro calculation.
  const budgetSavingsEnvelopeIds = new Set(
    (savingsBudgets ?? []).map(b => b.envelope_id).filter((id): id is string => !!id)
  )
  const savingsEnvelopeIds = new Set(
    (envelopes ?? [])
      .filter(e =>
        (e as { envelope_type?: string | null }).envelope_type === 'emergencia' ||
        (e as { envelope_type?: string | null }).envelope_type === 'meta_especifica' ||
        budgetSavingsEnvelopeIds.has(e.id)
      )
      .map(e => e.id)
  )
  const envelopeNameMap = new Map(
    (envelopes ?? []).map(e => [e.id, (e as { name?: string | null }).name ?? 'Sobre'])
  )

  // Saldos en sobres — balance evolution, not flow. Same savings envelopes
  // as above, but shown as current balance vs. 12 months ago (goal
  // progress), using the canonical balance rule shared with /liquidez and
  // /auditoria instead of re-deriving it. This is where envelope activity
  // belongs now that Ahorro/Inversión is transaction-only.
  const currentEnvBalances = computeEnvelopeBalances(envelopes ?? [], movements ?? [])
  const priorMovements = (movements ?? []).filter(m =>
    (m as { date?: string | null }).date && (m as { date: string }).date < rolling12StartStr
  )
  const priorEnvBalances = computeEnvelopeBalances(envelopes ?? [], priorMovements)
  const sobresBalances = [...savingsEnvelopeIds]
    .map(id => {
      const balance = currentEnvBalances.ownBalance[id] ?? 0
      const change12m = balance - (priorEnvBalances.ownBalance[id] ?? 0)
      return { name: envelopeNameMap.get(id) ?? 'Sobre', balance, change12m }
    })
    .filter(e => e.balance !== 0 || e.change12m !== 0)
    .sort((a, b) => b.balance - a.balance)

  // Actual investment deposits — SAVINGS_* categories and extra/discretionary
  // loan principal paydowns only. Deliberately transaction-only, not mixed
  // with envelope_movements: a transaction is a flow event (money that moved
  // THIS month), while an envelope's balance change can reflect money saved
  // years ago being spent now, a self-loan cycling between the user's own
  // envelopes, or a balance-restoration artifact — none of which answer "how
  // much did I save this month." Envelope balances get their own section
  // (Saldos en sobres) instead of being folded into this flow-based number.
  // No outlier removal: real estate and large one-off purchases ARE genuine
  // investments and should count.
  const avgMonthlyDeposits = recent
    .filter(tx =>
      (tx.movement_type === 'expense' || tx.movement_type === 'cash_withdrawal') &&
      !tx.is_settlement &&
      !/p[eé]rdida\s*valor|aumento\s*valor|valorizaci[oó]n/i.test(tx.concept ?? '') &&
      (
        (tx.expense_group === 'objetivos_financieros' && isSavingsCategoryCode(tx.category_code)) ||
        isExtraLoanPrincipalPayment(tx.concept, tx.category_code)
      )
    )
    .reduce((s, tx) => s + Number(tx.amount ?? 0), 0) / 12

  // A "rendimiento" counts as passive income whether it landed as cash
  // ("Cobrado", movement_type 'income') or stayed compounding in the fund/
  // wallet ("Valorización — se reinvirtió", movement_type null) — both are
  // real yield the user earned. Only category_code 'APPRECIATION' (pure
  // unrealized mark-to-market, e.g. "Aumento de valor Criptomonedas") is a
  // paper gain rather than earned income, so that one stays excluded.
  // (Previously this required movement_type === 'income', which silently
  // dropped nearly all reinvested TRANSCOMER/crypto-farming yield — the
  // "¿por qué tan bajo?" the user flagged.)
  // A few valuation entries were imported under the generic PASSIVE_INCOME
  // code instead of APPRECIATION (e.g. "Aumento de valor Criptomonedas") —
  // isValuation catches those by concept text so they don't sneak back in.
  const isRealizedPassiveIncome = (tx: { is_passive_income: boolean | null; is_settlement: boolean | null; category_code: string | null; concept: string | null }) =>
    !!tx.is_passive_income && !tx.is_settlement && tx.category_code !== 'APPRECIATION' && !isValuation(tx.concept)

  const passiveIncome12m = recent
    .filter(isRealizedPassiveIncome)
    .reduce((s, tx) => s + Number(tx.amount ?? 0), 0)
  const passiveCashCobrado12m = recent
    .filter(tx => isRealizedPassiveIncome(tx) && tx.movement_type === 'income')
    .reduce((s, tx) => s + Number(tx.amount ?? 0), 0)
  const passiveReinvested12m = passiveIncome12m - passiveCashCobrado12m

  // ── Ingresos pasivos: fuentes, tendencia y diversificación ─────────────────
  // Full history (not just `recent`'s 12m window) so the trend chart and the
  // YoY comparison below have real prior-year data to compare against.
  const passiveTxsAll = (txs ?? []).filter(isRealizedPassiveIncome)

  const passiveIncomePrev12m = passiveTxsAll
    .filter(tx => tx.date && prvYMs.includes(tx.date.slice(0, 7)))
    .reduce((s, tx) => s + Number(tx.amount ?? 0), 0)
  const passiveYoyPct = passiveIncomePrev12m > 0
    ? ((passiveIncome12m - passiveIncomePrev12m) / passiveIncomePrev12m) * 100
    : null

  // Sub-source disaggregation — deliberately generic, not crypto-specific,
  // so a brand-new investment bucket or a source we've never audited gets
  // the same treatment for free: no per-category allowlist to keep updated.
  // 1) If `notes` OR `detail` names the reward mechanism (the user always
  //    writes this by hand — "LP fees btc-hype", "Airdrop Aligned" —
  //    regardless of category), use that. These are two DIFFERENT columns
  //    fed by two different paths: the app's manual-entry form writes to
  //    `notes`, while the Google-Sheets sync writes the sheet's "Detalle"
  //    column to `detail` and reserves `notes` for its own
  //    "CATEGORY_UNMAPPED:" bookkeeping — so a sheet-synced row's real
  //    hand-written description lives in `detail`, not `notes`. Missing
  //    this was why sheet-synced crypto rows kept falling back to vendor
  //    even though the user always filled in the reward type.
  // 2) Otherwise fall back to vendor/protocol — this is what separates
  //    TRANSCOMER from Dominion/Meatex/SH Mining/Multimoney (all share the
  //    category_code INVESTMENT_RETURN) and one rental property from
  //    another (RENTAL_INCOME has 4 distinct vendors in this account).
  function passiveSubtype(notes: string | null, detail: string | null): string | null {
    const n = `${notes ?? ''} ${detail ?? ''}`.toLowerCase()
    if (/airdrop/.test(n))        return 'Airdrops'
    if (/lp\s*fees?/.test(n))     return 'LP fees'
    if (/staking/.test(n))        return 'Staking'
    if (/mineria|miner[ií]a|mining/.test(n)) return 'Minería'
    if (/nodo/.test(n))           return 'Nodos'
    return null
  }

  // Data drift correction #1: some entries (mostly AI-parsed quick-entry,
  // by the look of the dates) land on a generic catch-all category_code
  // (PASSIVE_INCOME, MISC_INCOME) instead of the specific one the same
  // vendor otherwise uses — e.g. 6 TRANSCOMER rows tagged PASSIVE_INCOME
  // while 57 others from the same vendor are INVESTMENT_RETURN. Rather than
  // hardcode "TRANSCOMER → INVESTMENT_RETURN", derive each vendor's
  // dominant *specific* category from its own history and use that instead
  // of the generic one — self-healing for any future vendor, not just the
  // ones audited today.
  const vendorCategoryVotes: Record<string, Record<string, number>> = {}
  for (const tx of passiveTxsAll) {
    if (!tx.vendor || !tx.category_code || GENERIC_PASSIVE_CATEGORIES.has(tx.category_code)) continue
    const key = normalizeVendorKey(tx.vendor)
    vendorCategoryVotes[key] ??= {}
    vendorCategoryVotes[key][tx.category_code] = (vendorCategoryVotes[key][tx.category_code] ?? 0) + Number(tx.amount ?? 0)
  }
  const vendorDominantCategory: Record<string, string> = {}
  for (const [key, votes] of Object.entries(vendorCategoryVotes)) {
    vendorDominantCategory[key] = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0]
  }
  function resolveCategoryCode(tx: { category_code: string | null; vendor: string | null }): string | null {
    if (tx.category_code && GENERIC_PASSIVE_CATEGORIES.has(tx.category_code) && tx.vendor) {
      const resolved = vendorDominantCategory[normalizeVendorKey(tx.vendor)]
      if (resolved) return resolved
    }
    return tx.category_code
  }

  // Data drift correction #2: the same protocol/vendor sometimes appears
  // under multiple spellings ("Bluefin"/"BlueFin", "Pancake Swap"/
  // "PancakeSwap", "etherfi"/"Etherfi"/"Ether Fi") — normalize the grouping
  // key so they don't fragment the drill-down, and display whichever
  // spelling carries the largest amount as the canonical label.
  const vendorDisplayTotals: Record<string, Record<string, number>> = {}
  for (const tx of passiveTxsAll) {
    if (!tx.vendor) continue
    const key = normalizeVendorKey(tx.vendor)
    vendorDisplayTotals[key] ??= {}
    const label = tx.vendor.trim()
    vendorDisplayTotals[key][label] = (vendorDisplayTotals[key][label] ?? 0) + Number(tx.amount ?? 0)
  }
  const vendorCanonicalLabel: Record<string, string> = {}
  for (const [key, labels] of Object.entries(vendorDisplayTotals)) {
    vendorCanonicalLabel[key] = Object.entries(labels).sort((a, b) => b[1] - a[1])[0][0]
  }

  // Sources — top level is grouped by TYPE of passive income (catNameMap
  // from transaction_categories, after resolving drifted generic codes
  // above), matching how the user thinks about this ("¿de qué TIPO viene mi
  // ingreso pasivo?"), not by vendor. Vendor/notes subtype becomes
  // drill-down detail on demand instead of flattening everything together.
  const passiveSourceMap: Record<string, number> = {}
  const passiveSubMap: Record<string, Record<string, number>> = {}
  for (const tx of passiveTxsAll) {
    if (!tx.date || !curYMs.includes(tx.date.slice(0, 7))) continue
    const resolvedCode = resolveCategoryCode(tx)
    const baseName = (resolvedCode && catNameMap.get(resolvedCode))
      || resolvedCode
      || tx.concept
      || tx.vendor
      || 'Otros'
    const vendorLabel = tx.vendor && !/^na$/i.test(tx.vendor.trim())
      ? vendorCanonicalLabel[normalizeVendorKey(tx.vendor)]
      : null
    const subName = passiveSubtype(tx.notes, tx.detail) || vendorLabel || baseName
    const amt = Number(tx.amount ?? 0)
    passiveSourceMap[baseName] = (passiveSourceMap[baseName] ?? 0) + amt
    passiveSubMap[baseName] ??= {}
    passiveSubMap[baseName][subName] = (passiveSubMap[baseName][subName] ?? 0) + amt
  }
  // Values are shown as a monthly average (12m total ÷ 12) — a "typical
  // month" reads much more naturally than a 12-month lump sum.
  const passiveSources = Object.entries(passiveSourceMap)
    .sort((a, b) => b[1] - a[1])
    .map(([name, amount12m]) => {
      const subEntries = Object.entries(passiveSubMap[name] ?? {})
        .sort((a, b) => b[1] - a[1])
        .map(([subName, subAmount12m]) => ({
          name: subName,
          amountMonthly: subAmount12m / 12,
          pct: amount12m > 0 ? (subAmount12m / amount12m) * 100 : 0,
        }))
      // Nothing to drill into when the only "sub-source" is the category itself.
      const subSources = subEntries.length === 1 && subEntries[0].name === name ? [] : subEntries
      return {
        name,
        amountMonthly: amount12m / 12,
        pct: passiveIncome12m > 0 ? (amount12m / passiveIncome12m) * 100 : 0,
        subSources,
      }
    })
  // Concentration risk: how much of the total rides on the single biggest
  // source — a useful diversification signal independent of the amount.
  const passiveTopSourcePct = passiveSources[0]?.pct ?? 0

  // 24-month trend, same month range as the Lifestyle Inflation section above.
  const passiveTrend = allYMs.map(ym => {
    const [y, m] = ym.split('-')
    const amount = passiveTxsAll
      .filter(tx => tx.date?.startsWith(ym))
      .reduce((s, tx) => s + Number(tx.amount ?? 0), 0)
    return { label: `${MONTH_LABELS_LIFESTYLE[Number(m) - 1]} ${y.slice(2)}`, amount }
  })

  // Yield: passive income / avg invested (last 12 snapshots) — avoids point-in-time outliers
  const last12Snapshots = (snapshotRows ?? []).slice(-12)
  const avgInvestedCrc = last12Snapshots.length > 0
    ? last12Snapshots.reduce((s, r) => s + Number(r.invested_crc ?? 0), 0) / last12Snapshots.length
    : 0
  const realizedReturnRate = avgInvestedCrc > 0 && passiveIncome12m > 0
    ? passiveIncome12m / avgInvestedCrc
    : null

  // FIRE metrics
  const swr        = fireConfig?.fire_withdrawal_rate   ?? 0.04
  // targetExp stays lifestyle-only: in retirement the loans are paid off
  const targetExp  = fireConfig?.fire_target_monthly_exp ?? avgMonthlyExpenses
  const expReturn  = fireConfig?.fire_expected_return   ?? 0.07
  const inflation  = fireConfig?.fire_inflation_rate    ?? 0.04
  const fireNumber = targetExp > 0 ? (targetExp * 12) / swr : 0
  const fireProgress = fireNumber > 0 ? activosInvertibles / fireNumber : 0
  // Runway uses total monthly obligations: lifestyle + loan payments.
  // Only the regular scheduled installment counts here — extraordinary/
  // discretionary principal paydowns are the first thing to stop in a
  // real cash crunch, so they don't belong in what runway is meant to
  // measure (they already count toward avgMonthlyDeposits as savings).
  const avgMonthlyLoanPayments = recent
    .filter(tx =>
      (tx.movement_type === 'expense' || tx.movement_type === 'cash_withdrawal') &&
      isLoanPayment(tx.vendor, tx.concept, tx.category_code) &&
      !isExtraLoanPrincipalPayment(tx.concept, tx.category_code)
    )
    .reduce((s, tx) => s + Number(tx.amount ?? 0), 0) / 12
  const avgMonthlyObligations  = avgMonthlyExpenses + avgMonthlyLoanPayments
  const avgMonthlyPassiveIncome = passiveIncome12m / 12
  // Share of TOTAL income (active + passive) that's passive — a diversification
  // gauge distinct from the FI/FS ratios below (which compare against expenses,
  // not income): this one tracks how much you still depend on active work.
  const passiveToIncomeRatio = (avgMonthlyIncome + avgMonthlyPassiveIncome) > 0
    ? avgMonthlyPassiveIncome / (avgMonthlyIncome + avgMonthlyPassiveIncome)
    : 0
  const avgNetBurn = Math.max(avgMonthlyObligations - avgMonthlyPassiveIncome, 0)
  const runway = avgNetBurn > 0
    ? liquidBalance / avgNetBurn
    : avgMonthlyObligations > 0 ? liquidBalance / avgMonthlyObligations : 0

  // Survival runway: how long liquidity lasts against the bare-minimum burn
  // if lifestyle spending got cut in a real emergency/job loss — vs. `runway`
  // above, which assumes spending stays exactly as-is. avgMonthlySurvivalExpenses
  // already includes the regular loan installment (via is_survival_expense),
  // so it isn't added again here.
  const avgSurvivalNetBurn = Math.max(avgMonthlySurvivalExpenses - avgMonthlyPassiveIncome, 0)
  const runwaySurvival = avgSurvivalNetBurn > 0
    ? liquidBalance / avgSurvivalNetBurn
    : avgMonthlySurvivalExpenses > 0 ? liquidBalance / avgMonthlySurvivalExpenses : 0

  const leanFireNumber = avgMonthlySurvivalExpenses > 0
    ? (avgMonthlySurvivalExpenses * 12) / swr
    : 0

  // Year-by-year forecast
  const monthlyReturn     = Math.pow(1 + expReturn, 1 / 12) - 1
  const avgMonthlySavings = avgMonthlyDeposits
  const forecastYears: { year: number; balance: number }[] = []

  if (fireNumber > 0) {
    let balance = activosInvertibles
    for (let y = 0; y <= 40; y++) {
      forecastYears.push({ year: y, balance })
      if (balance >= fireNumber && y > 0) break
      for (let m = 0; m < 12; m++) {
        balance = balance * (1 + monthlyReturn) + avgMonthlySavings
      }
    }
  }

  const exchangeRate = await fetchExchangeRate()

  // ── Lifestyle Inflation ────────────────────────────────────────────────────
  // (category hierarchy + outlier-cleaned tx set now built earlier — see
  // "cleanedLifestyleTxs prep" above — and reused by Runway/FIRE too)

  // Headline totals use cleaned transactions for consistency with per-category YoY%
  const liCurTotal = cleanedLifestyleTxs
    .filter(tx => tx.date && tx.date >= liCurStartStr && tx.date < liCurEndStr)
    .reduce((s, tx) => s + Number(tx.amount ?? 0), 0)
  const liPrvTotal = cleanedLifestyleTxs
    .filter(tx => tx.date && tx.date >= liPrvStartStr && tx.date < liCurStartStr)
    .reduce((s, tx) => s + Number(tx.amount ?? 0), 0)

  // Monthly trend — last 12 complete months (uses cleaned txs, outliers excluded)
  type LiMonth = { label: string; necesario: number; personal: number }
  const liMonthly: LiMonth[] = []
  for (let i = 11; i >= 0; i--) {
    const d   = new Date(now.getFullYear(), now.getMonth() - 1 - i, 1)
    const ym  = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const lbl = `${MONTH_LABELS_LIFESTYLE[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`
    const monthTxs = cleanedLifestyleTxs.filter(tx => tx.date?.slice(0, 7) === ym)
    liMonthly.push({
      label:     lbl,
      necesario: monthTxs.filter(tx => tx.expense_group === 'necesario').reduce((s, tx) => s + Number(tx.amount ?? 0), 0),
      personal:  monthTxs.filter(tx => tx.expense_group === 'personal').reduce((s, tx) => s + Number(tx.amount ?? 0), 0),
    })
  }

  // Pass 2: build monthly totals from cleaned transactions
  const rootMonthly: Record<string, Record<string, number>> = {}
  for (const tx of cleanedLifestyleTxs) {
    const root   = getRootCode(tx.category_code ?? '__na__')
    const month  = tx.date?.slice(0, 7)
    const amount = Number(tx.amount ?? 0)
    if (!month) continue
    if (!rootMonthly[root]) rootMonthly[root] = {}
    rootMonthly[root][month] = (rootMonthly[root][month] ?? 0) + amount
  }

  // Pass 3: monthly IQR on cleaned totals
  const liGlobalP95 = computeGlobalP95(cleanedLifestyleTxs)
  const liTopCats = Object.entries(rootMonthly)
    .filter(([, monthly]) => curYMs.some(m => (monthly[m] ?? 0) > 0))
    .map(([code, monthly]) => {
      const fence         = outlierFence(allYMs.map(m => monthly[m] ?? 0), liGlobalP95)
      const monthOutliers = new Set(allYMs.filter(m => (monthly[m] ?? 0) > fence))
      const curSum        = curYMs.filter(m => !monthOutliers.has(m)).reduce((s, m) => s + (monthly[m] ?? 0), 0)
      const prvSum        = prvYMs.filter(m => !monthOutliers.has(m)).reduce((s, m) => s + (monthly[m] ?? 0), 0)
      return {
        code,
        name:         catNameMap.get(code) ?? code,
        curAvg:       curSum / 12,
        yoyPct:       prvSum > 0 ? (curSum - prvSum) / prvSum : null,
        outlierCount: (rootTxExcluded[code] ?? 0) + monthOutliers.size,
      }
    })
    .filter(c => c.curAvg > 0)
    .sort((a, b) => b.curAvg - a.curAvg)
    .slice(0, 8)

  // Driver breakdown: group by concept using cleaned transactions (outliers excluded)
  const liTopCatsWithDrivers = liTopCats.map(cat => {
    const catTxs = cleanedLifestyleTxs.filter(tx =>
      getRootCode(tx.category_code ?? '__na__') === cat.code
    )
    const subSums: Record<string, { cur: number; prv: number }> = {}
    for (const tx of catTxs) {
      const key = tx.concept?.trim()
        || catNameMap.get(tx.category_code ?? '')
        || tx.vendor?.trim()
        || '(sin etiqueta)'
      if (!subSums[key]) subSums[key] = { cur: 0, prv: 0 }
      if (tx.date && tx.date >= liCurStartStr && tx.date < liCurEndStr)   subSums[key].cur += Number(tx.amount ?? 0)
      if (tx.date && tx.date >= liPrvStartStr && tx.date < liCurStartStr) subSums[key].prv += Number(tx.amount ?? 0)
    }
    const drivers = Object.entries(subSums)
      .filter(([, v]) => v.cur > 0 || v.prv > 0)
      .map(([key, v]) => ({
        key,
        curAvg: v.cur / 12,
        prvAvg: v.prv / 12,
        yoyPct: v.prv > 0 ? (v.cur - v.prv) / v.prv : null,
      }))
      .sort((a, b) => b.curAvg - a.curAvg)
      .slice(0, 8)
    return { ...cat, drivers }
  })

  // Wealth Delta: monthly NW attribution for last 12 complete months
  const MONTH_LABELS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

  // Group snapshots by year-month (first-of-month date = NW at start of that month)
  const snapByYM: Record<string, number> = {}
  for (const s of snapshotRows ?? []) {
    const ym = (s.snapshot_date as string).slice(0, 7)
    snapByYM[ym] = Number(s.net_worth_crc)
  }

  type WealthDeltaMonth = {
    ym: string; label: string
    delta: number; savings: number; returns: number; residual: number
  }
  const wealthDelta: WealthDeltaMonth[] = []

  for (let i = 12; i >= 1; i--) {
    const d     = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const nextD = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    const ym     = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const ymNext = `${nextD.getFullYear()}-${String(nextD.getMonth() + 1).padStart(2, '0')}`

    const nwStart = snapByYM[ym]
    const nwEnd   = snapByYM[ymNext]
    if (nwStart == null || nwEnd == null) continue

    const delta = nwEnd - nwStart

    const savings = (txs ?? []).filter(tx =>
      (tx.date as string | null)?.slice(0, 7) === ym &&
      tx.expense_group === 'objetivos_financieros' &&
      !tx.is_settlement &&
      (tx.movement_type === 'expense' || tx.movement_type === 'cash_withdrawal')
    ).reduce((s, tx) => s + Number(tx.amount ?? 0), 0)

    const passiveIncome = (txs ?? []).filter(tx =>
      (tx.date as string | null)?.slice(0, 7) === ym &&
      tx.is_passive_income &&
      tx.movement_type === 'income' &&
      !tx.is_settlement
    ).reduce((s, tx) => s + Number(tx.amount ?? 0), 0)

    const envelopeInterest = (movements ?? []).filter(m =>
      m.movement_type === 'interes' &&
      (m as { date?: string | null }).date?.slice(0, 7) === ym
    ).reduce((s, m) => s + Number(m.amount ?? 0), 0)

    const returns  = passiveIncome + envelopeInterest
    const residual = delta - savings - returns

    wealthDelta.push({
      ym,
      label: `${MONTH_LABELS_ES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
      delta, savings, returns, residual,
    })
  }

  // Savings rate trend — month-by-month for the last 12 complete months.
  // Also splits those same deposits THREE ways:
  //   - Ahorro líquido: SAVINGS/SAVINGS_TRAVEL/SAVINGS_DAUGHTERS/SAVINGS_FU
  //     + envelope-routed deposits — no market exposure, no expected return.
  //   - Inversión: SAVINGS_INVESTMENT/SAVINGS_PENSION — market exposure,
  //     expected return.
  //   - Abono extra a deuda: discretionary/"extraordinario" loan principal
  //     paydowns (isExtraLoanPrincipalPayment). This is NOT liquid savings —
  //     it retires debt, it doesn't sit anywhere — and in this account it's
  //     ~4x bigger than actual SAVINGS_* deposits, so folding it into
  //     "ahorro" made that bucket look enormous and disconnected from what
  //     the user means by ahorro. Kept as its own group instead.
  // Envelope-routed deposits count as ahorro — no envelope in this account
  // is tagged envelope_type='inversion' (that split lives in category_code).
  // Destination detail for a deposit tx — "Inversión" alone doesn't say
  // whether it went to TRANSCOMER, IBKR, crypto, etc. Vendor is the real
  // destination; fall back to concept for the odd row where vendor is 'NA'
  // (e.g. "Compra Bitcoins" logged with no vendor).
  function depositDestination(tx: { vendor: string | null; concept: string | null }): string | null {
    const v = tx.vendor?.trim()
    if (v && !/^na$/i.test(v)) return v
    return tx.concept?.trim() || null
  }

  type SourceMap = Record<string, number>
  function addSource(map: SourceMap, baseName: string, destination: string | null, amt: number) {
    const name = destination && destination !== baseName ? `${baseName} · ${destination}` : baseName
    map[name] = (map[name] ?? 0) + amt
  }
  const toSourceList = (map: SourceMap, total: number) =>
    Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([name, amt]) => ({ name, amountMonthly: amt / 12, pct: total > 0 ? (amt / total) * 100 : 0 }))

  const savingsRateTrend: { label: string; rate: number; deposits: number; income: number }[] = []
  const ahorroInversionTrend: {
    label: string; ahorro: number; inversion: number; deuda: number
    ahorroSources: { name: string; amount: number }[]
    inversionSources: { name: string; amount: number }[]
    deudaSources: { name: string; amount: number }[]
  }[] = []
  const ahorroSourceMap: SourceMap = {}
  const inversionSourceMap: SourceMap = {}
  const deudaSourceMap: SourceMap = {}

  for (let i = 12; i >= 1; i--) {
    const d  = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const monthTxs = (txs ?? []).filter(tx => tx.date?.slice(0, 7) === ym)

    const income = monthTxs
      .filter(tx => tx.movement_type === 'income' && !tx.is_passive_income)
      .reduce((s, tx) => s + Number(tx.amount ?? 0), 0)

    const depositTxs = monthTxs.filter(tx =>
      (tx.movement_type === 'expense' || tx.movement_type === 'cash_withdrawal') &&
      !tx.is_settlement &&
      !/p[eé]rdida\s*valor|aumento\s*valor|valorizaci[oó]n/i.test(tx.concept ?? '') &&
      (
        (tx.expense_group === 'objetivos_financieros' && isSavingsCategoryCode(tx.category_code)) ||
        isExtraLoanPrincipalPayment(tx.concept, tx.category_code)
      )
    )

    // Per-month maps too, so the UI can filter the drill-down to one
    // selected month instead of always showing the 12m aggregate.
    const monthAhorroMap: SourceMap = {}
    const monthInversionMap: SourceMap = {}
    const monthDeudaMap: SourceMap = {}

    let txAhorro = 0, txInversion = 0, txDeuda = 0
    for (const tx of depositTxs) {
      const amt = Number(tx.amount ?? 0)
      const dest = depositDestination(tx)
      if (isExtraLoanPrincipalPayment(tx.concept, tx.category_code)) {
        txDeuda += amt
        const name = tx.concept || tx.vendor || 'Abono extra'
        deudaSourceMap[name] = (deudaSourceMap[name] ?? 0) + amt
        monthDeudaMap[name] = (monthDeudaMap[name] ?? 0) + amt
      } else if (INVERSION_CATEGORY_CODES.has(tx.category_code ?? '')) {
        txInversion += amt
        const baseName = (tx.category_code && catNameMap.get(tx.category_code)) || tx.category_code || 'Inversión'
        addSource(inversionSourceMap, baseName, dest, amt)
        addSource(monthInversionMap, baseName, dest, amt)
      } else {
        txAhorro += amt
        const baseName = (tx.category_code && catNameMap.get(tx.category_code)) || tx.category_code || 'Ahorro'
        addSource(ahorroSourceMap, baseName, dest, amt)
        addSource(monthAhorroMap, baseName, dest, amt)
      }
    }

    // Envelope movements are deliberately NOT folded in here — see the
    // avgMonthlyDeposits comment above. They get their own "Saldos en
    // sobres" section, tracking balance evolution rather than pretending
    // every balance change is this month's savings.
    const ahorro = txAhorro
    const deposits = ahorro + txInversion + txDeuda

    savingsRateTrend.push({
      label:    `${MONTH_LABELS_ES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
      rate:     income > 0 ? deposits / income : 0,
      deposits,
      income,
    })
    ahorroInversionTrend.push({
      label:     `${MONTH_LABELS_ES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
      inversion: txInversion,
      ahorro,
      deuda:     txDeuda,
      ahorroSources:    Object.entries(monthAhorroMap).sort((a, b) => b[1] - a[1]).map(([name, amount]) => ({ name, amount })),
      inversionSources: Object.entries(monthInversionMap).sort((a, b) => b[1] - a[1]).map(([name, amount]) => ({ name, amount })),
      deudaSources:     Object.entries(monthDeudaMap).sort((a, b) => b[1] - a[1]).map(([name, amount]) => ({ name, amount })),
    })
  }

  const ahorroInversion12m = ahorroInversionTrend.reduce(
    (acc, m) => ({ ahorro: acc.ahorro + m.ahorro, inversion: acc.inversion + m.inversion, deuda: acc.deuda + m.deuda }),
    { ahorro: 0, inversion: 0, deuda: 0 }
  )
  const ahorroInversionTotal = ahorroInversion12m.ahorro + ahorroInversion12m.inversion + ahorroInversion12m.deuda
  const inversionShare = ahorroInversionTotal > 0 ? ahorroInversion12m.inversion / ahorroInversionTotal : 0

  const ahorroSources    = toSourceList(ahorroSourceMap, ahorroInversion12m.ahorro)
  const inversionSources = toSourceList(inversionSourceMap, ahorroInversion12m.inversion)
  const deudaSources     = toSourceList(deudaSourceMap, ahorroInversion12m.deuda)

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <ProgresoView
        activosInvertibles={activosInvertibles}
        liquidBalance={liquidBalance}
        totalInvested={totalInvested}
        fireNumber={fireNumber}
        leanFireNumber={leanFireNumber}
        fireProgress={fireProgress}
        runway={runway}
        runwaySurvival={runwaySurvival}
        avgMonthlyExpenses={avgMonthlyExpenses}
        avgMonthlyObligations={avgMonthlyObligations}
        avgMonthlySurvivalExpenses={avgMonthlySurvivalExpenses}
        avgMonthlyIncome={avgMonthlyIncome}
        avgMonthlyDeposits={avgMonthlyDeposits}
        passiveIncome12m={passiveIncome12m}
        passiveToIncomeRatio={passiveToIncomeRatio}
        passiveIncomeData={{
          sources: passiveSources,
          trend: passiveTrend,
          topSourcePct: passiveTopSourcePct,
          yoyPct: passiveYoyPct,
          prev12m: passiveIncomePrev12m,
          cobrado12m: passiveCashCobrado12m,
          reinvertido12m: passiveReinvested12m,
        }}
        realizedReturnRate={realizedReturnRate}
        forecastYears={forecastYears}
        snapshots={(snapshotRows ?? []).map(s => ({
          snapshot_date: s.snapshot_date,
          net_worth_crc: Number(s.net_worth_crc),
          invested_crc:  Number(s.invested_crc ?? 0),
          liquid_crc:    Number((s as { liquid_crc?: number | null }).liquid_crc ?? 0),
        }))}
        lockedInvestedByMonth={lockedInvestedByMonth}
        exchangeRate={exchangeRate}
        fireConfig={{ swr, targetExp, expReturn, inflation }}
        runwayGreen={fireConfig?.runway_green_months  ?? 6}
        runwayYellow={fireConfig?.runway_yellow_months ?? 3}
        wealthDelta={wealthDelta}
        savingsRateTrend={savingsRateTrend}
        ahorroInversionData={{
          trend: ahorroInversionTrend,
          ahorroMonthly: ahorroInversion12m.ahorro / 12,
          inversionMonthly: ahorroInversion12m.inversion / 12,
          deudaMonthly: ahorroInversion12m.deuda / 12,
          inversionShare,
          ahorroSources,
          inversionSources,
          deudaSources,
        }}
        sobresBalances={sobresBalances}
        lifestyle={{
          inflationRate: inflation,
          curTotal:      liCurTotal,
          prvTotal:      liPrvTotal,
          monthly:       liMonthly,
          topCats:       liTopCatsWithDrivers,
        }}
      />
    </div>
  )
}
