'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export type WrappedData = {
  passiveIncome: { current: number; previous: number }
  netWorth: { start: number; end: number }
  realEstateEquityDelta: number | null
  bestInvestment: { name: string; annPct: number; totalUsd: number } | null
  vila: { noiCrc: number } | null
  spending: {
    topCategory: { code: string; total: number } | null
    topVendor: { name: string; total: number } | null
    biggest: { concept: string; amount: number } | null
  }
  habits: {
    totalTx: number
    selfLoansCount: number
    selfLoansPaid: number
    cryptoProtocols: number
    aguinaldoItemCount: number
    aguinaldoItemTotal: number
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
        <p className="text-6xl font-black text-white tabular-nums">{fmtUSD(d.passiveIncome.current)}</p>
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

  const nwChange = d.netWorth.end - d.netWorth.start
  const nwPct = pct(d.netWorth.end, d.netWorth.start)
  slides.push({
    key: 'networth', bg: 'from-blue-950 to-[#0d120d]', accent: '#60a5fa', eyebrow: 'Patrimonio',
    render: () => (
      <div className="flex flex-col items-center justify-center h-full text-center gap-3 px-6">
        <p className="text-[11px] font-black tracking-[0.3em] uppercase text-blue-400/70">Patrimonio líquido + invertido</p>
        <p className="text-5xl font-black text-white tabular-nums">{fmtCRC(d.netWorth.end)}</p>
        {nwPct !== null && (
          <p className={`text-lg font-bold ${nwChange >= 0 ? 'text-blue-400' : 'text-amber-400'}`}>
            {nwChange >= 0 ? '+' : ''}{fmtCRC(nwChange)} ({nwPct >= 0 ? '+' : ''}{nwPct.toFixed(1)}%) en el año
          </p>
        )}
        {d.realEstateEquityDelta !== null && (
          <p className="text-sm text-zinc-400 max-w-xs">
            Esto no incluye bienes raíces — ahí tu equity en Vila{' '}
            <span className={d.realEstateEquityDelta >= 0 ? 'text-[#b45309] font-bold' : 'text-rose-400 font-bold'}>
              {d.realEstateEquityDelta >= 0 ? 'subió' : 'bajó'} {fmtCRC(Math.abs(d.realEstateEquityDelta))}
            </span>{' '}
            más este año.
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
          <p className="text-5xl font-black text-amber-400 tabular-nums">{bi.annPct >= 0 ? '+' : ''}{bi.annPct.toFixed(1)}%</p>
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
          <p className="text-5xl font-black text-white tabular-nums">{fmtCRC(vila.noiCrc)}</p>
          <p className="text-lg font-bold" style={{ color: '#b45309' }}>de ingreso neto de alquiler este {year}</p>
          <p className="text-sm text-zinc-500 max-w-xs">Alquiler menos gastos de la propiedad — sin contar la deuda ni la plusvalía.</p>
        </div>
      ),
    })
  }

  const { topCategory, topVendor, biggest } = d.spending
  if (topCategory || biggest) {
    slides.push({
      key: 'spending', bg: 'from-rose-950 to-[#0d120d]', accent: '#fb7185', eyebrow: 'En qué se fue',
      render: () => (
        <div className="flex flex-col items-center justify-center h-full text-center gap-4 px-6">
          <p className="text-[11px] font-black tracking-[0.3em] uppercase text-rose-400/70">En qué se fue la plata</p>
          {topCategory && (
            <div>
              <p className="text-3xl font-black text-white">{categoryLabel(topCategory.code)}</p>
              <p className="text-sm text-zinc-500">tu categoría #1 · {fmtCRC(topCategory.total)}</p>
            </div>
          )}
          {biggest && (
            <div>
              <p className="text-xl font-bold text-rose-400">{fmtCRC(biggest.amount)}</p>
              <p className="text-xs text-zinc-600 max-w-[220px] truncate">{biggest.concept}</p>
              <p className="text-[10px] text-zinc-700 uppercase tracking-wider mt-0.5">tu gasto más grande</p>
            </div>
          )}
          {topVendor && (
            <p className="text-xs text-zinc-600">{topVendor.name} se llevó {fmtCRC(topVendor.total)} este año</p>
          )}
        </div>
      ),
    })
  }

  const h = d.habits
  slides.push({
    key: 'habits', bg: 'from-purple-950 to-[#0d120d]', accent: '#c084fc', eyebrow: 'Hábitos',
    render: () => (
      <div className="flex flex-col items-center justify-center h-full text-center gap-4 px-6">
        <p className="text-[11px] font-black tracking-[0.3em] uppercase text-purple-400/70">Tus hábitos este {year}</p>
        <p className="text-5xl font-black text-white tabular-nums">{h.totalTx.toLocaleString('es-CR')}</p>
        <p className="text-sm text-zinc-500">transacciones registradas</p>
        <div className="grid grid-cols-2 gap-4 pt-2">
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
        <div className="h-full w-full">{slide.render()}</div>

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
