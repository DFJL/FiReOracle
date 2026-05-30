'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export interface AccountInput {
  name: string
  account_type: string
  bank_name: string
  currency_code: string
  initial_balance: string // string from form, we'll parse
}

export interface SetupInput {
  display_name: string
  monthly_income: string
  savings_goal_pct: string
  main_currency: string
  accounts: AccountInput[]
}

export async function completeSetup(data: SetupInput) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  const today = new Date().toISOString().slice(0, 10)

  // Upsert profile
  const { error: profileErr } = await supabase.from('user_profiles').upsert(
    {
      user_id: user.id,
      display_name: data.display_name || null,
      monthly_income: parseFloat(data.monthly_income) || null,
      savings_goal_pct: parseFloat(data.savings_goal_pct) || 20,
      main_currency: data.main_currency || 'CRC',
      onboarding_done: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  )
  if (profileErr) throw new Error(profileErr.message)

  // Insert accounts + initial balance snapshots
  for (const acc of data.accounts) {
    if (!acc.name.trim()) continue

    const { data: account, error: accErr } = await supabase
      .from('financial_accounts')
      .insert({
        user_id: user.id,
        name: acc.name.trim(),
        account_type: acc.account_type,
        bank_name: acc.bank_name.trim() || null,
        currency_code: acc.currency_code || 'CRC',
      })
      .select('id')
      .single()

    if (accErr || !account) continue

    const balance = parseFloat(acc.initial_balance)
    if (!isNaN(balance)) {
      await supabase.from('account_balance_snapshots').insert({
        user_id: user.id,
        account_id: account.id,
        snapshot_date: today,
        real_balance: balance,
        period_label: 'saldo_inicial',
        notes: 'Saldo inicial — datos iniciales',
      })
    }
  }

  redirect('/resumen')
}
