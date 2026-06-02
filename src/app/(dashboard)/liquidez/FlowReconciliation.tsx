'use client'

import { useState } from 'react'
import type { RecentIncome } from './page'

function fmtCRC(n: number) {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `₡${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `₡${Math.round(n / 1_000)}K`
  return `₡${Math.round(n).toLocaleString('es-CR')}`
}

function Row({ label, value, sub, color = 'text-zinc-300' }: {
  label: string; value: number; sub?: string; color?: string
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
      <div>
        <p className="text-xs text-zinc-400">{label}</p>
        {sub && <p className="text-[9px] text-zinc-600 mt-0.5">{sub}</p>}
      </div>
      <span className={`text-sm font-black tabular-nums shrink-0 ml-4 ${color}`}>{fmtCRC(value)}</span>
    </div>
  )
}

export function FlowReconciliation({
  incomeRegular, incomeSettlement, expenseTotal, cashWithdrawals,
  ledgerNet, envelopeTotal, recentIncome,
}: {
  incomeRegular: number
  incomeSettlement: number
  expenseTotal: number
  cashWithdrawals: number
  ledgerNet: number
  envelopeTotal: number
  recentIncome: RecentIncome[]
}) {
  const [showIncome, setShowIncome] = useState(false)

  const gap = envelopeTotal - ledgerNet

  // Gap interpretation
  const gapAbs = Math.abs(gap)
  let gapColor   = 'text-lime-400'
  let gapBg      = 'bg-lime-500/10 border-lime-500/20'
  let gapLabel   = '✓ Flujos cuadrados'
  let gapDetail  = 'El saldo del ledger coincide con los sobres.'

  if (gapAbs >= 1000) {
    if (gap > 0) {
      // Envelopes have more than ledger explains
      gapColor  = 'text-amber-400'
      gapBg     = 'bg-amber-500/10 border-amber-500/20'
      gapLabel  = `+${fmtCRC(gap)} sin origen registrado`
      gapDetail = 'Hay dinero en sobres que no tiene ingreso correspondiente en el sistema (saldo inicial, transferencia no registrada, etc.).'
    } else {
      // Ledger shows more income than what's in envelopes
      gapColor  = 'text-rose-400'
      gapBg     = 'bg-rose-500/10 border-rose-500/20'
      gapLabel  = `${fmtCRC(gap)} de ingresos sin asignar a sobres`
      gapDetail = 'El sistema registra más ingresos/liquidaciones de los que aparecen en sobres. Puede haber dinero en cuentas bancarias no asignado a ningún sobre.'
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.18em]">Cuadre de flujos</p>
        <p className="text-[10px] text-zinc-600 mt-0.5">Ledger de transacciones vs saldo en sobres</p>
      </div>

      {/* Ledger breakdown */}
      <div className="rounded-2xl bg-[#0d120d] border border-white/[0.08] overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Sistema de transacciones (ledger)</p>
        </div>
        <div className="px-4 py-1">
          <Row label="Ingresos regulares" value={incomeRegular} sub="salario, alquiler, otros" color="text-[#a3e635]" />
          <Row label="Liquidaciones e inversiones" value={incomeSettlement} sub="crypto, fondos, OPCs" color="text-[#a3e635]" />
          <Row label="Gastos registrados" value={-expenseTotal} sub="todos los egresos" color="text-rose-400" />
          {cashWithdrawals > 0 && (
            <Row label="Retiros de efectivo" value={-cashWithdrawals} color="text-rose-400" />
          )}
        </div>
        <div className="px-4 py-3 border-t border-white/[0.08] flex items-center justify-between">
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Saldo neto del ledger</p>
          <span className={`text-sm font-black tabular-nums ${ledgerNet >= 0 ? 'text-zinc-200' : 'text-rose-400'}`}>
            {fmtCRC(ledgerNet)}
          </span>
        </div>
      </div>

      {/* Envelope total */}
      <div className="rounded-2xl bg-[#0d120d] border border-white/[0.08] px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Saldo en sobres</p>
          <p className="text-[9px] text-zinc-600 mt-0.5">Suma de movimientos en sobres (sin intereses)</p>
        </div>
        <span className="text-sm font-black tabular-nums text-amber-400">{fmtCRC(envelopeTotal)}</span>
      </div>

      {/* Gap result */}
      <div className={`rounded-2xl border px-4 py-3 space-y-1 ${gapBg}`}>
        <div className="flex items-center justify-between">
          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-zinc-400">Brecha</p>
          <span className={`text-sm font-black tabular-nums ${gapColor}`}>{gapLabel}</span>
        </div>
        <p className="text-[10px] text-zinc-500">{gapDetail}</p>
      </div>

      {/* Recent income toggle */}
      <div className="rounded-2xl bg-[#0d120d] border border-white/[0.08] overflow-hidden">
        <button
          onClick={() => setShowIncome(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
        >
          <div className="text-left">
            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Ingresos recientes registrados</p>
            <p className="text-[9px] text-zinc-600 mt-0.5">Últimos 30 ingresos — verificá que todo esté</p>
          </div>
          <span className="text-zinc-600 text-[10px] ml-4 shrink-0">{showIncome ? '−' : '+'}</span>
        </button>

        {showIncome && (
          <div className="border-t border-white/[0.06]">
            {recentIncome.length === 0 ? (
              <p className="px-4 py-3 text-[10px] text-zinc-600">Sin ingresos registrados.</p>
            ) : (
              recentIncome.map(tx => (
                <div key={tx.id} className="flex items-center justify-between px-4 py-2 border-b border-white/[0.03] last:border-0">
                  <div className="flex-1 min-w-0 pr-3">
                    <p className="text-[11px] text-zinc-300 truncate">
                      {tx.concept || tx.vendor || '—'}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] text-zinc-600">{tx.date}</span>
                      {tx.is_settlement && (
                        <span className="text-[8px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400">
                          Liquidación
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-[11px] font-bold tabular-nums text-[#a3e635] shrink-0">{fmtCRC(tx.amount)}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
