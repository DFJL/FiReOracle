'use client'

import { useState } from 'react'

// Tiny inline trend line — no axes/labels, meant to sit inside an existing
// KPI card/row instead of adding a whole new chart section. Interactive: a
// custom popover on hover/tap (not a native `title`, which is slow to show
// and easy to miss — someone mistook the old version for a monitor
// scratch). Color defaults to a fixed accent distinct from any card's own
// semaphore color (red/amber/lime), so the line never blends into the
// background just because the metric it's attached to reads "bad".
const DEFAULT_COLOR = '#38bdf8' // sky — reads as "trend", not "status"

export function Sparkline({
  data,
  color = DEFAULT_COLOR,
  label,
  title,
  width = 60,
  height = 18,
}: {
  data: number[]
  color?: string
  label?: string
  title?: string
  width?: number
  height?: number
}) {
  const [show, setShow] = useState(false)
  if (data.length < 2) return null

  const max = Math.max(...data, 0.0001)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const pad = 2
  const innerH = height - pad * 2
  const coords = data.map((v, i) => ({
    x: (i / (data.length - 1)) * width,
    y: pad + innerH - ((v - min) / range) * innerH,
  }))
  const pts = coords.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const last = coords[coords.length - 1]

  return (
    <div
      className="relative"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={() => setShow(v => !v)}
    >
      <svg width={width} height={height} className="overflow-visible cursor-pointer">
        <polyline
          points={pts}
          fill="none"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={last.x} cy={last.y} r={2.2} fill={color} />
      </svg>
      {show && title && (
        <div className="absolute bottom-full right-0 mb-2 z-50 w-44 bg-zinc-900 border border-white/10 rounded-lg p-2.5 shadow-xl pointer-events-none">
          {label && (
            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-wide mb-1">{label}</p>
          )}
          <p className="text-[10px] text-zinc-300 leading-relaxed">{title}</p>
          <div className="absolute top-full right-2 border-4 border-transparent border-t-zinc-900" />
        </div>
      )}
    </div>
  )
}
