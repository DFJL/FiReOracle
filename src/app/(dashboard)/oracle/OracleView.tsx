'use client'

import { useState, useRef, useEffect } from 'react'
import { Sparkles, SendHorizontal, Loader2, RotateCcw } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ChartPoint { label: string; value: number }

const SUGGESTIONS = [
  '¿En qué categorías debería reducir gastos para acelerar mi FIRE?',
  '¿Cuánto tiempo me falta para alcanzar independencia financiera?',
  '¿Cuál es mi tasa de cobertura pasiva y cómo mejorarla?',
  'Mostrame un gráfico de mis gastos por categoría',
  'Analiza mis gastos de supervivencia vs discrecionales',
  '¿Qué tan resiliente soy ante un período de desempleo de 6 meses?',
]

// ── Chart renderers ────────────────────────────────────────────────────────────

function BarChart({ data, title }: { data: ChartPoint[]; title: string }) {
  const max = Math.max(...data.map(d => d.value), 1)
  const fmt = (n: number) => n >= 1_000_000
    ? `₡${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000 ? `₡${Math.round(n / 1_000)}K` : `₡${Math.round(n)}`

  return (
    <div className="mt-2 mb-1 rounded-xl bg-[#0d120d] border border-[#a3e635]/[0.10] p-4 w-full">
      {title && <p className="text-[9px] font-black text-[#a3e635]/50 uppercase tracking-[0.18em] mb-3">{title}</p>}
      <div className="space-y-2">
        {data.map(({ label, value }) => {
          const pct = (value / max) * 100
          return (
            <div key={label} className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-400 w-28 shrink-0 truncate text-right">{label}</span>
              <div className="flex-1 h-5 bg-white/[0.04] rounded-md overflow-hidden relative">
                <div
                  className="h-full bg-[#a3e635]/60 rounded-md transition-all"
                  style={{ width: `${pct}%` }}
                />
                <span className="absolute right-2 top-0 h-full flex items-center text-[9px] text-zinc-400 tabular-nums">
                  {fmt(value)}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function LineChart({ data, title }: { data: ChartPoint[]; title: string }) {
  const W = 500, H = 120, px = 8, pt = 12, pb = 20
  const cH = H - pt - pb
  const cW = W - px * 2
  const vals = data.map(d => d.value)
  const minV = Math.min(...vals)
  const maxV = Math.max(...vals, minV + 1)
  const range = maxV - minV || 1
  const toX = (i: number) => px + (i / Math.max(data.length - 1, 1)) * cW
  const toY = (v: number) => pt + cH - ((v - minV) / range) * cH

  const xs = data.map((_, i) => toX(i))
  const ys = data.map(d => toY(d.value))
  let path = `M${xs[0].toFixed(1)},${ys[0].toFixed(1)}`
  for (let i = 1; i < xs.length; i++) {
    const cpX = ((xs[i - 1] + xs[i]) / 2).toFixed(1)
    path += ` C${cpX},${ys[i - 1].toFixed(1)} ${cpX},${ys[i].toFixed(1)} ${xs[i].toFixed(1)},${ys[i].toFixed(1)}`
  }
  const areaPath = path + ` L${xs[xs.length - 1].toFixed(1)},${(pt + cH).toFixed(1)} L${xs[0].toFixed(1)},${(pt + cH).toFixed(1)} Z`

  const fmt = (n: number) => n >= 1_000_000
    ? `₡${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000 ? `₡${Math.round(n / 1_000)}K` : `₡${Math.round(n)}`
  const step = data.length > 10 ? 2 : 1

  return (
    <div className="mt-2 mb-1 rounded-xl bg-[#0d120d] border border-[#a3e635]/[0.10] p-4 w-full">
      {title && <p className="text-[9px] font-black text-[#a3e635]/50 uppercase tracking-[0.18em] mb-2">{title}</p>}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="overflow-visible">
        <defs>
          <linearGradient id="oracle-line-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a3e635" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#a3e635" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#oracle-line-grad)" />
        <path d={path} fill="none" stroke="#a3e635" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((d, i) => (
          <g key={i}>
            <circle cx={xs[i]} cy={ys[i]} r="3" fill="#a3e635" stroke="#0d120d" strokeWidth="2" />
            {i % step === 0 && (
              <text x={xs[i]} y={H - 3} textAnchor="middle" fontSize="7" fill="rgb(82 82 91)">{d.label}</text>
            )}
          </g>
        ))}
        <text x={xs[xs.length - 1]} y={Math.max(ys[ys.length - 1] - 6, pt + 8)} textAnchor="end" fontSize="8" fill="#a3e635">
          {fmt(data[data.length - 1].value)}
        </text>
      </svg>
    </div>
  )
}

// ── Message parser: splits text + <chart> tags ─────────────────────────────────

type Part =
  | { type: 'text'; content: string }
  | { type: 'chart'; chartType: 'bar' | 'line'; title: string; data: ChartPoint[] }

const CHART_RE = /<chart\s+type="(bar|line)"\s+title="([^"]*)">([\s\S]*?)<\/chart>/g

function parseContent(raw: string): Part[] {
  const parts: Part[] = []
  let last = 0
  let match: RegExpExecArray | null
  CHART_RE.lastIndex = 0
  while ((match = CHART_RE.exec(raw)) !== null) {
    if (match.index > last) parts.push({ type: 'text', content: raw.slice(last, match.index) })
    try {
      const data: ChartPoint[] = JSON.parse(match[3].trim())
      parts.push({ type: 'chart', chartType: match[1] as 'bar' | 'line', title: match[2], data })
    } catch {
      parts.push({ type: 'text', content: match[0] })
    }
    last = CHART_RE.lastIndex
  }
  if (last < raw.length) parts.push({ type: 'text', content: raw.slice(last) })
  return parts
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

function MdContent({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="text-white font-bold">{children}</strong>,
        em: ({ children }) => <em className="text-zinc-300">{children}</em>,
        ul: ({ children }) => <ul className="list-disc list-inside space-y-0.5 mb-2 text-zinc-300">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside space-y-0.5 mb-2 text-zinc-300">{children}</ol>,
        li: ({ children }) => <li className="text-zinc-300">{children}</li>,
        h1: ({ children }) => <h1 className="text-base font-black text-white mb-2 mt-3">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-black text-white mb-1.5 mt-3">{children}</h2>,
        h3: ({ children }) => <h3 className="text-xs font-black text-zinc-200 mb-1 mt-2">{children}</h3>,
        code: ({ children, className }) => {
          const isBlock = className?.includes('language-')
          return isBlock
            ? <pre className="bg-black/30 rounded-lg px-3 py-2 text-[11px] font-mono text-zinc-300 overflow-x-auto mb-2">{children}</pre>
            : <code className="bg-white/[0.08] rounded px-1 py-0.5 text-[11px] font-mono text-[#a3e635]">{children}</code>
        },
        table: ({ children }) => (
          <div className="overflow-x-auto mb-2">
            <table className="w-full text-xs border-collapse">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="border-b border-white/[0.10]">{children}</thead>,
        tbody: ({ children }) => <tbody className="divide-y divide-white/[0.04]">{children}</tbody>,
        th: ({ children }) => <th className="px-3 py-1.5 text-left text-[9px] font-black text-zinc-500 uppercase tracking-wider">{children}</th>,
        td: ({ children }) => <td className="px-3 py-1.5 text-zinc-300 tabular-nums">{children}</td>,
        blockquote: ({ children }) => <blockquote className="border-l-2 border-[#a3e635]/40 pl-3 text-zinc-400 italic mb-2">{children}</blockquote>,
        hr: () => <hr className="border-white/[0.06] my-3" />,
      }}
    >
      {text}
    </ReactMarkdown>
  )
}

function AssistantContent({ content }: { content: string }) {
  const parts = parseContent(content)
  return (
    <div className="text-sm leading-relaxed text-zinc-200">
      {parts.map((part, i) =>
        part.type === 'text' ? (
          <MdContent key={i} text={part.content} />
        ) : part.chartType === 'bar' ? (
          <BarChart key={i} data={part.data} title={part.title} />
        ) : (
          <LineChart key={i} data={part.data} title={part.title} />
        )
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function OracleView({ context }: { context: string }) {
  const [messages, setMessages]     = useState<Message[]>([])
  const [input, setInput]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [streamText, setStreamText] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamText])

  async function send(text: string) {
    if (!text.trim() || loading) return
    const userMsg: Message = { role: 'user', content: text.trim() }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')
    setLoading(true)
    setStreamText('')

    try {
      const res = await fetch('/api/oracle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, context }),
      })

      if (!res.ok) {
        const errText = await res.text()
        setMessages(prev => [...prev, { role: 'assistant', content: `Error ${res.status}: ${errText}` }])
        return
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let full = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        full += decoder.decode(value, { stream: true })
        setStreamText(full)
      }
      setMessages(prev => [...prev, { role: 'assistant', content: full }])
      setStreamText('')
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error de conexión: ${String(e)}` }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-4 md:px-8 py-4 border-b border-[#a3e635]/[0.08] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-[#a3e635]/10 border border-[#a3e635]/20 flex items-center justify-center">
            <Sparkles size={16} className="text-[#a3e635]" />
          </div>
          <div>
            <p className="text-sm font-black text-white">Oracle</p>
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest">Análisis financiero con IA</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => { setMessages([]); setStreamText('') }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-zinc-600 hover:text-zinc-400 hover:bg-white/[0.04] transition-colors text-[10px] font-semibold uppercase tracking-wider"
          >
            <RotateCcw size={11} />
            Nueva conversación
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-6">
        {messages.length === 0 && !streamText && (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <div className="inline-flex w-16 h-16 rounded-2xl bg-[#a3e635]/10 border border-[#a3e635]/20 items-center justify-center mb-4">
                <Sparkles size={28} className="text-[#a3e635]" />
              </div>
              <p className="text-xl font-black text-white mb-1">¿Qué querés saber?</p>
              <p className="text-sm text-zinc-500">Tengo acceso a tus datos financieros de los últimos 12 meses.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => send(s)}
                  className="text-left px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-[#a3e635]/[0.06] hover:border-[#a3e635]/20 transition-all text-xs text-zinc-400 hover:text-zinc-200">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} max-w-3xl ${m.role === 'user' ? 'ml-auto' : 'mr-auto'}`}>
            {m.role === 'assistant' && (
              <div className="w-6 h-6 rounded-lg bg-[#a3e635]/10 border border-[#a3e635]/20 flex items-center justify-center shrink-0 mt-1 mr-3">
                <Sparkles size={12} className="text-[#a3e635]" />
              </div>
            )}
            <div className={`rounded-2xl px-4 py-3 text-sm max-w-full overflow-hidden ${
              m.role === 'user'
                ? 'bg-[#a3e635]/10 border border-[#a3e635]/20 text-zinc-200 rounded-tr-sm'
                : 'bg-white/[0.04] border border-white/[0.06] rounded-tl-sm'
            }`}>
              {m.role === 'user'
                ? <p className="whitespace-pre-wrap">{m.content}</p>
                : <AssistantContent content={m.content} />
              }
            </div>
          </div>
        ))}

        {/* Streaming — plain text until complete, then rendered */}
        {streamText && (
          <div className="flex justify-start max-w-3xl mr-auto">
            <div className="w-6 h-6 rounded-lg bg-[#a3e635]/10 border border-[#a3e635]/20 flex items-center justify-center shrink-0 mt-1 mr-3">
              <Sparkles size={12} className="text-[#a3e635] animate-pulse" />
            </div>
            <div className="rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed bg-white/[0.04] border border-white/[0.06] text-zinc-200 whitespace-pre-wrap">
              {streamText}
              <span className="inline-block w-1.5 h-4 bg-[#a3e635] ml-0.5 animate-pulse rounded-full align-text-bottom" />
            </div>
          </div>
        )}

        {loading && !streamText && (
          <div className="flex justify-start">
            <div className="w-6 h-6 rounded-lg bg-[#a3e635]/10 border border-[#a3e635]/20 flex items-center justify-center shrink-0 mr-3">
              <Loader2 size={12} className="text-[#a3e635] animate-spin" />
            </div>
            <div className="rounded-2xl rounded-tl-sm px-4 py-3 bg-white/[0.04] border border-white/[0.06]">
              <div className="flex gap-1 items-center h-5">
                {[0, 1, 2].map(i => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 px-4 md:px-8 pb-4 md:pb-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex gap-2 items-end bg-white/[0.04] border border-white/[0.08] rounded-2xl px-4 py-3 focus-within:border-[#a3e635]/30 transition-colors">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Preguntá sobre tus finanzas…"
              disabled={loading}
              className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-600 resize-none focus:outline-none leading-relaxed max-h-36 overflow-y-auto disabled:opacity-50"
              style={{ scrollbarWidth: 'none' }}
            />
            <button
              onClick={() => send(input)}
              disabled={loading || !input.trim()}
              className="shrink-0 w-8 h-8 rounded-xl bg-[#a3e635] disabled:bg-zinc-700 disabled:text-zinc-500 text-black flex items-center justify-center transition-colors hover:bg-[#b5f04a]"
            >
              <SendHorizontal size={14} />
            </button>
          </div>
          <p className="text-center text-[9px] text-zinc-700 mt-2">Enter para enviar · Shift+Enter para nueva línea</p>
        </div>
      </div>
    </div>
  )
}
