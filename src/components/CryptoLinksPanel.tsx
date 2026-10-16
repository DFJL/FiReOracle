'use client'

import { useState, useEffect, useTransition } from 'react'
import { getCryptoPortfolioLinks, updateCryptoPortfolioLink, type CryptoPortfolioLink } from '@/app/actions/cryptoPortfolioLinks'
import { syncCryptoBucketBalance } from '@/app/actions/cryptoBucketSync'

export function CryptoLinksPanel({ bucketId, onClose }: { bucketId: string; onClose: () => void }) {
  const [links, setLinks]     = useState<CryptoPortfolioLink[]>([])
  const [drafts, setDrafts]   = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [msg, setMsg]         = useState('')
  const [isPending, start]    = useTransition()

  useEffect(() => {
    getCryptoPortfolioLinks(bucketId).then(res => {
      setLinks(res)
      setDrafts(Object.fromEntries(res.map(l => [l.id, String(l.ownership_pct)])))
      setLoading(false)
    })
  }, [bucketId])

  function saveOne(linkId: string) {
    const pct = parseFloat(drafts[linkId])
    if (isNaN(pct)) { setError('% inválido'); return }
    setError('')
    start(async () => {
      const res = await updateCryptoPortfolioLink(linkId, pct)
      if (res.error) { setError(res.error); return }
      setLinks(prev => prev.map(l => l.id === linkId ? { ...l, ownership_pct: pct } : l))
      setMsg('Guardado — dale "Sinc. balance" para que el valor refleje el cambio.')
    })
  }

  function resync() {
    setMsg('')
    setError('')
    start(async () => {
      const res = await syncCryptoBucketBalance()
      setMsg(res.error ? '' : `${res.synced} bucket${res.synced === 1 ? '' : 's'} actualizado${res.synced === 1 ? '' : 's'}`)
      if (res.error) setError(res.error)
    })
  }

  const inputCls = 'w-20 bg-white/[0.06] border border-white/[0.08] rounded-lg px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:border-[#a3e635]/40'

  if (loading) return <p className="text-[10px] text-zinc-600 px-4 py-3">Cargando…</p>

  return (
    <div className="p-4 space-y-3">
      <p className="text-[9px] font-black text-[#a3e635]/60 uppercase tracking-widest">Portfolios de DeFiReTracker</p>
      <p className="text-[9px] text-zinc-600 leading-relaxed">
        El balance de este bucket se calcula solo, en vivo, a partir de estos portfolios — ponderado
        por el % que te corresponde de cada uno (100% si es solo tuyo).
      </p>

      {links.length === 0 ? (
        <p className="text-xs text-zinc-600 italic">Sin portfolios vinculados.</p>
      ) : (
        <div className="space-y-2">
          {links.map(l => (
            <div key={l.id} className="flex items-center justify-between gap-3 bg-white/[0.03] rounded-xl px-3 py-2">
              <span className="text-sm text-zinc-200 truncate">{l.portfolio_name}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <input type="number" min="0" max="100" step="1"
                  value={drafts[l.id] ?? ''}
                  onChange={e => setDrafts(prev => ({ ...prev, [l.id]: e.target.value }))}
                  className={inputCls} />
                <span className="text-xs text-zinc-500">%</span>
                <button onClick={() => saveOne(l.id)} disabled={isPending || drafts[l.id] === String(l.ownership_pct)}
                  className="px-2.5 py-1.5 rounded-lg bg-[#a3e635]/10 text-[#a3e635] text-[10px] font-bold hover:bg-[#a3e635]/20 disabled:opacity-30 transition-colors">
                  Guardar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-rose-400">{error}</p>}
      {msg && <p className="text-xs text-[#a3e635]">{msg}</p>}

      <div className="flex gap-2 pt-1">
        <button onClick={resync} disabled={isPending}
          className="px-4 py-2 rounded-lg bg-[#a3e635] text-black text-xs font-black disabled:opacity-50 transition-opacity">
          {isPending ? '...' : 'Sinc. balance ahora'}
        </button>
        <button onClick={onClose}
          className="px-4 py-2 rounded-lg bg-white/[0.06] text-zinc-400 text-xs hover:text-zinc-200 transition-colors">
          Cerrar
        </button>
      </div>
    </div>
  )
}
