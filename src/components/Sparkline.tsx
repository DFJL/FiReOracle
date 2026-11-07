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
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width
      const y = height - ((v - min) / range) * height
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <div title={title}>
      <svg width={width} height={height} className="overflow-visible">
        <polyline
          points={pts}
          fill="none"
          stroke={color}
          strokeWidth={1.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.75}
        />
      </svg>
    </div>
  )
}
