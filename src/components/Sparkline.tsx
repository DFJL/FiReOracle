// Tiny inline trend line — no axes/labels, meant to sit inside an existing
// KPI card/row instead of adding a whole new chart section. `title` carries
// the "then → now" detail as a native hover tooltip instead of more
// on-screen text.
export function Sparkline({
  data,
  color,
  title,
  width = 60,
  height = 18,
}: {
  data: number[]
  color: string
  title?: string
  width?: number
  height?: number
}) {
  if (data.length < 2) return null
  const max = Math.max(...data, 0.0001)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  // Leave a little headroom so the line/dot never clips the svg edge.
  const pad = 2
  const innerH = height - pad * 2
  const coords = data.map((v, i) => ({
    x: (i / (data.length - 1)) * width,
    y: pad + innerH - ((v - min) / range) * innerH,
  }))
  const pts = coords.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const last = coords[coords.length - 1]
  return (
    <div title={title}>
      <svg width={width} height={height} className="overflow-visible">
        <polyline
          points={pts}
          fill="none"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={last.x} cy={last.y} r={2} fill={color} />
      </svg>
    </div>
  )
}
