export type RentalAssetView = {
  id: string
  name: string
  valueCrc: number
  equityCrc: number
  noiMonthly: number
  dscr: number | null
  capRate: number | null
  cashOnCash: number | null
  appreciationCAGR: number | null
  totalReturn: number | null
}

function fmtM(n: number) {
  if (Math.abs(n) >= 1_000_000) return `₡${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `₡${(n / 1_000).toFixed(0)}k`
  return `₡${Math.round(n).toLocaleString('es-CR')}`
}

function fmtPct(n: number | null) {
  return n === null ? '—' : `${(n * 100).toFixed(1)}%`
}

// ── qualitative ranges ──────────────────────────────────────────────────────
// Calibrated to Costa Rica where real data was found (cap rate, plusvalía):
//   - Global Property Guide: gross rental yield CR ~7.3-8.3% nationally
//     (7.6% Q2-2026, 8.25% San José 2024); Cenfi consultant quoted in El
//     Financiero expects rental profitability "no inferior al 9%/año".
//     Our cap rate is NET (post-expenses), so bands sit a bit below those
//     gross figures.
//   - Global Property Guide + Coldwell Banker: CR house price appreciation,
//     long-run cited ~4-4.8%/año, recent hot years (San José) 6.7-10.3%/año.
// DSCR and cash-on-cash have no published Costa Rica benchmark found — these
// stay as the international (mostly US) lending/investing convention, so
// read them as a general sanity check, not a CR-specific standard.

type Rating = 'malo' | 'normal' | 'bueno' | 'muy bueno'

const RATING_COLOR: Record<Rating, string> = {
  malo: 'text-rose-400',
  normal: 'text-amber-400',
  bueno: 'text-emerald-400',
  'muy bueno': 'text-[#a3e635]',
}

function rate(value: number | null, [b1, b2, b3]: [number, number, number]): Rating | null {
  if (value === null) return null
  if (value < b1) return 'malo'
  if (value < b2) return 'normal'
  if (value < b3) return 'bueno'
  return 'muy bueno'
}

const rateCapRate      = (v: number | null) => rate(v, [0.05, 0.07, 0.09])
const rateDSCR         = (v: number | null) => rate(v, [1.0, 1.25, 1.5])
const rateCashOnCash   = (v: number | null) => rate(v, [0, 0.03, 0.06])
const rateAppreciation = (v: number | null) => rate(v, [0.02, 0.05, 0.08])
const rateTotalReturn  = (v: number | null) => rate(v, [0.04, 0.08, 0.13])

const METRIC_INFO: Record<string, string> = {
  'NOI / mes':
    'Ingreso de alquiler menos gastos del inmueble, sin contar la cuota del préstamo — lo que te deja la propiedad antes de pagar deuda. Es un monto, no tiene rango bueno/malo universal.',
  'Cap rate':
    'NOI anual ÷ valor actual de la propiedad. El rendimiento del inmueble como si no tuviera préstamo — sirve para comparar propiedades entre sí, sin importar cómo las financiaste. Calibrado a CR (yield bruto país ~7-8%, un consultor cita 9%+ como mínimo esperado; esto es neto, por eso corre algo más bajo): malo <5% · normal 5-7% · bueno 7-9% · muy bueno >9%.',
  DSCR: 'NOI ÷ cuota del préstamo. El colchón que tenés: arriba de 1x el alquiler cubre la cuota, abajo de 1x no alcanza. No encontré un estándar bancario específico de Costa Rica — esto es la convención internacional (EEUU): malo <1.0x · normal 1.0-1.25x · bueno 1.25-1.5x · muy bueno >1.5x.',
  'Cash-on-cash':
    '(NOI − cuota del préstamo) ÷ tu equity (valor actual − saldo de deuda). El retorno en efectivo sobre lo que de verdad tenés invertido, tomando en cuenta el apalancamiento. Sin benchmark publicado para CR — rango derivado, no verificado: malo <0% · normal 0-3% · bueno 3-6% · muy bueno >6%.',
  'Plusvalía / año':
    'Cuánto subió el valor de la propiedad por año desde que la compraste, de forma compuesta (CAGR) — del precio de compra al valor actual. Calibrado a CR (promedio histórico ~4-5%/año, años recientes calientes 7-10%/año en San José): malo <2% · normal 2-5% · bueno 5-8% · muy bueno >8%.',
  'Retorno total':
    'Cash-on-cash + plusvalía anual. Una estimación de tu retorno total como inversión: efectivo que te deja cada mes, más lo que se aprecia la propiedad. Combinando los rangos anteriores: malo <4% · normal 4-8% · bueno 8-13% · muy bueno >13%.',
}

function Metric({
  label,
  value,
  rating,
  highlight,
}: {
  label: string
  value: string
  rating?: Rating | null
  highlight?: boolean
}) {
  return (
    <div className="bg-white/[0.02] rounded-xl p-3" title={METRIC_INFO[label]}>
      <div className="text-[9px] text-zinc-500 uppercase tracking-wide">{label}</div>
      <div className={`text-sm font-black mt-0.5 ${highlight ? 'text-emerald-400' : 'text-white'}`}>{value}</div>
      {rating && <div className={`text-[9px] font-bold mt-0.5 capitalize ${RATING_COLOR[rating]}`}>{rating}</div>}
    </div>
  )
}

export function RentalPerformanceSection({ assets }: { assets: RentalAssetView[] }) {
  if (assets.length === 0) return null

  return (
    <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] p-5 space-y-5">
      <h2 className="text-sm font-black text-white tracking-tight">Rendimiento de alquiler</h2>
      <div className="space-y-4">
        {assets.map(a => (
          <div key={a.id} className="rounded-xl bg-white/[0.02] border border-white/[0.05] p-4 space-y-3">
            <div className="flex items-baseline justify-between">
              <h3 className="text-xs font-bold text-white">{a.name}</h3>
              <span className="text-[10px] text-zinc-500">
                {fmtM(a.valueCrc)} · equity {fmtM(a.equityCrc)}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Metric label="NOI / mes" value={fmtM(a.noiMonthly)} />
              <Metric label="Cap rate" value={fmtPct(a.capRate)} rating={rateCapRate(a.capRate)} />
              <Metric
                label="DSCR"
                value={a.dscr === null ? '—' : `${a.dscr.toFixed(2)}x`}
                rating={rateDSCR(a.dscr)}
              />
              <Metric label="Cash-on-cash" value={fmtPct(a.cashOnCash)} rating={rateCashOnCash(a.cashOnCash)} />
              <Metric
                label="Plusvalía / año"
                value={fmtPct(a.appreciationCAGR)}
                rating={rateAppreciation(a.appreciationCAGR)}
              />
              <Metric
                label="Retorno total"
                value={fmtPct(a.totalReturn)}
                rating={rateTotalReturn(a.totalReturn)}
                highlight
              />
            </div>
          </div>
        ))}
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 pt-2 border-t border-white/[0.05]">
        {Object.entries(METRIC_INFO).map(([label, desc]) => (
          <div key={label}>
            <dt className="text-[10px] font-bold text-zinc-400">{label}</dt>
            <dd className="text-[10px] text-zinc-500 leading-snug">{desc}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
