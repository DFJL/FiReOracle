'use client'

import { useState, useTransition } from 'react'
import { upsertFinancialConfig, type FinancialConfigData } from '@/app/actions/financialConfig'

type ExistingConfig = Omit<FinancialConfigData, 'preferred_currency' | 'lifestyle_exclude_categories'> & {
  preferred_currency?: string | null
  lifestyle_exclude_categories?: string[] | null
}

type Props = {
  existing: ExistingConfig | null
  avgMonthlyExpenses: number
}

function pct(val: number) { return (val * 100).toFixed(1) }
function rate(val: number) { return (val * 100).toFixed(2) }
function fmtCRC(v: number) { return `₡${Math.round(v).toLocaleString('es-CR')}` }

export function FireConfigManager({ existing, avgMonthlyExpenses }: Props) {
  const defaults = {
    fire_withdrawal_rate:    existing?.fire_withdrawal_rate    ?? 0.04,
    fire_target_monthly_exp: existing?.fire_target_monthly_exp ?? null,
    fire_expected_return:    existing?.fire_expected_return    ?? 0.07,
    fire_inflation_rate:     existing?.fire_inflation_rate     ?? 0.04,
    runway_green_months:     existing?.runway_green_months     ?? 6,
    runway_yellow_months:    existing?.runway_yellow_months    ?? 3,
    savings_rate_green:      existing?.savings_rate_green      ?? 0.30,
    savings_rate_yellow:     existing?.savings_rate_yellow     ?? 0.15,
    fcf_target_ratio:        existing?.fcf_target_ratio        ?? 0.20,
    preferred_currency:      (existing?.preferred_currency as 'CRC' | 'USD' | undefined) ?? 'USD',
  }

  const [withdrawal, setWithdrawal]         = useState(pct(defaults.fire_withdrawal_rate))
  const [targetExp, setTargetExp]           = useState(defaults.fire_target_monthly_exp?.toString() ?? '')
  const [expectedReturn, setExpectedReturn] = useState(rate(defaults.fire_expected_return))
  const [inflation, setInflation]           = useState(rate(defaults.fire_inflation_rate))
  const [runwayGreen, setRunwayGreen]       = useState(defaults.runway_green_months.toString())
  const [runwayYellow, setRunwayYellow]     = useState(defaults.runway_yellow_months.toString())
  const [srGreen, setSrGreen]               = useState(pct(defaults.savings_rate_green))
  const [srYellow, setSrYellow]             = useState(pct(defaults.savings_rate_yellow))
  const [fcfTarget, setFcfTarget]           = useState(pct(defaults.fcf_target_ratio))
  const [currency, setCurrency]             = useState<'CRC' | 'USD'>(defaults.preferred_currency)
  const [error, setError]   = useState<string | null>(null)
  const [saved, setSaved]   = useState(false)
  const [isPending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)

    const payload: FinancialConfigData = {
      fire_withdrawal_rate:    parseFloat(withdrawal) / 100,
      fire_target_monthly_exp: targetExp ? parseFloat(targetExp) : null,
      fire_expected_return:    parseFloat(expectedReturn) / 100,
      fire_inflation_rate:     parseFloat(inflation) / 100,
      runway_green_months:     parseInt(runwayGreen),
      runway_yellow_months:    parseInt(runwayYellow),
      savings_rate_green:      parseFloat(srGreen) / 100,
      savings_rate_yellow:     parseFloat(srYellow) / 100,
      fcf_target_ratio:        parseFloat(fcfTarget) / 100,
      preferred_currency:      currency,
    }

    startTransition(async () => {
      const result = await upsertFinancialConfig(payload)
      if (result?.error) { setError(result.error); return }
      setSaved(true)
    })
  }

  const inputCls = 'bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40 w-full'
  const labelCls = 'block text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em] mb-1'

  return (
    <form onSubmit={submit} className="space-y-6">

      {/* FIRE parameters */}
      <div className="space-y-3">
        <p className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.14em]">Parámetros FIRE</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Tasa de retiro (%) <span className="text-zinc-700 normal-case tracking-normal">regla del 4%</span></label>
            <input type="number" step="0.1" min="1" max="10" value={withdrawal}
              onChange={e => setWithdrawal(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Gasto mensual objetivo (₡) <span className="text-zinc-700 normal-case tracking-normal">en retiro</span></label>
            {avgMonthlyExpenses > 0 ? (
              <>
                <div className={`${inputCls} text-zinc-400 pointer-events-none`}>
                  {fmtCRC(avgMonthlyExpenses)}
                </div>
                <p className="text-[9px] text-zinc-700 mt-1">
                  Promedio real de tus últimos 12 meses — con historial de gasto, se usa siempre este número en vez de uno puesto a mano, para que el FIRE number no quede pegado a un valor viejo.
                </p>
              </>
            ) : (
              <>
                <input type="number" step="1000" min="0" value={targetExp}
                  onChange={e => setTargetExp(e.target.value)} placeholder="ej. 1,500,000"
                  className={inputCls} />
                <p className="text-[9px] text-zinc-700 mt-1">
                  Todavía no tenés suficiente historial de gasto — este valor es solo un punto de partida. En cuanto haya datos reales de 12 meses, se usa ese número automáticamente y este campo deja de aplicar.
                </p>
              </>
            )}
          </div>
          <div>
            <label className={labelCls}>Retorno esperado anual (%)</label>
            <input type="number" step="0.1" min="0" max="30" value={expectedReturn}
              onChange={e => setExpectedReturn(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Inflación CRC anual (%)</label>
            <input type="number" step="0.1" min="0" max="30" value={inflation}
              onChange={e => setInflation(e.target.value)} className={inputCls} />
          </div>
        </div>
        {(avgMonthlyExpenses > 0 || parseFloat(targetExp) > 0) && (
          <p className="text-[10px] text-zinc-600">
            FIRE Number estimado:{' '}
            <span className="text-zinc-400 font-semibold">
              {fmtCRC(((avgMonthlyExpenses > 0 ? avgMonthlyExpenses : parseFloat(targetExp) || 0) * 12) / defaults.fire_withdrawal_rate)}
            </span>
          </p>
        )}
      </div>

      {/* Runway thresholds */}
      <div className="space-y-3">
        <p className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.14em]">Umbrales de Runway</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Verde ≥ (meses)</label>
            <input type="number" min="1" max="60" value={runwayGreen}
              onChange={e => setRunwayGreen(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Amarillo ≥ (meses)</label>
            <input type="number" min="1" max="60" value={runwayYellow}
              onChange={e => setRunwayYellow(e.target.value)} className={inputCls} />
          </div>
        </div>
      </div>

      {/* Savings rate thresholds */}
      <div className="space-y-3">
        <p className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.14em]">Umbrales de Tasa de Ahorro</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Verde ≥ (%)</label>
            <input type="number" step="1" min="1" max="100" value={srGreen}
              onChange={e => setSrGreen(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Amarillo ≥ (%)</label>
            <input type="number" step="1" min="1" max="100" value={srYellow}
              onChange={e => setSrYellow(e.target.value)} className={inputCls} />
          </div>
        </div>
      </div>

      {/* FCF target */}
      <div className="space-y-3">
        <p className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.14em]">Flujo libre objetivo</p>
        <div className="max-w-[180px]">
          <label className={labelCls}>FCF / Ingresos objetivo (%)</label>
          <input type="number" step="1" min="0" max="100" value={fcfTarget}
            onChange={e => setFcfTarget(e.target.value)} className={inputCls} />
        </div>
      </div>

      {/* Currency preference */}
      <div className="space-y-3">
        <p className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.14em]">Moneda predeterminada</p>
        <div className="flex gap-3">
          {(['USD', 'CRC'] as const).map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setCurrency(c)}
              className={`px-4 py-2 rounded-lg text-sm font-black transition-colors border ${
                currency === c
                  ? 'bg-[#a3e635] text-black border-[#a3e635]'
                  : 'bg-white/[0.04] text-zinc-400 border-white/[0.08] hover:border-white/20'
              }`}
            >
              {c === 'USD' ? '$ USD' : '₡ CRC'}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-rose-400 bg-rose-400/10 rounded-lg px-3 py-2">{error}</p>}
      {saved && <p className="text-xs text-[#a3e635] bg-[#a3e635]/10 rounded-lg px-3 py-2">Configuración guardada.</p>}

      <button
        type="submit"
        disabled={isPending}
        className="px-5 py-2.5 rounded-xl bg-[#a3e635] text-black text-sm font-black hover:bg-[#b4f040] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? 'Guardando…' : 'Guardar configuración FIRE'}
      </button>
    </form>
  )
}
