'use client'

import { useState, useEffect, useTransition } from 'react'
import { getAccountSyncData, syncAccountBalance, type PositionInput } from '@/app/actions/accountSync'

type Row = PositionInput & { key: number }

let rowSeq = 0
function emptyRow(): Row {
  return { key: rowSeq++, symbol: '', quantity: 0, market_value_usd: 0, avg_cost_usd: null }
}

// Accepts one position per line, fields separated by tab / comma / spaces —
// matches what you get pasting straight out of IBKR's positions table.
// "VXUS  12  601.44" or "VXUS, 12, 601.44" or a tab-separated paste all work.
function parsePositions(text: string): Row[] {
  return text.split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const tokens = line.split(/\t|,|\s+/).map(t => t.trim()).filter(Boolean)
      const symbol = tokens[0]?.toUpperCase() ?? ''
      const nums = tokens.slice(1)
        .map(t => parseFloat(t.replace(/[$,]/g, '')))
        .filter(n => !isNaN(n))
      return {
        key: rowSeq++,
        symbol,
        quantity: nums[0] ?? 0,
        market_value_usd: nums[1] ?? nums[0] ?? 0,
        avg_cost_usd: nums[2] ?? null,
      }
    })
    .filter(r => r.symbol)
}

export function AccountSyncPanel({ accountId, currencyCode, onClose }: {
  accountId: string
  currencyCode: string
  onClose: () => void
}) {
  const [loading, setLoading]   = useState(true)
  const [balance, setBalance]   = useState('')
  const [rows, setRows]         = useState<Row[]>([])
  const [pasteText, setPasteText] = useState('')
  const [lastSync, setLastSync] = useState<{ date: string | null; balanceNative: number | null }>({ date: null, balanceNative: null })
  const [error, setError]       = useState('')
  const [saved, setSaved]       = useState(false)
  const [isPending, start]      = useTransition()

  useEffect(() => {
    getAccountSyncData(accountId).then(res => {
      if ('error' in res) { setError(res.error ?? 'Error desconocido'); setLoading(false); return }
      setLastSync({ date: res.lastSnapshotDate, balanceNative: res.lastBalanceNative })
      // Deliberately NOT pre-filling `balance` from the last snapshot: this is a
      // reconciliation field, meant to be typed fresh from the real account each
      // time. Pre-filling from a re-derived number is how the last FX drift bug
      // got re-introduced (user trusted the pre-filled figure without checking).
      setRows(res.positions.length > 0
        ? res.positions.map(p => ({ ...p, key: rowSeq++ }))
        : [])
      setLoading(false)
    })
  }, [accountId])

  function updateRow(key: number, patch: Partial<Row>) {
    setRows(prev => prev.map(r => r.key === key ? { ...r, ...patch } : r))
  }

  function applyPaste() {
    const parsed = parsePositions(pasteText)
    if (parsed.length === 0) return
    setRows(prev => [...prev, ...parsed])
    setPasteText('')
  }

  function submit() {
    const bal = parseFloat(balance)
    if (!bal || bal <= 0) { setError('Ingresá el balance real actual (mirá tu cuenta)'); return }
    setError('')
    start(async () => {
      const res = await syncAccountBalance(accountId, {
        real_balance_native: bal,
        positions: rows
          .filter(r => r.symbol.trim())
          .map(({ symbol, quantity, market_value_usd, avg_cost_usd }) => ({ symbol, quantity, market_value_usd, avg_cost_usd })),
      })
      if (res?.error) { setError(res.error); return }
      setSaved(true)
      setTimeout(onClose, 900)
    })
  }

  const inputCls = 'w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40'

  if (loading) return <p className="text-[10px] text-zinc-600 px-4 py-3">Cargando…</p>

  return (
    <div className="p-4 space-y-3">
      <p className="text-[9px] font-black text-[#a3e635]/60 uppercase tracking-widest">Sincronizar balance real</p>
      {lastSync.date && (
        <p className="text-[9px] text-zinc-600">
          Último registrado: {lastSync.date}{lastSync.balanceNative != null ? ` · ${lastSync.balanceNative.toFixed(2)} ${currencyCode}` : ''}
          {' '}— mirá la cuenta real y escribí lo que ves ahora, no reutilices este número.
        </p>
      )}

      <div>
        <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">
          Balance total real ({currencyCode})
        </p>
        <input type="number" min="0" step="0.01" value={balance} onChange={e => setBalance(e.target.value)}
          placeholder="Ej. 762.07" className={inputCls} autoFocus />
      </div>

      <div className="space-y-2">
        <p className="text-[9px] text-zinc-500 uppercase tracking-wider">Posiciones (opcional)</p>

        <div>
          <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} rows={3}
            placeholder={'Pegá la tabla de posiciones tal cual (una por línea):\nVXUS  12  601.44\nAAPL  2   398.20'}
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-[#a3e635]/40 resize-none" />
          <button type="button" onClick={applyPaste} disabled={!pasteText.trim()}
            className="mt-1 text-[10px] text-[#a3e635]/80 hover:text-[#a3e635] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            ↳ Parsear y agregar
          </button>
        </div>

        {rows.length > 0 && (
          <div className="space-y-1.5">
            {rows.map(r => (
              <div key={r.key} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1.5">
                <input value={r.symbol} onChange={e => updateRow(r.key, { symbol: e.target.value })}
                  placeholder="VXUS" className={inputCls} />
                <input type="number" step="any" value={r.quantity || ''} onChange={e => updateRow(r.key, { quantity: parseFloat(e.target.value) || 0 })}
                  placeholder="Cant." className={inputCls} />
                <input type="number" step="any" value={r.market_value_usd || ''} onChange={e => updateRow(r.key, { market_value_usd: parseFloat(e.target.value) || 0 })}
                  placeholder="Valor $" className={inputCls} />
                <button type="button" onClick={() => setRows(prev => prev.filter(x => x.key !== r.key))}
                  className="px-2 rounded-lg bg-white/[0.04] text-zinc-600 hover:text-rose-400 transition-colors text-xs">
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        <button type="button" onClick={() => setRows(prev => [...prev, emptyRow()])}
          className="text-[10px] text-zinc-600 hover:text-zinc-300 transition-colors">
          + Agregar posición manual
        </button>
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}
      {saved && <p className="text-xs text-[#a3e635]">Sincronizado ✓</p>}

      <div className="flex gap-2">
        <button onClick={submit} disabled={isPending}
          className="px-4 py-2 rounded-lg bg-[#a3e635] text-black text-xs font-black disabled:opacity-50 transition-opacity">
          {isPending ? '...' : 'Sincronizar'}
        </button>
        <button onClick={onClose}
          className="px-4 py-2 rounded-lg bg-white/[0.06] text-zinc-400 text-xs hover:text-zinc-200 transition-colors">
          Cancelar
        </button>
      </div>
    </div>
  )
}
