'use client'

import { useState } from 'react'
import { computeSchedule, simulateExtra, type AmortizationResult } from './amortization'

type Payment = {
  id: string
  payment_date: string
  payment_type: string
  amount: number
  principal: number
  interest: number
  insurance: number
  balance_before: number
  balance_after: number
  rate_applied: number
  notes: string | null
}

type RateEntry = {
  effective_date: string
  rate: number
  notes: string | null
}

type LoanData = {
  id: string
  name: string
  lender: string
  currencyCode: string
  originalAmount: number
  currentBalance: number
  interestRate: number
  monthlyInsurance: number
  startDate: string
  endDate: string
  paymentDay: number
  notes: string | null
  remainingMonths: number
  startYearMonth: string
  payments: Payment[]
  rateHistory: RateEntry[]
}

// ── Formatters ─────────────────────────────────────────────────────────────

function fmtCRC(v: number, abbreviated = false): string {
  if (abbreviated) {
    if (v >= 1_000_000) return `₡${(v / 1_000_000).toFixed(2)}M`
    if (v >= 1_000)    return `₡${(v / 1_000).toFixed(0)}K`
  }
  return `₡${Math.round(v).toLocaleString('es-CR')}`
}

function fmtDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-CR', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function fmtYM(ym: string, yearFull = false): string {
  const d = new Date(ym + '-01T12:00:00')
  return d.toLocaleDateString('es', {
    month: 'short',
    year: yearFull ? 'numeric' : '2-digit',
  })
}

function paymentLabel(t: string): string {
  if (t === 'extra') return 'Abono'
  return 'Normal'
}

const PAYMENT_COLOR: Record<string, string> = {
  normal:  '#a3e635',
  partial: '#a3e635',
  extra:   '#f59e0b',
}

// ── Root component ──────────────────────────────────────────────────────────

export function LoansClient({ loans }: { loans: LoanData[] }) {
  if (loans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center gap-3">
        <p className="text-xl font-black text-white">Préstamos</p>
        <p className="text-sm text-zinc-500">Sin préstamos registrados.</p>
      </div>
    )
  }

  return (
    <div className="space-y-10">
      {loans.map(loan => <LoanCard key={loan.id} loan={loan} />)}
    </div>
  )
}

// ── Per-loan card ────────────────────────────────────────────────────────────

function LoanCard({ loan }: { loan: LoanData }) {
  const [tab, setTab] = useState<'proyeccion' | 'historial' | 'simulador'>('proyeccion')
  const [showAll, setShowAll] = useState(false)

  const schedule = computeSchedule(
    loan.currentBalance,
    loan.interestRate,
    loan.remainingMonths,
    loan.monthlyInsurance,
    0,
    loan.startYearMonth,
  )

  const paidPct = Math.min(100,
    ((loan.originalAmount - loan.currentBalance) / loan.originalAmount) * 100,
  )

  const displayRows = showAll ? schedule.rows : schedule.rows.slice(0, 24)

  const TABS = [
    { id: 'proyeccion' as const,  label: 'Proyección'  },
    { id: 'historial'  as const,  label: 'Historial'   },
    { id: 'simulador'  as const,  label: 'Simulador'   },
  ]

  return (
    <div className="space-y-4">
      {/* Summary card */}
      <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">{loan.lender}</p>
            <p className="text-2xl font-black text-white mt-0.5">{loan.name}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] text-zinc-500 uppercase tracking-wider">Saldo actual</p>
            <p className="text-3xl font-black text-[#a3e635] leading-none mt-0.5">{fmtCRC(loan.currentBalance, true)}</p>
            <p className="text-[10px] text-zinc-600 mt-0.5">de {fmtCRC(loan.originalAmount, true)} original</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#a3e635]/50 to-[#a3e635] transition-all duration-700"
              style={{ width: `${paidPct.toFixed(1)}%` }}
            />
          </div>
          <div className="flex justify-between text-[9px] text-zinc-600">
            <span>{paidPct.toFixed(1)}% cancelado</span>
            <span>{(100 - paidPct).toFixed(1)}% pendiente</span>
          </div>
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Tile label="Tasa" value={`${loan.interestRate.toFixed(2)}%`} sub="anual" />
          <Tile label="Cuota base" value={fmtCRC(schedule.baseMonthlyPayment, true)} sub="capital + interés" />
          <Tile label="Total mensual" value={fmtCRC(schedule.baseMonthlyPayment + loan.monthlyInsurance, true)} sub="incl. seguro" />
          <Tile label="Cancelación" value={fmtYM(schedule.payoffYearMonth, true)} sub={`${schedule.monthsRemaining} meses`} />
        </div>

        {/* Rate history */}
        {loan.rateHistory.length > 0 && (
          <div className="pt-3 border-t border-white/[0.04]">
            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-wider mb-2">Historial de tasa</p>
            <div className="flex gap-2 flex-wrap">
              {[...loan.rateHistory].reverse().map((r, i) => (
                <div key={i}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 border ${
                    i === 0
                      ? 'bg-[#a3e635]/[0.06] border-[#a3e635]/20 text-[#a3e635]'
                      : 'bg-white/[0.02] border-white/[0.05] text-zinc-500'
                  }`}>
                  <span className="text-[9px]">{r.effective_date.slice(0, 10)}</span>
                  <span className="text-[10px] font-black">{r.rate.toFixed(2)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-0.5 bg-white/[0.03] rounded-xl p-0.5 border border-white/[0.05] w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 rounded-lg text-[10px] font-black tracking-wider transition-all ${
              tab === t.id ? 'bg-white/[0.10] text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Proyección tab */}
      {tab === 'proyeccion' && (
        <div className="rounded-2xl bg-white/[0.02] border border-white/[0.05] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {['#', 'Mes', 'Saldo inicio', 'Interés', 'Capital', 'Seguro', 'Total', 'Saldo fin'].map(h => (
                    <th key={h} className={`px-3 py-2.5 text-[9px] font-black text-zinc-500 uppercase tracking-wider whitespace-nowrap ${
                      h === '#' || h === 'Mes' ? 'text-left' : 'text-right'
                    }`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row, i) => (
                  <tr key={row.month}
                    className={`border-b border-white/[0.03] transition-colors hover:bg-white/[0.02] ${i % 2 !== 0 ? 'bg-white/[0.01]' : ''}`}>
                    <td className="px-3 py-1.5 text-[10px] text-zinc-600 tabular-nums">{row.month}</td>
                    <td className="px-3 py-1.5 text-[10px] text-zinc-400 whitespace-nowrap">{fmtYM(row.yearMonth)}</td>
                    <td className="px-3 py-1.5 text-[10px] text-right text-zinc-500 tabular-nums">{fmtCRC(row.balanceStart, true)}</td>
                    <td className="px-3 py-1.5 text-[10px] text-right text-rose-400/70 tabular-nums">{fmtCRC(row.interest)}</td>
                    <td className="px-3 py-1.5 text-[10px] text-right text-[#a3e635]/70 tabular-nums">{fmtCRC(row.principal)}</td>
                    <td className="px-3 py-1.5 text-[10px] text-right text-zinc-600 tabular-nums">{fmtCRC(row.insurance)}</td>
                    <td className="px-3 py-1.5 text-[10px] text-right text-zinc-300 font-semibold tabular-nums">{fmtCRC(row.totalPayment)}</td>
                    <td className="px-3 py-1.5 text-[10px] text-right text-zinc-500 tabular-nums">{fmtCRC(row.balanceEnd, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {schedule.rows.length > 24 && (
            <div className="px-4 py-3 border-t border-white/[0.05] flex items-center justify-between">
              <span className="text-[10px] text-zinc-600">
                {schedule.rows.length} cuotas · interés total {fmtCRC(schedule.totalInterest, true)}
              </span>
              <button onClick={() => setShowAll(v => !v)}
                className="text-[10px] text-[#a3e635]/70 hover:text-[#a3e635] transition-colors font-black">
                {showAll ? 'Mostrar menos ↑' : `Ver todas (${schedule.rows.length}) ↓`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Historial tab */}
      {tab === 'historial' && (
        <div className="rounded-2xl bg-white/[0.02] border border-white/[0.05] overflow-hidden">
          {loan.payments.length === 0 ? (
            <p className="text-xs text-zinc-600 text-center py-8">Sin pagos registrados.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    {['Fecha', 'Tipo', 'Saldo antes', 'Cancelado', 'Capital', 'Saldo después', 'Tasa'].map(h => (
                      <th key={h} className={`px-3 py-2.5 text-[9px] font-black text-zinc-500 uppercase tracking-wider whitespace-nowrap ${
                        h === 'Fecha' || h === 'Tipo' ? 'text-left' : 'text-right'
                      }`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loan.payments.map((p, i) => {
                    const col = PAYMENT_COLOR[p.payment_type] ?? '#818cf8'
                    return (
                      <tr key={p.id}
                        className={`border-b border-white/[0.03] transition-colors hover:bg-white/[0.02] ${i % 2 !== 0 ? 'bg-white/[0.01]' : ''}`}>
                        <td className="px-3 py-2 text-[10px] text-zinc-400 whitespace-nowrap">{fmtDate(p.payment_date)}</td>
                        <td className="px-3 py-2">
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md whitespace-nowrap"
                            style={{ color: col, backgroundColor: col + '1a' }}>
                            {paymentLabel(p.payment_type)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[10px] text-right text-zinc-500 tabular-nums">{fmtCRC(p.balance_before, true)}</td>
                        <td className="px-3 py-2 text-[10px] text-right text-zinc-300 font-semibold tabular-nums">{fmtCRC(p.amount)}</td>
                        <td className="px-3 py-2 text-[10px] text-right text-[#a3e635]/70 tabular-nums">{fmtCRC(p.balance_before - p.balance_after)}</td>
                        <td className="px-3 py-2 text-[10px] text-right text-zinc-500 tabular-nums">{fmtCRC(p.balance_after, true)}</td>
                        <td className="px-3 py-2 text-[10px] text-right text-zinc-600 tabular-nums">{p.rate_applied.toFixed(2)}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Simulador tab */}
      {tab === 'simulador' && <SimuladorTab loan={loan} schedule={schedule} />}
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-white/[0.03] rounded-xl border border-white/[0.05] px-3 py-2.5">
      <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-sm font-black text-zinc-200 leading-tight">{value}</p>
      <p className="text-[9px] text-zinc-600 mt-0.5">{sub}</p>
    </div>
  )
}

// ── Simulador ────────────────────────────────────────────────────────────────

const PRESETS = [100_000, 250_000, 500_000, 1_000_000]

function SimuladorTab({ loan, schedule }: { loan: LoanData; schedule: AmortizationResult }) {
  const [extra, setExtra]       = useState(0)
  const [inputVal, setInputVal] = useState('')

  const sim = extra > 0
    ? simulateExtra(
        loan.currentBalance, loan.interestRate, loan.remainingMonths,
        loan.monthlyInsurance, extra, loan.startYearMonth,
      )
    : null

  return (
    <div className="rounded-2xl bg-white/[0.02] border border-white/[0.05] p-5 space-y-5">
      <div>
        <p className="text-[9px] font-black text-zinc-500 uppercase tracking-wider mb-3">Abono extra mensual</p>
        <div className="flex flex-wrap gap-2 items-center">
          {PRESETS.map(p => (
            <button key={p}
              onClick={() => { setExtra(p); setInputVal(String(p)) }}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all border ${
                extra === p
                  ? 'bg-[#a3e635]/20 text-[#a3e635] border-[#a3e635]/30'
                  : 'bg-white/[0.04] text-zinc-400 border-white/[0.06] hover:text-zinc-200'
              }`}>
              {fmtCRC(p, true)}
            </button>
          ))}
          <input
            type="number"
            value={inputVal}
            onChange={e => { setInputVal(e.target.value); setExtra(Number(e.target.value) || 0) }}
            placeholder="Otro monto"
            className="w-36 bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40"
          />
          {extra > 0 && (
            <button onClick={() => { setExtra(0); setInputVal('') }}
              className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors">
              Limpiar
            </button>
          )}
        </div>
      </div>

      {sim ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <SimTile label="Meses ahorrados"  value={String(sim.monthsSaved)}            highlight />
            <SimTile label="Años ahorrados"   value={sim.yearsSaved.toFixed(1)}          />
            <SimTile label="Interés ahorrado" value={fmtCRC(sim.interestSaved, true)}    />
            <SimTile label="Nueva cancelación" value={fmtYM(sim.newPayoffYearMonth, true)} />
          </div>

          <div className="p-4 rounded-xl bg-[#a3e635]/[0.04] border border-[#a3e635]/[0.12] space-y-3">
            <p className="text-[9px] font-black text-[#a3e635]/60 uppercase tracking-wider">Comparativa</p>
            <div className="grid grid-cols-2 gap-4 text-[11px]">
              <div className="space-y-1.5">
                <p className="text-[9px] font-black text-zinc-600 uppercase tracking-wider">Sin abono extra</p>
                <Row k="Cancela en"       v={fmtYM(schedule.payoffYearMonth, true)} />
                <Row k="Cuota total"      v={fmtCRC(schedule.baseMonthlyPayment + loan.monthlyInsurance)} />
                <Row k="Total intereses"  v={fmtCRC(schedule.totalInterest, true)} />
              </div>
              <div className="space-y-1.5">
                <p className="text-[9px] font-black text-[#a3e635]/50 uppercase tracking-wider">Con {fmtCRC(extra, true)} extra</p>
                <Row k="Cancela en"      v={fmtYM(sim.newPayoffYearMonth, true)} accent />
                <Row k="Cuota total"     v={fmtCRC(sim.newMonthlyTotal)}          accent />
                <Row k="Total intereses" v={fmtCRC(schedule.totalInterest - sim.interestSaved, true)} accent />
              </div>
            </div>
          </div>
        </>
      ) : (
        <p className="text-xs text-zinc-600 text-center py-6">
          Seleccioná o ingresá un monto de abono extra para ver la proyección.
        </p>
      )}
    </div>
  )
}

function SimTile({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-white/[0.03] rounded-xl border border-white/[0.05] px-3 py-2.5">
      <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-xl font-black leading-tight ${highlight ? 'text-[#a3e635]' : 'text-zinc-200'}`}>{value}</p>
    </div>
  )
}

function Row({ k, v, accent = false }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-zinc-500 text-[10px]">{k}</span>
      <span className={`font-black text-[11px] ${accent ? 'text-[#a3e635]' : 'text-zinc-300'}`}>{v}</span>
    </div>
  )
}
