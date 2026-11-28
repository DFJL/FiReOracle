'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export type WrappedData = {
  passiveIncome: { current: number; previous: number }
  netWorth: { start: number; end: number }
  patrimony: { start: number; end: number; hasRealEstate: boolean }
  bestInvestment: { name: string; annPct: number; totalUsd: number } | null
  vila: { noiCrc: number } | null
  patterns: {
    biggestIncrease: { code: string; current: number; previous: number; delta: number; pct: number | null } | null
    biggestDecrease: { code: string; current: number; previous: number; delta: number; pct: number | null } | null
    trendPct: number | null
    h1Avg: number
    h2Avg: number
    newHabit: { code: string; total: number; months: number } | null
  }
  habits: {
    totalTx: number
    selfLoansCount: number
    selfLoansPaid: number
    cryptoProtocols: number
    aguinaldoItemCount: number
    aguinaldoItemTotal: number
    dayOfWeekTotals: number[]
    vendorDiversity: number
  }
}

function fmtCRC(n: number) {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}₡${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}₡${Math.round(abs / 1_000)}K`
  return `${sign}₡${Math.round(abs)}`
}
function fmtUSD(n: number) {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  return `${sign}$${abs.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}
function pct(a: number, b: number) {
  if (!b) return null
  return ((a - b) / Math.abs(b)) * 100
}

const CATEGORY_LABELS: Record<string, string> = {
  LOAN_PAYMENT: 'Pagos de préstamo', CAR_EXPENSES: 'Gastos de carro', FOOD_SUPER: 'Supermercado',
  FOOD_OUT: 'Comer afuera', HEALTH_MEDS: 'Salud', SERVICES: 'Servicios', PERSONAL_CARE: 'Cuidado personal',
}
function categoryLabel(code: string) {
  return CATEGORY_LABELS[code] ?? code.replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase())
}

const DOW_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

// ── Animated primitives ──────────────────────────────────────────────────────

function CountUp({ value, format, duration = 900 }: { value: number; format: (n: number) => string; duration?: number }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    let raf: number
    const start = performance.now()
    function tick(now: number) {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(value * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return <>{format(display)}</>
}

function AnimatedBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const [width, setWidth] = useState(0)
  const target = max > 0 ? Math.min(100, (Math.abs(value) / max) * 100) : 0
  useEffect(() => {
    const id = requestAnimationFrame(() => setWidth(target))
    return () => cancelAnimationFrame(id)
  }, [target])
  return (
    <div className="w-full">
      <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
        <span>{label}</span>
        <span className="tabular-nums">{fmtCRC(value)}</span>
      </div>
      <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${width}%`, background: color }} />
      </div>
    </div>
  )
}

function WeekdayChart({ totals, color }: { totals: number[]; color: string }) {
  const max = Math.max(...totals, 1)
  const [heights, setHeights] = useState<number[]>(totals.map(() => 0))
  useEffect(() => {
    const id = requestAnimationFrame(() => setHeights(totals.map(t => (t / max) * 100)))
    return () => cancelAnimationFrame(id)
  }, [totals, max])
  const peakIdx = totals.indexOf(Math.max(...totals))
  return (
    <div className="flex items-end gap-2 h-24 w-full max-w-[260px]">
      {totals.map((t, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full flex items-end h-20 rounded-md bg-white/[0.04] overflow-hidden">
            <div
              className="w-full rounded-md transition-all duration-700 ease-out"
              style={{ height: `${heights[i]}%`, background: i === peakIdx ? color : `${color}55` }}
            />
          </div>
          <span className={`text-[9px] ${i === peakIdx ? 'text-white font-bold' : 'text-zinc-600'}`}>{DOW_LABELS[i]}</span>
        </div>
      ))}
    </div>
  )
}

type Slide = {
  key: string
  bg: string
  accent: string
  eyebrow: string
  render: () => React.ReactNode
}

function buildSlides(year: number, d: WrappedData): Slide[] {
  const slides: Slide[] = []

  slides.push({
    key: 'intro', bg: 'from-[#0d120d] to-[#0d120d]', accent: '#a3e635', eyebrow: 'Fire Oracle',
    render: () => (
      <div className="flex flex-col items-center justify-center h-full text-center gap-4 px-6">
        <p className="text-[11px] font-black tracking-[0.3em] uppercase text-[#a3e635]/60">Fire Oracle</p>
        <p className="text-6xl font-black text-white tracking-tight">Tu {year}</p>
        <p className="text-sm text-zinc-500 max-w-xs">Un repaso de tu año financiero — con lo bueno, lo real, y lo que sigue.</p>
      </div>
    ),
  })

  const passiveGrowth = pct(d.passiveIncome.current, d.passiveIncome.previous)
  slides.push({
    key: 'passive', bg: 'from-emerald-950 to-[#0d120d]', accent: '#34d399', eyebrow: 'Ingreso pasivo',
    render: () => (
      <div className="flex flex-col items-center justify-center h-full text-center gap-3 px-6">
        <p className="text-[11px] font-black tracking-[0.3em] uppercase text-emerald-400/70">Ingreso pasivo</p>
        <p className="text-6xl font-black text-white tabular-nums">
          <CountUp value={d.passiveIncome.current} format={fmtUSD} />
        </p>
        {passiveGrowth !== null && (
          <p className={`text-xl font-bold ${passiveGrowth >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {passiveGrowth >= 0 ? '+' : ''}{passiveGrowth.toFixed(0)}% vs {year - 1}
          </p>
        )}
        <p className="text-sm text-zinc-500 max-w-xs">
          {passiveGrowth !== null && passiveGrowth > 0
            ? 'Cada vez menos de tu ingreso depende de que trabajes por él.'
            : 'El ingreso pasivo tuvo un año más tranquilo — sigue siendo la base de tu FIRE.'}
        </p>
      </div>
    ),
  })

  const patrimonyChange = d.patrimony.end - d.patrimony.start
  const patrimonyPct = pct(d.patrimony.end, d.patrimony.start)
  slides.push({
    key: 'networth', bg: 'from-blue-950 to-[#0d120d]', accent: '#60a5fa', eyebrow: 'Patrimonio',
    render: () => (
      <div className="flex flex-col items-center justify-center h-full text-center gap-3 px-6">
        <p className="text-[11px] font-black tracking-[0.3em] uppercase text-blue-400/70">
          Patrimonio total{d.patrimony.hasRealEstate ? ' · líquido + invertido + bienes raíces' : ''}
        </p>
        <p className="text-5xl font-black text-white tabular-nums">
          <CountUp value={d.patrimony.end} format={fmtCRC} />
        </p>
        {patrimonyPct !== null && (
          <p className={`text-lg font-bold ${patrimonyChange >= 0 ? 'text-blue-400' : 'text-amber-400'}`}>
            {patrimonyChange >= 0 ? '+' : ''}{fmtCRC(patrimonyChange)} ({patrimonyPct >= 0 ? '+' : ''}{patrimonyPct.toFixed(1)}%) en el año
          </p>
        )}
        {d.patrimony.hasRealEstate && (
          <p className="text-sm text-zinc-400 max-w-xs">
            De eso, {fmtCRC(d.netWorth.end)} es líquido + invertido — el resto es tu equity en bienes raíces.
          </p>
        )}
      </div>
    ),
  })

  if (d.bestInvestment) {
    const bi = d.bestInvestment
    slides.push({
      key: 'best-investment', bg: 'from-amber-950 to-[#0d120d]', accent: '#f59e0b', eyebrow: 'Mejor inversión',
      render: () => (
        <div className="flex flex-col items-center justify-center h-full text-center gap-3 px-6">
          <p className="text-[11px] font-black tracking-[0.3em] uppercase text-amber-400/70">Mejor inversión del año</p>
          <p className="text-4xl font-black text-white">{bi.name}</p>
          <p className="text-5xl font-black text-amber-400 tabular-nums">
            <CountUp value={bi.annPct} format={n => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`} />
          </p>
          <p className="text-sm text-zinc-500 max-w-xs">anualizado · {fmtUSD(bi.totalUsd)} ganados este {year}</p>
        </div>
      ),
    })
  }

  if (d.vila) {
    const vila = d.vila
    slides.push({
      key: 'vila', bg: 'from-stone-900 to-[#0d120d]', accent: '#b45309', eyebrow: 'Bienes raíces',
      render: () => (
        <div className="flex flex-col items-center justify-center h-full text-center gap-3 px-6">
          <p className="text-[11px] font-black tracking-[0.3em] uppercase" style={{ color: '#b4530999' }}>Vila del Sendero</p>
          <p className="text-5xl font-black text-white tabular-nums">
            <CountUp value={vila.noiCrc} format={fmtCRC} />
          </p>
          <p className="text-lg font-bold" style={{ color: '#b45309' }}>de ingreso neto de alquiler este {year}</p>
          <p className="text-sm text-zinc-500 max-w-xs">Alquiler menos gastos de la propiedad — sin contar la deuda ni la plusvalía.</p>
        </div>
      ),
    })
  }

  const { biggestIncrease, biggestDecrease, trendPct, newHabit } = d.patterns
  if (biggestIncrease || biggestDecrease || newHabit) {
    const maxVal = Math.max(
      biggestIncrease?.current ?? 0, biggestIncrease?.previous ?? 0,
      biggestDecrease?.current ?? 0, biggestDecrease?.previous ?? 0,
    ) || 1
    slides.push({
      key: 'patterns', bg: 'from-rose-950 to-[#0d120d]', accent: '#fb7185', eyebrow: 'Patrones',
      render: () => (
        <div className="flex flex-col items-center justify-center h-full text-center gap-5 px-6">
          <p className="text-[11px] font-black tracking-[0.3em] uppercase text-rose-400/70">Dónde cambió tu consumo</p>

          {biggestIncrease && (
            <div className="w-full max-w-[260px]">
              <p className="text-xs font-bold text-rose-400 uppercase tracking-wide">⚠ Subió más</p>
              <p className="text-lg font-black text-white">{categoryLabel(biggestIncrease.code)}</p>
              <div className="flex flex-col gap-1.5 mt-2">
                <AnimatedBar label={`${year - 1}`} value={biggestIncrease.previous} max={maxVal} color="#52525b" />
                <AnimatedBar label={`${year}`} value={biggestIncrease.current} max={maxVal} color="#fb7185" />
              </div>
              <p className="text-sm text-rose-300 font-bold mt-1.5">
                +{fmtCRC(biggestIncrease.delta)}{biggestIncrease.pct !== null ? ` (+${biggestIncrease.pct.toFixed(0)}%)` : ''}
              </p>
            </div>
          )}

          {biggestDecrease && (
            <div className="w-full max-w-[260px]">
              <p className="text-xs font-bold text-emerald-400 uppercase tracking-wide">✓ Bajó más</p>
              <p className="text-lg font-black text-white">{categoryLabel(biggestDecrease.code)}</p>
              <div className="flex flex-col gap-1.5 mt-2">
                <AnimatedBar label={`${year - 1}`} value={biggestDecrease.previous} max={maxVal} color="#52525b" />
                <AnimatedBar label={`${year}`} value={biggestDecrease.current} max={maxVal} color="#34d399" />
              </div>
              <p className="text-sm text-emerald-300 font-bold mt-1.5">
                {fmtCRC(biggestDecrease.delta)}{biggestDecrease.pct !== null ? ` (${biggestDecrease.pct.toFixed(0)}%)` : ''}
              </p>
            </div>
          )}

          {newHabit && (
            <p className="text-xs text-amber-300 max-w-[240px]">
              👀 {categoryLabel(newHabit.code)} no aparecía en la primera mitad del año y ya se repitió {newHabit.months} meses — vale la pena vigilarlo.
            </p>
          )}

          {trendPct !== null && (
            <p className="text-[11px] text-zinc-500">
              Tu gasto mensual promedio {trendPct >= 0 ? 'subió' : 'bajó'} {Math.abs(trendPct).toFixed(0)}% de la primera a la segunda mitad del año.
            </p>
          )}
        </div>
      ),
    })
  }

  const h = d.habits
  const peakDowIdx = h.dayOfWeekTotals.indexOf(Math.max(...h.dayOfWeekTotals))
  slides.push({
    key: 'habits', bg: 'from-purple-950 to-[#0d120d]', accent: '#c084fc', eyebrow: 'Hábitos',
    render: () => (
      <div className="flex flex-col items-center justify-center h-full text-center gap-4 px-6">
        <p className="text-[11px] font-black tracking-[0.3em] uppercase text-purple-400/70">Tus hábitos este {year}</p>
        <p className="text-5xl font-black text-white tabular-nums">
          <CountUp value={h.totalTx} format={n => Math.round(n).toLocaleString('es-CR')} />
        </p>
        <p className="text-sm text-zinc-500">transacciones registradas, en {h.vendorDiversity} comercios distintos</p>

        <WeekdayChart totals={h.dayOfWeekTotals} color="#c084fc" />
        <p className="text-[10px] text-zinc-600 uppercase tracking-wider">{DOW_LABELS[peakDowIdx]} es tu día de mayor gasto</p>

        <div className="grid grid-cols-2 gap-4 pt-1">
          {h.cryptoProtocols > 0 && (
            <div>
              <p className="text-2xl font-black text-purple-400">{h.cryptoProtocols}</p>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider">protocolos crypto</p>
            </div>
          )}
          {h.selfLoansCount > 0 && (
            <div>
              <p className="text-2xl font-black text-purple-400">{h.selfLoansCount}</p>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider">autopréstamos ({h.selfLoansPaid} pagados)</p>
            </div>
          )}
        </div>
      </div>
    ),
  })

  slides.push({
    key: 'outro', bg: 'from-[#0d120d] to-black', accent: '#a3e635', eyebrow: 'Hasta el próximo año',
    render: () => (
      <div className="flex flex-col items-center justify-center h-full text-center gap-4 px-6">
        <p className="text-[11px] font-black tracking-[0.3em] uppercase text-[#a3e635]/60">{year} fue tuyo</p>
        <p className="text-3xl font-black text-white leading-snug max-w-sm">
          {passiveGrowth !== null && passiveGrowth > 0
            ? `Tu ingreso pasivo creció ${passiveGrowth.toFixed(0)}%`
            : 'Seguiste construyendo'}
          {d.bestInvestment ? `, ${d.bestInvestment.name} fue tu mejor jugada` : ''}.
        </p>
        <p className="text-sm text-zinc-500">Nos vemos el próximo {year + 1}.</p>
      </div>
    ),
  })

  return slides
}

export function WrappedView({ year, data }: { year: number; data: WrappedData }) {
  const router = useRouter()
  const slides = buildSlides(year, data)
  const [idx, setIdx] = useState(0)

  function go(delta: number) {
    setIdx(i => Math.max(0, Math.min(slides.length - 1, i + delta)))
  }

  const slide = slides[idx]

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
      <div className={`relative w-full h-full md:max-w-sm md:h-[90vh] md:rounded-3xl overflow-hidden bg-gradient-to-b ${slide.bg} border border-white/[0.06]`}>
        {/* Progress segments */}
        <div className="absolute top-0 left-0 right-0 z-20 flex gap-1 p-3">
          {slides.map((s, i) => (
            <div key={s.key} className="flex-1 h-[3px] rounded-full bg-white/15 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: i < idx ? '100%' : i === idx ? '100%' : '0%', background: slide.accent }}
              />
            </div>
          ))}
        </div>

        {/* Close */}
        <button
          onClick={() => router.push('/resumen')}
          className="absolute top-6 right-3 z-20 text-white/50 hover:text-white/90 text-sm px-2 py-1"
        >
          ✕
        </button>

        {/* Tap zones */}
        <button
          aria-label="Anterior"
          onClick={() => go(-1)}
          className="absolute left-0 top-0 bottom-0 w-1/3 z-10"
        />
        <button
          aria-label="Siguiente"
          onClick={() => (idx === slides.length - 1 ? router.push('/resumen') : go(1))}
          className="absolute right-0 top-0 bottom-0 w-2/3 z-10"
        />

        {/* Slide content */}
        <div key={slide.key} className="h-full w-full">{slide.render()}</div>

        {/* Nav arrows (desktop) */}
        <div className="hidden md:flex absolute bottom-4 left-0 right-0 justify-center gap-2 z-20">
          {idx > 0 && (
            <button onClick={() => go(-1)} className="px-3 py-1.5 rounded-lg bg-white/[0.08] text-white/70 text-xs font-bold hover:bg-white/[0.14]">
              ← Anterior
            </button>
          )}
          {idx < slides.length - 1 && (
            <button onClick={() => go(1)} className="px-3 py-1.5 rounded-lg bg-white/[0.08] text-white/70 text-xs font-bold hover:bg-white/[0.14]">
              Siguiente →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
