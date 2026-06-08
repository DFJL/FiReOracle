'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveTelegramConfig, deleteTelegramConfig } from '@/app/actions/telegram'
import type { TelegramConfig } from '@/app/actions/telegram'
import { Bell, BellOff, Loader2, Send, Trash2, ExternalLink } from 'lucide-react'

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? 'OraReminderbot'

export function TelegramManager({ initial }: { initial: TelegramConfig | null }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [config, setConfig]   = useState<TelegramConfig | null>(initial)
  const [chatId, setChatId]   = useState('')
  const [saving,  setSaving]  = useState(false)
  const [removing, setRemoving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function handleSave() {
    if (!chatId.trim()) return
    setSaving(true)
    setMsg(null)
    const res = await saveTelegramConfig(chatId)
    setSaving(false)
    if (res.error) {
      setMsg({ ok: false, text: res.error })
    } else {
      setMsg({ ok: true, text: '¡Conectado! Revisá Telegram — te llegó un mensaje de prueba.' })
      setConfig({ chat_id: chatId.trim(), is_active: true })
      setChatId('')
      startTransition(() => router.refresh())
    }
  }

  async function handleRemove() {
    setRemoving(true)
    setMsg(null)
    const res = await deleteTelegramConfig()
    setRemoving(false)
    if (res.error) {
      setMsg({ ok: false, text: res.error })
    } else {
      setConfig(null)
      setMsg(null)
    }
  }

  return (
    <div className="space-y-4">
      {config ? (
        /* ── Linked state ── */
        <div className="flex items-center gap-3 p-3 rounded-xl bg-[#a3e635]/5 border border-[#a3e635]/20">
          <div className="w-8 h-8 rounded-full bg-[#a3e635]/20 flex items-center justify-center shrink-0">
            <Bell size={15} className="text-[#a3e635]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-zinc-200">Telegram conectado</p>
            <p className="text-[10px] text-zinc-500 font-mono">Chat ID: {config.chat_id}</p>
          </div>
          <button
            onClick={handleRemove}
            disabled={removing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold text-zinc-500 hover:text-rose-400 hover:bg-white/[0.06] transition-colors disabled:opacity-40"
          >
            {removing ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
            Desconectar
          </button>
        </div>
      ) : (
        /* ── Setup state ── */
        <div className="space-y-4">
          {/* Instructions */}
          <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4 space-y-3">
            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.14em]">Cómo vincular</p>
            <ol className="space-y-2">
              {[
                <>Abrí Telegram y buscá <a href={`https://t.me/${BOT_USERNAME}`} target="_blank" rel="noopener noreferrer" className="text-[#a3e635] font-mono hover:underline inline-flex items-center gap-0.5">@{BOT_USERNAME}<ExternalLink size={9} /></a></>,
                <>Enviá cualquier mensaje (ej: <span className="font-mono text-zinc-300">/start</span>)</>,
                <>El bot te responde con tu <span className="font-semibold text-zinc-200">Chat ID</span></>,
                <>Pegalo abajo y guardá</>,
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[11px] text-zinc-400">
                  <span className="w-4 h-4 rounded-full bg-white/[0.06] text-[9px] font-black text-zinc-500 flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={chatId}
              onChange={e => setChatId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              placeholder="Pegá tu Chat ID aquí (ej: 123456789)"
              className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-700 font-mono focus:outline-none focus:border-[#a3e635]/40"
            />
            <button
              onClick={handleSave}
              disabled={saving || !chatId.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#a3e635] text-black text-xs font-black hover:bg-[#b4f040] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              Vincular
            </button>
          </div>
        </div>
      )}

      {msg && (
        <p className={`text-xs px-3 py-2 rounded-lg ${msg.ok ? 'text-[#a3e635] bg-[#a3e635]/10' : 'text-rose-400 bg-rose-500/10'}`}>
          {msg.text}
        </p>
      )}

      {/* Info footer */}
      <div className="flex items-start gap-2 text-[10px] text-zinc-600">
        <BellOff size={11} className="shrink-0 mt-0.5" />
        <p>Los recordatorios se envían cada mañana a las 8 AM hora CR si hay pagos en los próximos 3 días.</p>
      </div>
    </div>
  )
}
