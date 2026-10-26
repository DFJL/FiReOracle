'use client'

import { ChevronDown, ChevronUp } from 'lucide-react'
import { isValuationConcept } from '@/lib/incomeAllocation'
import { type FlowWindow } from '@/lib/ahorroInversionFlow'

// ── Types ──────────────────────────────────────────────────────────────────────

interface TxClient {
  date: string | null
  vendor: string | null
  concept: string | null
  category_code: string | null
  movement_type: string | null
  amount: number | null
  expense_group: string | null
  is_settlement: boolean
  is_passive_income?: boolean
  is_survival_expense?: boolean
}

// ── Income-side classifiers (which income source, not touched by the
// gasto/ahorro/inversión/deuda split below) ───────────────────────────────

function isValuationEntry(tx: TxClient): boolean {
  if (tx.movement_type) return false
  return isValuationConcept(tx.concept)
}

function isPatrimonialIncome(tx: TxClient): boolean {
  return !tx.movement_type && tx.amount != null && Number(tx.amount) > 0 && !isValuationEntry(tx)
}

function isActivIncome(tx: TxClient): boolean {
  return tx.movement_type === 'income' && !tx.is_settlement && !tx.is_passive_income
}

function isPassiveIncome(tx: TxClient): boolean {
  return tx.movement_type === 'income' && !!tx.is_passive_income && !tx.is_settlement
}

// ── Colors ────────────────────────────────────────────────────────────────────
// Ahorro/Inversión/Deuda reuse the exact hues validated for this app's dark
// surface — one color language for the same buckets everywhere. A 4th
// fully-distinct categorical hue alongside them doesn't clear CVD
// separation in dark mode (the dataviz skill's own palette caps all-pairs-
// safe categoricals at 3) — so Gasto and Cuotas stay a neutral zinc ladder
// by lightness instead of a 4th competing hue.

const COLOR_ACTIVE_INCOME  = '#a3e635'
const COLOR_PASSIVE_INCOME = '#34d399'
const COLOR_PATRIMONIAL    = '#a78bfa'
const COLOR_NECESARIO      = '#52525b'
const COLOR_DISCRECIONAL   = '#a1a1aa'
const COLOR_CUOTAS         = '#71717a'
const COLOR_AHORRO         = '#199e70'
const COLOR_INVERSION      = '#9085e9'
const COLOR_DEUDA          = '#d95926'

// UI-level buckets — Gasto itself splits into Necesario/Discrecional here
// (via tx.is_survival_expense) so "cuánto gasto en sobrevivencia vs.
// discrecional" is a direct answer, not buried inside a Gasto drill-down.
// Cuotas sits with Deuda (both loan-servicing, not lifestyle consumption).
// cuotas/ahorro/inversion/deuda map 1:1 to FlowWindow's own fields.
type UiBucket = 'necesario' | 'discrecional' | 'cuotas' | 'ahorro' | 'inversion' | 'deuda'

// The full set of things a card item can be — UiBucket plus the three
// income-source rows. Exported so InteractiveSection can drive the same
// selection into its category/subcategory/transaction browser below
// instead of growing a second, incompatible tab/subtab selector — that
// second selector (Egresos/Ingresos → Gastos/Ahorros/Inversiones pills)
// is exactly the duplicate this type exists to remove: it filtered by a
// cruder rule (isOutflow lumped Gasto+Cuotas+Deuda together) that
// disagreed with these cards' own numbers.
export type DrillBucket = UiBucket | 'active' | 'passive' | 'patrimonial'

export const DRILL_BUCKET_LABEL: Record<DrillBucket, string> = {
  active: 'Ingreso activo', passive: 'Ingreso pasivo', patrimonial: 'Val. patrimonial',
  necesario: 'Necesario', discrecional: 'Discrecional', cuotas: 'Cuotas préstamos',
  ahorro: 'Ahorro', inversion: 'Inversión', deuda: 'Abono extra deuda',
}
export function isIncomeSourceBucket(b: DrillBucket): boolean {
  return b === 'active' || b === 'passive' || b === 'patrimonial'
}

const UI_BUCKET_COLOR: Record<UiBucket, string> = {
  necesario: COLOR_NECESARIO, discrecional: COLOR_DISCRECIONAL, cuotas: COLOR_CUOTAS,
  ahorro: COLOR_AHORRO, inversion: COLOR_INVERSION, deuda: COLOR_DEUDA,
}
// Order the funnel's Egresos bar segments by — Gasto-family together, then
// the two wealth-building families, matching how the cards below group them.
const BUCKET_ORDER: UiBucket[] = ['necesario', 'discrecional', 'ahorro', 'inversion', 'cuotas', 'deuda']

// ── Funnel step — one bar, full width at the top (Ingreso) or narrower
// below it (Egresos), width proportional to its share of the step above so
// the taper itself shows "how much of income actually left as egresos". ──

function FunnelStep({
  label, amount, widthPct, color, fmtAmt, sub,
}: {
  label: string
  amount: number
  widthPct: number
  color: string
  fmtAmt: (n: number) => string
  sub?: string
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[9px] font-black text-zinc-500 uppercase tracking-wider">{label}</span>
        <span className="text-xs font-black tabular-nums" style={{ color }}>
          {fmtAmt(amount)}{sub && <span className="text-zinc-500 font-semibold"> · {sub}</span>}
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-black/25 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(widthPct, 1)}%`, background: color }} />
      </div>
    </div>
  )
}

// Same taper, but the bar itself is segmented by bucket — this is the
// "composed of gastos y sus tipos, ahorro e inversión y sus tipos" step:
// Egresos narrows from Ingreso, and what it narrows to is visibly made of
// these pieces, not a single flat color.
function SegmentedFunnelStep({
  label, amount, widthPct, segments, fmtAmt, sub,
}: {
  label: string
  amount: number
  widthPct: number
  segments: { key: string; amount: number; color: string }[]
  fmtAmt: (n: number) => string
  sub?: string
}) {
  const visible = segments.filter(s => s.amount > 0)
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[9px] font-black text-zinc-500 uppercase tracking-wider">{label}</span>
        <span className="text-xs font-black tabular-nums text-zinc-300">
          {fmtAmt(amount)}{sub && <span className="text-zinc-500 font-semibold"> · {sub}</span>}
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-black/25 overflow-hidden">
        <div className="h-full rounded-full flex gap-[1px] transition-all" style={{ width: `${Math.max(widthPct, 1)}%` }}>
          {visible.map(s => <div key={s.key} style={{ flex: s.amount, background: s.color }} />)}
        </div>
      </div>
    </div>
  )
}

// ── Summary card groups — each of the four questions this page exists to
// answer (tipos de ingreso / gasto / ahorro e inversión / deuda) as one
// card, with a proportional mini-bar + legend so the relative size of its
// own items is readable at a glance, not just each item's size vs. total
// income. Every item is clickable — it's the ONE selector into the
// category → subcategory → transaction browser InteractiveSection renders
// below (selectedBucket/onSelect, lifted up instead of kept as local
// state), so there's no second, disagreeing nav for the same split. ──────

type GroupItem = { key: DrillBucket; label: string; amount: number; color: string }

function BucketGroupCard({
  label, items, fmtAmt, monthsInWindow, totalIncome, showPctOfIncome = true, selected, onSelect,
}: {
  label: string
  items: GroupItem[]
  fmtAmt: (n: number) => string
  monthsInWindow: number
  totalIncome: number
  showPctOfIncome?: boolean
  selected: DrillBucket | null
  onSelect: (key: DrillBucket) => void
}) {
  const visible = items.filter(i => i.amount > 0)
  const total = visible.reduce((s, i) => s + i.amount, 0)
  if (total <= 0) return null

  return (
    <div className="bg-black/20 rounded-xl p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-[8px] text-zinc-500 uppercase tracking-wider">{label}</p>
        <div className="text-right shrink-0">
          <p className="text-sm font-black tabular-nums text-zinc-200 leading-none">{fmtAmt(total)}</p>
          <p className="text-[8px] text-zinc-600 mt-0.5 tabular-nums">
            {showPctOfIncome && totalIncome > 0 && `${((total / totalIncome) * 100).toFixed(0)}% del ingreso`}
            {showPctOfIncome && totalIncome > 0 && monthsInWindow > 1 && ' · '}
            {monthsInWindow > 1 && `~${fmtAmt(total / monthsInWindow)}/mes`}
          </p>
        </div>
      </div>

      {/* Proportional mini-bar — this item's size relative to the rest of the group */}
      {visible.length > 1 && (
        <div className="flex rounded-full overflow-hidden h-1.5 mb-2 gap-[1px]">
          {visible.map(i => (
            <div key={i.key} style={{ flex: i.amount, background: i.color }} />
          ))}
        </div>
      )}

      <div className="space-y-1">
        {visible.map(i => {
          const pct = total > 0 ? (i.amount / total) * 100 : 0
          const active = selected === i.key
          return (
            <button key={i.key} onClick={() => onSelect(i.key)}
              className={`w-full text-left rounded-md px-1 -mx-1 py-0.5 transition-colors ${active ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'}`}>
              <div className="flex items-center justify-between gap-2 w-full">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="inline-block w-1.5 h-1.5 rounded-sm shrink-0" style={{ background: i.color }} />
                  <span className={`text-[9px] truncate ${active ? 'text-zinc-100 font-semibold' : 'text-zinc-400'}`}>{i.label} ›</span>
                </span>
                <span className="text-[9px] tabular-nums shrink-0">
                  <span className="text-zinc-300 font-semibold">{fmtAmt(i.amount)}</span>
                  {visible.length > 1 && <span className="text-zinc-600"> · {pct.toFixed(0)}%</span>}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
// A funnel, not a Sankey: Ingreso (full width) narrows to Egresos (width =
// % of income that actually left), which is itself made of Gasto/Ahorro e
// inversión/Deuda — then each of those is a card you tap to select. The
// selection is controlled from InteractiveSection, which renders the real
// category → subcategory → transaction drill-down for whatever's selected
// right below this component — this component used to also render its own
// shallow "top sources" bar-list drill-down, which was a second, shorter
// version of that same browser; removed in favor of the one that goes all
// the way to actual transactions.

export function IncomeFunnel({
  transactions,
  flow,
  fmtAmt,
  onCollapse,
  selectedBucket,
  onSelectBucket,
}: {
  transactions: TxClient[]
  flow: FlowWindow
  fmtAmt: (n: number) => string
  onCollapse?: () => void
  selectedBucket: DrillBucket | null
  onSelectBucket: (key: DrillBucket) => void
}) {
  // ── Income sources (a different question from gasto/ahorro/inversión —
  // "where income came from", not "where it went") ──────────────────────
  let activeIncome = 0, passiveIncome = 0, patrimonial = 0
  for (const tx of transactions) {
    if (isActivIncome(tx))   { activeIncome  += Number(tx.amount ?? 0); continue }
    if (isPassiveIncome(tx)) { passiveIncome += Number(tx.amount ?? 0); continue }
    if (isPatrimonialIncome(tx)) {
      const amt = Number(tx.amount ?? 0)
      if (amt > 0) patrimonial += amt
    }
  }

  const totalIncome = activeIncome + passiveIncome + patrimonial
  if (totalIncome === 0) return null

  // Egresos — everything that actually left (gasto + cuotas + ahorro +
  // inversión + deuda); income minus egresos is what stayed unassigned.
  const egresos = flow.gasto + flow.cuotas + flow.ahorro + flow.inversion + flow.deuda
  const margin = totalIncome - egresos
  const egresosPct = totalIncome > 0 ? (egresos / totalIncome) * 100 : 0

  // Window can span anywhere from one month (period tabs like 'mtd'/'1m') to
  // several years ('all'/'5y') — a raw total alone answers "how much" but not
  // "is that a lot", so wide windows also get a per-month average. ~30.44
  // days/month (365.25/12) rather than calendar-month counting: `to` is
  // exclusive and doesn't line up on month boundaries for every period.
  const daysInWindow = (new Date(flow.to).getTime() - new Date(flow.from).getTime()) / 86_400_000
  const monthsInWindow = Math.max(1, Math.round(daysInWindow / 30.44))

  const amountFor = (b: UiBucket): number => {
    if (b === 'necesario') return flow.gastoSurvival
    if (b === 'discrecional') return flow.gastoDiscrecional
    return flow[b]
  }

  return (
    <div className="rounded-2xl bg-[#0d120d] border border-[#a3e635]/[0.10] p-5">
      <div className="flex items-start justify-between mb-1">
        <p className="text-[9px] font-black text-[#a3e635]/50 uppercase tracking-[0.18em]">Flujo de ingresos</p>
        {onCollapse && (
          <button onClick={onCollapse} className="text-zinc-600 hover:text-zinc-400 transition-colors -mt-0.5 -mr-1 p-1" title="Colapsar">
            <ChevronUp size={14} />
          </button>
        )}
      </div>
      <p className="text-xs text-zinc-500 mb-4">
        De los ingresos, cuánto se va en egresos — y de eso, cuánto es gasto, ahorro, inversión o abono extra a deuda
      </p>

      {/* ── Funnel: Ingreso (100%) narrows to Egresos (% que realmente salió) ──
          Both steps also show the typical monthly average for the selected
          window, not just the total — a "Todo"/"5A" total alone doesn't say
          whether that's a lot. ── */}
      <div className="space-y-1.5 mb-1">
        <FunnelStep
          label="Ingreso" amount={totalIncome} widthPct={100} color={COLOR_ACTIVE_INCOME} fmtAmt={fmtAmt}
          sub={monthsInWindow > 1 ? `~${fmtAmt(totalIncome / monthsInWindow)}/mes` : undefined}
        />
        <div className="flex justify-center"><ChevronDown size={11} className="text-zinc-700" /></div>
        <SegmentedFunnelStep
          label="Egresos" amount={egresos} widthPct={egresosPct} fmtAmt={fmtAmt}
          sub={`${egresosPct.toFixed(0)}% del ingreso${monthsInWindow > 1 ? ` · ~${fmtAmt(egresos / monthsInWindow)}/mes` : ''}`}
          segments={BUCKET_ORDER.map(b => ({ key: b, amount: amountFor(b), color: UI_BUCKET_COLOR[b] }))}
        />
      </div>
      {margin !== 0 && (
        <p className="text-[9px] text-zinc-600 mb-4">
          {margin > 0
            ? `${fmtAmt(margin)} no se movió de la cuenta (margen neto)`
            : `${fmtAmt(Math.abs(margin))} de déficit, cubierto fuera de este ingreso`}
        </p>
      )}
      {margin === 0 && <div className="mb-4" />}

      {/* ── De qué están hechos los egresos y el ingreso — un card por
          pregunta; tocá un item para ver sus categorías y transacciones
          abajo. ── */}
      <p className="text-[9px] font-black text-zinc-600 uppercase tracking-wider mb-2">
        Por tipo · tocá uno para ver el detalle
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <BucketGroupCard
          label="Gasto" fmtAmt={fmtAmt} monthsInWindow={monthsInWindow} totalIncome={totalIncome}
          selected={selectedBucket} onSelect={onSelectBucket}
          items={(['necesario', 'discrecional'] as UiBucket[]).map(b => (
            { key: b, label: DRILL_BUCKET_LABEL[b], amount: amountFor(b), color: UI_BUCKET_COLOR[b] }
          ))}
        />
        <BucketGroupCard
          label="Ahorro e inversión" fmtAmt={fmtAmt} monthsInWindow={monthsInWindow} totalIncome={totalIncome}
          selected={selectedBucket} onSelect={onSelectBucket}
          items={(['ahorro', 'inversion'] as UiBucket[]).map(b => (
            { key: b, label: DRILL_BUCKET_LABEL[b], amount: amountFor(b), color: UI_BUCKET_COLOR[b] }
          ))}
        />
        {/* Cuotas (scheduled installments) + Deuda (extra paydowns) — both
            loan-servicing, not lifestyle consumption. */}
        <BucketGroupCard
          label="Deuda" fmtAmt={fmtAmt} monthsInWindow={monthsInWindow} totalIncome={totalIncome}
          selected={selectedBucket} onSelect={onSelectBucket}
          items={(['cuotas', 'deuda'] as UiBucket[]).map(b => (
            { key: b, label: DRILL_BUCKET_LABEL[b], amount: amountFor(b), color: UI_BUCKET_COLOR[b] }
          ))}
        />
        <BucketGroupCard
          label="Ingreso, por fuente" fmtAmt={fmtAmt} monthsInWindow={monthsInWindow} totalIncome={totalIncome}
          showPctOfIncome={false} selected={selectedBucket} onSelect={onSelectBucket}
          items={[
            { key: 'active',      label: 'Ingreso activo',   amount: activeIncome,  color: COLOR_ACTIVE_INCOME },
            { key: 'passive',     label: 'Ingreso pasivo',   amount: passiveIncome, color: COLOR_PASSIVE_INCOME },
            { key: 'patrimonial', label: 'Val. patrimonial', amount: patrimonial,   color: COLOR_PATRIMONIAL },
          ]}
        />
      </div>
    </div>
  )
}
