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

const METRIC_INFO: Record<string, string> = {
  'NOI / mes':
    'Ingreso de alquiler menos gastos del inmueble, sin contar la cuota del préstamo — lo que te deja la propiedad antes de pagar deuda.',
  'Cap rate':
    'NOI anual ÷ valor actual de la propiedad. El rendimiento del inmueble como si no tuviera préstamo — sirve para comparar propiedades entre sí, sin importar cómo las financiaste.',
  DSCR: 'NOI ÷ cuota del préstamo. El colchón que tenés: arriba de 1x el alquiler cubre la cuota, abajo de 1x no alcanza. 1.5x o más se considera sano.',
  'Cash-on-cash':
    '(NOI − cuota del préstamo) ÷ tu equity (valor actual − saldo de deuda). El retorno en efectivo sobre lo que de verdad tenés invertido, tomando en cuenta el apalancamiento.',
  'Plusvalía / año':
    'Cuánto subió el valor de la propiedad por año desde que la compraste, de forma compuesta (CAGR) — del precio de compra al valor actual.',
  'Retorno total':
    'Cash-on-cash + plusvalía anual. Una estimación de tu retorno total como inversión: efectivo que te deja cada mes, más lo que se aprecia la propiedad.',
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-white/[0.02] rounded-xl p-3" title={METRIC_INFO[label]}>
      <div className="text-[9px] text-zinc-500 uppercase tracking-wide">{label}</div>
      <div className={`text-sm font-black mt-0.5 ${highlight ? 'text-emerald-400' : 'text-white'}`}>{value}</div>
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
              <Metric label="Cap rate" value={fmtPct(a.capRate)} />
              <Metric label="DSCR" value={a.dscr === null ? '—' : `${a.dscr.toFixed(2)}x`} />
              <Metric label="Cash-on-cash" value={fmtPct(a.cashOnCash)} />
              <Metric label="Plusvalía / año" value={fmtPct(a.appreciationCAGR)} />
              <Metric label="Retorno total" value={fmtPct(a.totalReturn)} highlight />
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
