import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { LoansClient } from './LoansClient'

function remainingMonths(endDate: string): number {
  const end = new Date(endDate + 'T12:00:00')
  const now = new Date()
  const months = (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth())
  return Math.max(0, months)
}

function currentYM(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default async function PrestamosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [{ data: loansRaw }, { data: paymentsRaw }, { data: ratesRaw }] = await Promise.all([
    admin
      .from('loans')
      .select('id, name, lender, currency_code, original_amount, current_balance, interest_rate, monthly_insurance, start_date, end_date, payment_day, notes')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('start_date'),
    admin
      .from('loan_payments')
      .select('id, loan_id, payment_date, payment_type, amount, principal, interest, insurance, balance_before, balance_after, rate_applied, notes')
      .eq('user_id', user.id)
      .order('payment_date', { ascending: false }),
    admin
      .from('loan_rate_history')
      .select('loan_id, effective_date, rate, notes')
      .eq('user_id', user.id)
      .order('effective_date', { ascending: true }),
  ])

  const loans = (loansRaw ?? []).map(l => ({
    id:               l.id as string,
    name:             l.name as string,
    lender:           l.lender as string,
    currencyCode:     (l.currency_code ?? 'CRC') as string,
    originalAmount:   Number(l.original_amount),
    currentBalance:   Number(l.current_balance),
    interestRate:     Number(l.interest_rate),
    monthlyInsurance: Number(l.monthly_insurance),
    startDate:        l.start_date as string,
    endDate:          l.end_date as string,
    paymentDay:       Number(l.payment_day),
    notes:            l.notes as string | null,
    remainingMonths:  remainingMonths(l.end_date as string),
    startYearMonth:   currentYM(),
    payments: (paymentsRaw ?? [])
      .filter(p => p.loan_id === l.id)
      .map(p => ({
        id:            p.id as string,
        payment_date:  p.payment_date as string,
        payment_type:  p.payment_type as string,
        amount:        Number(p.amount),
        principal:     Number(p.principal),
        interest:      Number(p.interest),
        insurance:     Number(p.insurance),
        balance_before: Number(p.balance_before),
        balance_after:  Number(p.balance_after),
        rate_applied:  Number(p.rate_applied),
        notes:         p.notes as string | null,
      })),
    rateHistory: (ratesRaw ?? [])
      .filter(r => r.loan_id === l.id)
      .map(r => ({
        effective_date: r.effective_date as string,
        rate:           Number(r.rate),
        notes:          r.notes as string | null,
      })),
  }))

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <LoansClient loans={loans} />
    </div>
  )
}
