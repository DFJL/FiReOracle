import type { NetWorthItem } from '@/app/actions/netWorthItems'

const CAT_META = {
  liquido:   { label: 'Líquido',   color: '#f59e0b', border: 'border-amber-500/20',   head: 'bg-amber-500/[0.06]'   },
  invertido: { label: 'Invertido', color: '#a3e635', border: 'border-[#a3e635]/20',  head: 'bg-[#a3e635]/[0.04]'  },
  iliquido:  { label: 'Ilíquido',  color: '#60a5fa', border: 'border-blue-500/20',   head: 'bg-blue-500/[0.04]'   },
  pasivo:    { label: 'Pasivos',   color: '#f43f5e', border: 'border-rose-500/20',   head: 'bg-rose-500/[0.04]'   },
} as const

type Category = keyof typeof CAT_META
const CATEGORY_ORDER: Category[] = ['liquido', 'invertido', 'iliquido', 'pasivo']

export function ComposicionDetallada({
  items,
  fmt,
}: {
  items: NetWorthItem[]
  fmt: (v: number) => string
}) {
  if (items.length === 0) return null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {CATEGORY_ORDER.map(cat => {
        const catItems = [...items.filter(i => i.category === cat)]
          .sort((a, b) => a.sort_order - b.sort_order)
        if (catItems.length === 0) return null
        const total = catItems.reduce((s, i) => s + Number(i.value_crc), 0)
        const m = CAT_META[cat]
        return (
          <div key={cat} className={`rounded-xl border ${m.border} overflow-hidden`}>
            <div className={`px-3 py-2 border-b border-white/[0.05] flex items-center justify-between ${m.head}`}>
              <p className="text-[9px] font-black uppercase tracking-[0.12em]" style={{ color: m.color }}>
                {m.label}
              </p>
              <p className="text-xs font-bold" style={{ color: m.color }}>{fmt(total)}</p>
            </div>
            {catItems.map(item => (
              <div key={item.id}
                className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.03] last:border-0 bg-white/[0.01]">
                <p className="text-xs text-zinc-300">{item.item_name}</p>
                <p className="text-xs font-bold tabular-nums" style={{ color: m.color }}>
                  {fmt(Number(item.value_crc))}
                </p>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
