'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type TelegramConfig = {
  chat_id: string
  is_active: boolean
}

export async function getTelegramConfig(): Promise<TelegramConfig | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await createAdminClient()
    .from('user_telegram_config')
    .select('chat_id, is_active')
    .eq('user_id', user.id)
    .maybeSingle()

  return data as TelegramConfig | null
}

export async function saveTelegramConfig(chatId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('user_telegram_config')
    .upsert({ user_id: user.id, chat_id: chatId.trim(), is_active: true })

  if (error) return { error: error.message }

  // Send test message to confirm it works
  const testErr = await sendTelegramMessage(chatId.trim(), '✅ *FiReOracle conectado*\n\nVas a recibir recordatorios de pago aquí cada mañana.')
  if (testErr) return { error: `Guardado pero no se pudo enviar mensaje de prueba: ${testErr}` }

  revalidatePath('/configuracion')
  return { error: null }
}

export async function deleteTelegramConfig(): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { error } = await createAdminClient()
    .from('user_telegram_config')
    .delete()
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/configuracion')
  return { error: null }
}

// Shared helper — also used by the cron job via direct import.
// parseMode defaults to 'Markdown' for existing callers (payment reminders,
// daily fact); pass null to send plain text — needed for Oracle replies,
// whose Markdown isn't guaranteed well-formed (an unmatched * or _ makes
// Telegram reject the whole message).
export async function sendTelegramMessage(
  chatId: string,
  text: string,
  parseMode: 'Markdown' | null = 'Markdown',
): Promise<string | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return 'TELEGRAM_BOT_TOKEN no configurado'

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ chat_id: chatId, text, ...(parseMode ? { parse_mode: parseMode } : {}) }),
  })

  if (!res.ok) {
    const body = await res.json() as { description?: string }
    return body.description ?? 'Error desconocido de Telegram'
  }
  return null
}
