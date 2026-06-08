import { createAdminClient } from '@/lib/supabase/admin'
import { sendTelegramMessage } from '@/app/actions/telegram'

function nextDueDate(dueDay: number, today: Date): Date {
  const d = new Date(today.getFullYear(), today.getMonth(), dueDay)
  if (d <= today) d.setMonth(d.getMonth() + 1)
  return d
}

function daysUntil(target: Date, now: Date): number {
  const t = new Date(target); t.setHours(0, 0, 0, 0)
  const n = new Date(now);    n.setHours(0, 0, 0, 0)
  return Math.round((t.getTime() - n.getTime()) / 86400000)
}

function fmtAmt(amount: number | null, currency: string | null): string {
  if (!amount) return ''
  const sym = currency === 'USD' ? '$' : '₡'
  return ` (${sym}${Math.round(amount).toLocaleString('es-CR')})`
}

function dayLabel(days: number): string {
  if (days === 0) return '¡*Hoy!*'
  if (days === 1) return 'mañana'
  return `en ${days} días`
}

export async function GET(req: Request) {
  // Protect: only Vercel Cron or requests with CRON_SECRET
  const auth = req.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const admin = createAdminClient()
  const today = new Date()

  // All users with active Telegram config
  const { data: configs } = await admin
    .from('user_telegram_config')
    .select('user_id, chat_id')
    .eq('is_active', true)

  if (!configs || configs.length === 0) return Response.json({ sent: 0 })

  let sent = 0

  for (const { user_id, chat_id } of configs) {
    // Load loans and reminders in parallel
    const [{ data: loans }, { data: reminders }] = await Promise.all([
      admin.from('loans')
        .select('name, payment_day, currency_code')
        .eq('user_id', user_id)
        .eq('is_active', true),
      admin.from('payment_reminders')
        .select('name, amount, currency_code, due_day')
        .eq('user_id', user_id)
        .eq('is_active', true),
    ])

    type Item = { name: string; days: number; amtStr: string }
    const upcoming: Item[] = []

    for (const l of loans ?? []) {
      const days = daysUntil(nextDueDate(l.payment_day, today), today)
      if (days >= 0 && days <= 3) {
        upcoming.push({ name: l.name, days, amtStr: '' })
      }
    }

    for (const r of reminders ?? []) {
      const days = daysUntil(nextDueDate(r.due_day, today), today)
      if (days >= 0 && days <= 3) {
        upcoming.push({ name: r.name, days, amtStr: fmtAmt(r.amount, r.currency_code) })
      }
    }

    if (upcoming.length === 0) continue

    upcoming.sort((a, b) => a.days - b.days)

    const lines = upcoming.map(i => {
      const icon = i.days === 0 ? '🔴' : i.days === 1 ? '🟠' : '🟡'
      return `${icon} *${i.name}*${i.amtStr} — ${dayLabel(i.days)}`
    })

    const text = `🔔 *Recordatorios de pago — FiReOracle*\n\n${lines.join('\n')}`
    const err  = await sendTelegramMessage(chat_id, text)
    if (!err) sent++
  }

  return Response.json({ sent, total: configs.length })
}
