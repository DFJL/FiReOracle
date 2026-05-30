'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export interface AccountInput {
  name: string
  account_type: string
  bank_name: string
  currency_code: string
  initial_balance: string
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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  const today = new Date().toISOString().slice(0, 10)

  await supabase.from('user_profiles').upsert(
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

  for (const acc of data.accounts) {
    if (!acc.name.trim()) continue

    // Upsert by name so re-running config doesn't duplicate accounts
    const { data: existing } = await supabase
      .from('financial_accounts')
      .select('id')
      .eq('user_id', user.id)
      .eq('name', acc.name.trim())
      .maybeSingle()

    let accountId = existing?.id

    if (!accountId) {
      const { data: created } = await supabase
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
      accountId = created?.id
    } else {
      // Update existing account metadata
      await supabase.from('financial_accounts').update({
        account_type: acc.account_type,
        bank_name: acc.bank_name.trim() || null,
        currency_code: acc.currency_code || 'CRC',
      }).eq('id', accountId)
    }

    if (!accountId) continue

    const balance = parseFloat(acc.initial_balance)
    if (!isNaN(balance)) {
      // Upsert the initial balance snapshot
      await supabase.from('account_balance_snapshots').upsert(
        {
          user_id: user.id,
          account_id: accountId,
          snapshot_date: today,
          real_balance: balance,
          period_label: 'saldo_inicial',
          notes: 'Saldo inicial configurado manualmente',
        },
        { onConflict: 'account_id,snapshot_date' }
      )
    }
  }

  redirect('/resumen')
}

/** Detects opening balances from existing transaction data (balance columns). */
export async function detectAccountsFromTransactions(): Promise<AccountInput[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  // Earliest transaction that has balance data
  const { data: earliest } = await supabase
    .from('transactions')
    .select('date, balance_after_debit, balance_after_cash, balance_total')
    .not('balance_total', 'is', null)
    .order('date', { ascending: true })
    .limit(1)
    .single()

  if (!earliest) return []

  const accounts: AccountInput[] = []

  if (earliest.balance_after_debit != null && Number(earliest.balance_after_debit) > 0) {
    accounts.push({
      name: 'Cuenta débito',
      account_type: 'checking',
      bank_name: '',
      currency_code: 'CRC',
      initial_balance: String(Math.round(Number(earliest.balance_after_debit))),
    })
  }

  if (earliest.balance_after_cash != null && Number(earliest.balance_after_cash) > 0) {
    accounts.push({
      name: 'Efectivo',
      account_type: 'cash',
      bank_name: '',
      currency_code: 'CRC',
      initial_balance: String(Math.round(Number(earliest.balance_after_cash))),
    })
  }

  return accounts
}
