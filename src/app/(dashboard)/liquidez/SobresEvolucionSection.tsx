import type { SobreEvolucion } from './page'

function fmtCRC(n: number) {
  return `₡${Math.round(n).toLocaleString('es-CR')}`
}

function fmtSince(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-CR', { month: 'short', year: '2-digit' })
}

export function SobresEvolucionSection({ sobres }: { sobres: SobreEvolucion[] }) {
  if (sobres.length === 0) return null
  const maxBalance = Math.max(...sobres.map(s => Math.abs(s.balance)), 1)

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Evolución de saldos</h2>
        <p className="text-[9px] text-zinc-600 mt-0.5">
          Saldo actual y cambio desde hace ~12 meses — o desde que empezó a trackearse ese sobre, si es menos
        </p>
      </div>
      <div className="space-y-1.5">
        {sobres.slice(0, 15).map(s => {
          const pct = Math.max((Math.abs(s.balance) / maxBalance) * 100, 1.5)
          const changeColor = s.change > 0 ? '#a3e635' : s.change < 0 ? '#f43f5e' : '#71717a'
          return (
            <div key={s.name} className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-400 w-28 shrink-0 truncate">{s.name}</span>
              <div className="flex-1 h-4 bg-white/[0.04] rounded overflow-hidden">
                <div
                  className="h-full rounded"
                  style={{ width: `${pct}%`, backgroundColor: s.balance >= 0 ? '#60a5fa' : '#f43f5e', opacity: 0.5 }}
                />
              </div>
              <span className="text-[9px] text-zinc-500 w-20 text-right shrink-0 tabular-nums">{fmtCRC(s.balance)}</span>
              <span className="text-[9px] w-20 text-right shrink-0 tabular-nums" style={{ color: changeColor }}>
                {s.change >= 0 ? '+' : ''}{fmtCRC(s.change)}
              </span>
              <span className="text-[8px] text-zinc-700 w-12 text-right shrink-0">desde {fmtSince(s.since)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
