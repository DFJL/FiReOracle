'use client'

import { useState } from 'react'
import { X, Wallet, TrendingDown, Target } from 'lucide-react'
import type { Alert } from '@/lib/alerts'

const ICONS = {
  runway: Wallet,
  budget: TrendingDown,
  goal: Target,
}

const COLORS = {
  error: {
    border: 'border-rose-500/30',
    bg: 'bg-rose-500/[0.08]',
    text: 'text-rose-200',
    icon: 'text-rose-400',
  },
  warning: {
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/[0.07]',
    text: 'text-amber-200',
    icon: 'text-amber-400',
  },
}

export function AlertsBanner({ alerts }: { alerts: Alert[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const visible = alerts.filter((a) => !dismissed.has(a.id))
  if (visible.length === 0) return null

  return (
    <div className="flex flex-col gap-px">
      {visible.map((alert) => {
        const c = COLORS[alert.severity]
        const Icon = ICONS[alert.type] ?? Wallet
        return (
          <div
            key={alert.id}
            className={`flex items-center gap-3 px-4 py-2.5 ${c.bg} border-b ${c.border}`}
          >
            <Icon size={13} className={`${c.icon} shrink-0`} />
            <p className="flex-1 text-xs leading-snug">
              <span className={`font-bold ${c.text}`}>{alert.title}</span>
              <span className="text-zinc-400"> — {alert.message}</span>
            </p>
            <button
              onClick={() => setDismissed((prev) => new Set([...prev, alert.id]))}
              className="shrink-0 p-1 rounded text-zinc-600 hover:text-zinc-400 transition-colors"
              aria-label="Descartar alerta"
            >
              <X size={11} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
