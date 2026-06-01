'use client'

import { useState, useRef, useEffect } from 'react'
import { Sparkles, SendHorizontal, Loader2, RotateCcw } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const SUGGESTIONS = [
  '¿En qué categorías debería reducir gastos para acelerar mi FIRE?',
  '¿Cuánto tiempo me falta para alcanzar independencia financiera?',
  '¿Cuál es mi tasa de cobertura pasiva y cómo mejorarla?',
  '¿Cómo está mi tasa de ahorro comparada con la meta FIRE?',
  'Analiza mis gastos de supervivencia vs discrecionales',
  '¿Qué tan resiliente soy ante un período de desempleo?',
]

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
        const err = await res.text()
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err}` }])
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
            <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
              m.role === 'user'
                ? 'bg-[#a3e635]/10 border border-[#a3e635]/20 text-zinc-200 rounded-tr-sm'
                : 'bg-white/[0.04] border border-white/[0.06] text-zinc-200 rounded-tl-sm'
            }`}>
              {m.content}
            </div>
          </div>
        ))}

        {/* Streaming in progress */}
        {streamText && (
          <div className="flex justify-start max-w-3xl mr-auto">
            <div className="w-6 h-6 rounded-lg bg-[#a3e635]/10 border border-[#a3e635]/20 flex items-center justify-center shrink-0 mt-1 mr-3">
              <Sparkles size={12} className="text-[#a3e635] animate-pulse" />
            </div>
            <div className="rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap bg-white/[0.04] border border-white/[0.06] text-zinc-200">
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
