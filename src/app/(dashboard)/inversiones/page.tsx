import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { BucketData, BucketTx, BucketTxType } from './buckets'
import { PortfolioView } from './PortfolioView'
import { PortfolioHistory } from './PortfolioHistory'
import type { HistoryPoint, HistorySeries } from './PortfolioHistory'
import { PortfolioYield } from './PortfolioYield'
import { PortfolioAnalysis, type MonthlyContribution, type MonthlyIncome, type EnvelopeCluster } from './PortfolioAnalysis'
import { getPortfolioTargets } from '@/app/actions/portfolio'
import { fetchExchangeRate } from '@/lib/exchange-rate'
import { countableEnvelopeIds, sumLiquid } from '@/lib/envelopeBalances'
import { computeBucketTotals, classifyBucketTx, normalizeVendor, type ConceptMap } from '@/lib/bucketBalance'

const LIQUID_KEY = '__liquidez__'

export default async function InversionesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [
    { data: bucketRows },
    { data: txs },
    { data: movements },
    { data: envelopes },
    { data: yieldRows },
    { data: fireConfig },
    { data: incomeTxs },
  ] = await Promise.all([
    admin
      .from('user_investment_buckets')
      .select('id, bucket_type, name, industry, color, vendors, concept_map, account_id, sort_order, baseline_date, baseline_value_crc')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('sort_order'),
    admin
      .from('transactions')
      .select('id, vendor, concept, category_code, movement_type, expense_group, is_settlement, is_passive_income, amount, date, investment_bucket_id')
      .eq('user_id', user.id)
      .not('amount', 'is', null)
      // Supabase/PostgREST caps unpaginated selects at 1000 rows by default —
      // silently, with no error. A single user here already has ~8,800
      // transactions, so every unpatched call like this one was quietly
      // replaying on <12% of the real ledger.
      .range(0, 49999),
    admin
      .from('envelope_movements')
      .select('amount, date, movement_type, envelope_id')
      .eq('user_id', user.id),
    admin
      .from('savings_envelopes')
      .select('id, name, custodio, color, parent_envelope_id, sort_order, envelope_type')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('sort_order'),
    admin
      .from('investment_yield_history')
      .select('product_name, year_month, yield_usd, invested_usd, yield_pct, exchange_rate, source, bucket_id')
      .eq('user_id', user.id)
      .order('year_month', { ascending: true }),
    admin
      .from('user_financial_config')
      .select('preferred_currency')
      .eq('user_id', user.id)
      .maybeSingle(),
    admin
      .from('transactions')
      .select('date, amount, movement_type')
      .eq('user_id', user.id)
      .eq('movement_type', 'income')
      .not('amount', 'is', null)
      .range(0, 49999),
  ])

  // Authoritative history. Replaying transaction deltas cannot reconstruct what
  // a bucket held before it existed: ROP & FCL and Pensión Voluntaria carry years
  // of value but were migrated with a single seed dated 2026-07-01, so a replayed
  // series sits at zero and then steps up by ₡40.9M. net_worth_snapshots holds the
  // real monthly position back to 2018 and always included those funds, so the
  // headline lines are taken from it and the replay is only a fallback for months
  // it does not cover.
  const { data: nwSnapshots } = await admin
    .from('net_worth_snapshots')
    .select('snapshot_date, invested_crc, liquid_crc')
    .eq('user_id', user.id)
    .order('snapshot_date', { ascending: true })

  const snapshotInvestedByMonth: Record<string, number> = {}
  const snapshotLiquidByMonth: Record<string, number> = {}
  const snapshotTotalByMonth: Record<string, number> = {}
  for (const s of nwSnapshots ?? []) {
    if (!s.snapshot_date) continue
    // Later snapshot within a month wins (a month-end cut supersedes an earlier one)
    const m = s.snapshot_date.slice(0, 7)
    snapshotInvestedByMonth[m] = Number(s.invested_crc ?? 0)
    snapshotLiquidByMonth[m]   = Number(s.liquid_crc ?? 0)
    snapshotTotalByMonth[m]    = Number(s.invested_crc ?? 0) + Number(s.liquid_crc ?? 0)
  }

  // Real, manually-verified per-bucket monthly values (source: 'imported') —
  // preferred over the transaction replay for any month they cover, same
  // principle as snapshotInvestedByMonth above but per bucket instead of
  // portfolio-wide. A 'computed' row (written by computeYieldHistory) never
  // overrides anything; only a human-verified 'imported' one does.
  const realBucketMonthByBucket: Record<string, Record<string, number>> = {}
  for (const r of yieldRows ?? []) {
    if (r.source !== 'imported' || !r.bucket_id || !r.year_month) continue
    const m = String(r.year_month).slice(0, 7)
    const crc = Number(r.invested_usd) * Number(r.exchange_rate)
    ;(realBucketMonthByBucket[r.bucket_id] ??= {})[m] = crc
  }

  // Fetch snapshot balances + positions + history for snapshot_based buckets
  const snapshotBuckets = (bucketRows ?? []).filter(b => b.bucket_type === 'snapshot_based' && b.account_id)
  const snapshotResults = await Promise.all(
    snapshotBuckets.map(async b => {
      const [{ data: history }, { data: positions }] = await Promise.all([
        admin
          .from('account_balance_snapshots')
          .select('snapshot_date, real_balance, real_balance_native')
          .eq('account_id', b.account_id!)
          .order('snapshot_date', { ascending: false }),
        admin
          .from('account_positions')
          .select('symbol, quantity, market_value_usd, avg_cost_usd')
          .eq('account_id', b.account_id!)
          .order('market_value_usd', { ascending: false }),
      ])
      const latest = history?.[0]
      return {
        id: b.id,
        balance: latest?.real_balance ? Number(latest.real_balance) : 0,
        balanceNative: latest?.real_balance_native != null ? Number(latest.real_balance_native) : null,
        history: (history ?? []).map(h => ({
          date: h.snapshot_date,
          balance: Number(h.real_balance),
          balanceNative: h.real_balance_native != null ? Number(h.real_balance_native) : null,
        })),
        positions: (positions ?? []).map(p => ({
          symbol: p.symbol,
          quantity: Number(p.quantity),
          market_value_usd: Number(p.market_value_usd),
          avg_cost_usd: p.avg_cost_usd != null ? Number(p.avg_cost_usd) : null,
        })),
      }
    })
  )
  const snapshotBalances: Record<string, number> = Object.fromEntries(snapshotResults.map(r => [r.id, r.balance]))
  const snapshotBalanceNative: Record<string, number | null> = Object.fromEntries(snapshotResults.map(r => [r.id, r.balanceNative]))
  const snapshotHistory: Record<string, typeof snapshotResults[number]['history']> = Object.fromEntries(snapshotResults.map(r => [r.id, r.history]))
  const snapshotPositions: Record<string, typeof snapshotResults[number]['positions']> = Object.fromEntries(snapshotResults.map(r => [r.id, r.positions]))

  const { data: snapshotAccounts } = snapshotBuckets.length > 0
    ? await admin.from('financial_accounts').select('id, currency_code')
        .in('id', snapshotBuckets.map(b => b.account_id!))
    : { data: [] }
  const accountCurrencyById: Record<string, string> = Object.fromEntries(
    (snapshotAccounts ?? []).map(a => [a.id, a.currency_code])
  )

  // Canonical envelope rule, shared with /liquidez, /patrimonio and /auditoria
  const countableIds = countableEnvelopeIds(envelopes ?? [])
  const liquidBalance = sumLiquid(movements ?? [], countableIds)

  // Per-leaf envelope balances for drilldown
  const envelopeBalances: Record<string, number> = {}
  for (const m of movements ?? []) {
    if (m.movement_type === 'interes') continue
    if (!countableIds.has(m.envelope_id)) continue
    envelopeBalances[m.envelope_id] = (envelopeBalances[m.envelope_id] ?? 0) + Number(m.amount)
  }

  type EnvEntry = { id: string; name: string; color: string | null; balance: number }
  type CustodioGroup = { name: string; total: number; envelopes: EnvEntry[] }
  const custodioMap: Record<string, CustodioGroup> = {}
  for (const env of envelopes ?? []) {
    if (!countableIds.has(env.id)) continue
    const cust = (env as { id: string; name: string; custodio: string; color: string | null; parent_envelope_id: string | null; sort_order: number | null }).custodio
    if (!custodioMap[cust]) custodioMap[cust] = { name: cust, total: 0, envelopes: [] }
    const balance = envelopeBalances[env.id] ?? 0
    custodioMap[cust].total += balance
    custodioMap[cust].envelopes.push({
      id: env.id,
      name: (env as { id: string; name: string; custodio: string; color: string | null; parent_envelope_id: string | null; sort_order: number | null }).name,
      color: (env as { id: string; name: string; custodio: string; color: string | null; parent_envelope_id: string | null; sort_order: number | null }).color ?? null,
      balance,
    })
  }
  const liquidBreakdown: CustodioGroup[] = Object.values(custodioMap)
    .map(g => ({
      ...g,
      envelopes: g.envelopes
        .filter(e => Math.round(e.balance) !== 0)
        .sort((a, b) => b.balance - a.balance),
    }))
    .sort((a, b) => b.total - a.total)

  // Compute bucket balances (current)
  const buckets: BucketData[] = (bucketRows ?? []).map(def => {
    if (def.bucket_type === 'snapshot_based') {
      const balance = snapshotBalances[def.id] ?? 0
      return {
        key: def.id,
        name: def.name,
        industry: def.industry ?? '',
        color: def.color ?? '#888',
        vendors: [],
        deposits: 0, liquidaciones: 0, rendimientos: 0,
        passiveValuation: 0, markToMarketLoss: 0,
        balance, valorizationNet: 0,
        balanceNative: snapshotBalanceNative[def.id] ?? undefined,
        balanceHistory: snapshotHistory[def.id] ?? [],
        positions: snapshotPositions[def.id] ?? [],
        accountId: def.account_id,
        accountCurrency: def.account_id ? (accountCurrencyById[def.account_id] ?? 'CRC') : undefined,
      }
    }

    const { deposits, liquidaciones, rendimientos, passiveValuation, markToMarketLoss, balance } =
      computeBucketTotals({ ...def, concept_map: def.concept_map as unknown as ConceptMap | null }, txs ?? [])
    return {
      key: def.id,
      name: def.name,
      industry: def.industry ?? '',
      color: def.color ?? '#888',
      vendors: (def.vendors ?? []) as string[],
      deposits, liquidaciones, rendimientos, passiveValuation, markToMarketLoss,
      balance, valorizationNet: passiveValuation - markToMarketLoss,
    }
  })

  const totalInvested = buckets.reduce((s, b) => s + b.balance, 0)
  const totalPatrimony = totalInvested + liquidBalance

  // ── Per-bucket transaction history ──────────────────────────────────────────
  // Snapshot-based buckets don't derive their BALANCE from these — that comes
  // from account_balance_snapshots — but the underlying transactions (a deposit,
  // a wire fee) are still real records worth showing, matched by vendor name
  // or an explicit investment_bucket_id link.
  const bucketTransactions: Record<string, BucketTx[]> = {}
  for (const def of bucketRows ?? []) {
    bucketTransactions[def.id] = []
  }
  for (const tx of txs ?? []) {
    if (!tx.date) continue
    const amt = Number(tx.amount ?? 0)
    for (const def of bucketRows ?? []) {
      const txType = classifyBucketTx({ ...def, concept_map: def.concept_map as unknown as ConceptMap | null }, tx) as BucketTxType | null
      if (txType) {
        bucketTransactions[def.id].push({
          id: tx.id,
          date: tx.date,
          amount: amt,
          concept: tx.concept ?? null,
          vendor: tx.vendor ?? null,
          tx_type: txType,
        })
      }
    }
  }
  for (const id of Object.keys(bucketTransactions)) {
    bucketTransactions[id].sort((a, b) => b.date.localeCompare(a.date))
  }

  // ── Historical monthly computation ──────────────────────────────────────────

  // Step 1: per-bucket monthly deltas (vendor/concept only; snapshot has no history)
  const bucketDefs = (bucketRows ?? []).filter(b => b.bucket_type !== 'snapshot_based')
  const bucketDeltas: Record<string, Record<string, number>> = {}

  for (const def of bucketDefs) {
    const deltas: Record<string, number> = {}
    bucketDeltas[def.id] = deltas

    for (const tx of txs ?? []) {
      if (!tx.date) continue
      const month = tx.date.slice(0, 7)
      const amt = Number(tx.amount ?? 0)
      let delta = 0

      if (def.bucket_type === 'concept_based' && def.concept_map) {
        const cm = def.concept_map as unknown as ConceptMap
        const c = (tx.concept ?? '').toLowerCase()
        const ciIncludes = (arr: string[]) => arr.some(s => s.toLowerCase() === c)
        if ((tx as { investment_bucket_id?: string | null }).investment_bucket_id === def.id) {
          if (tx.movement_type === 'income' && tx.is_settlement) delta = -amt
          else if (tx.expense_group === 'objetivos_financieros' && !tx.is_settlement) delta = amt
          else if (tx.is_passive_income) delta = amt
        } else if (ciIncludes(cm.depositConcepts))       delta = amt
        else if (ciIncludes(cm.rendimientosConcepts))    delta = amt
        else if (ciIncludes(cm.valorizacionConcepts))    delta = amt
        else if (ciIncludes(cm.liquidacionConcepts))     delta = -amt
      } else if (def.bucket_type === 'vendor_based') {
        const txVendor = normalizeVendor(tx.vendor ?? '')
        const vendors = (def.vendors ?? []).map((v: string) => normalizeVendor(v))
        if (!vendors.includes(txVendor)) continue

        if (tx.expense_group === 'objetivos_financieros' && !tx.is_settlement) delta = amt
        else if (tx.is_settlement)                                               delta = -amt
        else if (tx.is_passive_income && tx.movement_type === 'income')          delta = amt
        else if (tx.is_passive_income && !tx.movement_type)                      delta = amt
      }

      if (delta !== 0) deltas[month] = (deltas[month] ?? 0) + delta
    }
  }

  // Step 2: liquidez monthly deltas from envelope_movements (leaf envelopes only, no interes)
  const liquidezDeltas: Record<string, number> = {}
  for (const m of movements ?? []) {
    if (!m.date) continue
    if (m.movement_type === 'interes') continue
    if (!countableIds.has(m.envelope_id)) continue
    const month = m.date.slice(0, 7)
    liquidezDeltas[month] = (liquidezDeltas[month] ?? 0) + Number(m.amount)
  }

  // Step 3: collect all months in range
  const allMonthsSet = new Set<string>()
  for (const deltas of Object.values(bucketDeltas)) Object.keys(deltas).forEach(m => allMonthsSet.add(m))
  Object.keys(liquidezDeltas).forEach(m => allMonthsSet.add(m))
  // Snapshots reach further back than any transaction, so let them set the start
  Object.keys(snapshotInvestedByMonth).forEach(m => allMonthsSet.add(m))

  const historyPoints: HistoryPoint[] = []

  if (allMonthsSet.size > 0) {
    const earliest = [...allMonthsSet].sort()[0]
    const months: string[] = []
    let cursor = new Date(earliest + '-01')
    const nowStr = new Date().toISOString().slice(0, 7)
    while (cursor.toISOString().slice(0, 7) <= nowStr) {
      months.push(cursor.toISOString().slice(0, 7))
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    }

    const running: Record<string, number> = {}
    let runningLiquidez = 0
    // Snapshots are monthly but not guaranteed for every month; carry the last
    // known values forward so the lines have no phantom drops to zero.
    let lastInvested: number | null = null
    let lastLiquid: number | null = null
    let lastTotal: number | null = null

    // Per-bucket real-value anchor: once a month has a verified real value,
    // later un-verified months show `real anchor + replay delta since then`
    // instead of the raw (possibly drifted) cumulative replay — same idea as
    // the baseline on the current total, applied month by month for the chart.
    const bucketLastReal: Record<string, number> = {}
    const bucketReplayAtLastReal: Record<string, number> = {}

    for (const month of months) {
      for (const def of bucketDefs) {
        running[def.id] = (running[def.id] ?? 0) + (bucketDeltas[def.id]?.[month] ?? 0)
      }
      runningLiquidez += (liquidezDeltas[month] ?? 0)
      if (snapshotInvestedByMonth[month] !== undefined) lastInvested = snapshotInvestedByMonth[month]
      if (snapshotLiquidByMonth[month] !== undefined)   lastLiquid   = snapshotLiquidByMonth[month]
      if (snapshotTotalByMonth[month] !== undefined)    lastTotal    = snapshotTotalByMonth[month]

      const bucketBalances: Record<string, number> = {}
      for (const def of bucketDefs) {
        const real = realBucketMonthByBucket[def.id]?.[month]
        if (real !== undefined) {
          bucketLastReal[def.id] = real
          bucketReplayAtLastReal[def.id] = running[def.id] ?? 0
          bucketBalances[def.id] = real
        } else if (def.id in bucketLastReal) {
          bucketBalances[def.id] = bucketLastReal[def.id] + ((running[def.id] ?? 0) - bucketReplayAtLastReal[def.id])
        } else {
          bucketBalances[def.id] = running[def.id] ?? 0
        }
      }

      historyPoints.push({
        month,
        balances: {
          ...bucketBalances,
          // envelope_movements only start 2025-01, so replaying them leaves the
          // liquidez line flat at zero for 2018-2024. Snapshots know the real
          // position; fall back to the replay only where no snapshot exists.
          [LIQUID_KEY]: lastLiquid ?? runningLiquidez,
        },
        // Authoritative values; the chart falls back to the replayed sum only
        // for months with no snapshot at all.
        ...(lastTotal    !== null ? { total: lastTotal }       : {}),
        ...(lastInvested !== null ? { invested: lastInvested } : {}),
      })
    }
  }

  const historySeries: HistorySeries[] = [
    ...buckets
      .filter(b => b.key !== LIQUID_KEY)
      .map(b => ({ key: b.key, name: b.name, color: b.color })),
    { key: LIQUID_KEY, name: 'Liquidez', color: '#f59e0b' },
  ]

  const exchangeRate = await fetchExchangeRate()

  // ── Portfolio analysis data ─────────────────────────────────────────────────

  // Monthly contributions per bucket (deposits only, not returns)
  const contributions: MonthlyContribution[] = []
  for (const def of bucketDefs) {
    for (const tx of txs ?? []) {
      if (!tx.date) continue
      const amt = Number(tx.amount ?? 0)
      let isDeposit = false
      if (def.bucket_type === 'concept_based' && def.concept_map) {
        const cm = def.concept_map as unknown as { depositConcepts: string[] }
        const c = (tx.concept ?? '').toLowerCase()
        if (
          ((tx as { investment_bucket_id?: string | null }).investment_bucket_id === def.id &&
            tx.expense_group === 'objetivos_financieros' && !tx.is_settlement) ||
          cm.depositConcepts.some(s => s.toLowerCase() === c)
        ) isDeposit = true
      } else if (def.bucket_type === 'vendor_based') {
        const v = normalizeVendor(tx.vendor ?? '')
        const vs = (def.vendors ?? []).map((s: string) => normalizeVendor(s))
        if (vs.includes(v) && tx.expense_group === 'objetivos_financieros' && !tx.is_settlement) isDeposit = true
      }
      if (isDeposit) {
        contributions.push({ month: tx.date.slice(0, 7), bucketId: def.id, amount: amt })
      }
    }
  }

  // Monthly income
  const incomeByMonth: Record<string, number> = {}
  for (const tx of incomeTxs ?? []) {
    if (!tx.date) continue
    const m = tx.date.slice(0, 7)
    incomeByMonth[m] = (incomeByMonth[m] ?? 0) + Number(tx.amount ?? 0)
  }
  const monthlyIncome: MonthlyIncome[] = Object.entries(incomeByMonth).map(([month, amount]) => ({ month, amount }))

  // Envelope clusters by envelope_type
  type EnvRow = { id: string; name: string; custodio: string; color: string | null; parent_envelope_id: string | null; sort_order: number | null; envelope_type: string | null }
  const envClusters: Record<string, EnvelopeCluster> = {
    liquidez:        { type: 'liquidez',        label: 'Liquidez',        balance: 0, envelopes: [] },
    emergencia:      { type: 'emergencia',       label: 'Emergencia',      balance: 0, envelopes: [] },
    meta_especifica: { type: 'meta_especifica',  label: 'Metas',           balance: 0, envelopes: [] },
    inversion:       { type: 'inversion',        label: 'Inversión',       balance: 0, envelopes: [] },
    sin_tipo:        { type: 'sin_tipo',         label: 'Sin clasificar',  balance: 0, envelopes: [] },
  }
  for (const env of envelopes ?? []) {
    if (!countableIds.has(env.id)) continue
    const balance = envelopeBalances[env.id] ?? 0
    const eType = (env as EnvRow).envelope_type ?? 'sin_tipo'
    const cluster = envClusters[eType] ?? envClusters.sin_tipo
    cluster.balance += balance
    cluster.envelopes.push({
      id: env.id,
      name: (env as EnvRow).name,
      custodio: (env as EnvRow).custodio,
      balance,
    })
  }
  const clusters: EnvelopeCluster[] = Object.values(envClusters)

  // Portfolio targets
  const portfolioTargets = await getPortfolioTargets()

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
      <PortfolioView
        buckets={buckets}
        liquidBalance={liquidBalance}
        totalInvested={totalInvested}
        totalPatrimony={totalPatrimony}
        exchangeRate={exchangeRate}
        liquidBreakdown={liquidBreakdown}
        bucketTransactions={bucketTransactions}
      />
      <PortfolioHistory
        points={historyPoints}
        series={historySeries}
        exchangeRate={exchangeRate}
      />
      <PortfolioYield
        rows={(yieldRows ?? []).map(r => ({
          product_name: r.product_name as string,
          year_month:   r.year_month as string,
          yield_usd:    Number(r.yield_usd),
          invested_usd: Number(r.invested_usd),
          yield_pct:    Number(r.yield_pct),
          exchange_rate: Number(r.exchange_rate),
        }))}
        exchangeRate={exchangeRate}
        defaultCurrency={(fireConfig?.preferred_currency as 'CRC' | 'USD') ?? 'USD'}
      />
      <PortfolioAnalysis
        buckets={buckets.filter(b => b.key !== LIQUID_KEY)}
        liquidBalance={liquidBalance}
        totalPatrimony={totalPatrimony}
        contributions={contributions}
        income={monthlyIncome}
        clusters={clusters}
        targets={portfolioTargets}
      />
    </div>
  )
}
