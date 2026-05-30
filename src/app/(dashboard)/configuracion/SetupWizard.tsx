'use client'

import { useState, useTransition } from 'react'
import { completeSetup, AccountInput } from '@/app/actions/setup'

// ── constants ─────────────────────────────────────────────────────────────────

const ACCOUNT_TYPES = [
  { value: 'checking',   label: 'Cuenta corriente' },
  { value: 'savings',    label: 'Cuenta de ahorros' },
  { value: 'cash',       label: 'Efectivo' },
  { value: 'investment', label: 'Inversión / Fondo mutuo' },
  { value: 'credit',     label: 'Tarjeta de crédito' },
  { value: 'other',      label: 'Otro' },
]

const CR_BANKS = ['BAC', 'BNCR', 'BCR', 'Popular', 'Scotiabank', 'Davivienda', 'Lafise', 'Promerica', 'Otro']

const SUGGESTED_ACCOUNTS: Omit<AccountInput, 'initial_balance'>[] = [
  { name: 'BAC Débito',        account_type: 'checking',   bank_name: 'BAC',  currency_code: 'CRC' },
  { name: 'BNCR Ahorros',      account_type: 'savings',    bank_name: 'BNCR', currency_code: 'CRC' },
  { name: 'Efectivo',          account_type: 'cash',       bank_name: '',     currency_code: 'CRC' },
]

function blank(): AccountInput {
  return { name: '', account_type: 'checking', bank_name: '', currency_code: 'CRC', initial_balance: '' }
}

// ── step indicator ────────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
              i < current
                ? 'bg-blue-500 text-white'
                : i === current
                  ? 'bg-white/[0.1] text-white border border-white/[0.2]'
                  : 'bg-white/[0.03] text-zinc-600 border border-white/[0.06]'
            }`}
          >
            {i < current ? '✓' : i + 1}
          </div>
          {i < total - 1 && (
            <div className={`h-px w-8 ${i < current ? 'bg-blue-500/50' : 'bg-white/[0.06]'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

// ── field helpers ─────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">{children}</label>
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-white/[0.18] transition-colors ${props.className ?? ''}`}
    />
  )
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full bg-[#111113] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-white/[0.18] transition-colors ${props.className ?? ''}`}
    />
  )
}

// ── step 1: perfil ────────────────────────────────────────────────────────────

interface ProfileData {
  display_name: string
  monthly_income: string
  savings_goal_pct: string
  main_currency: string
}

function StepPerfil({
  data,
  onChange,
  onNext,
}: {
  data: ProfileData
  onChange: (d: ProfileData) => void
  onNext: () => void
}) {
  function set(key: keyof ProfileData) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      onChange({ ...data, [key]: e.target.value })
  }

  const canProceed = data.monthly_income.trim() !== ''

  return (
    <div>
      <h2 className="text-lg font-semibold text-white mb-1">Tu perfil financiero</h2>
      <p className="text-sm text-zinc-500 mb-6">
        Esta información se usa para calcular tu tasa de ahorro real y comparar contra tu meta.
      </p>

      <div className="space-y-5">
        <div>
          <Label>Nombre (opcional)</Label>
          <Input
            placeholder="¿Cómo te llamás?"
            value={data.display_name}
            onChange={set('display_name')}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Moneda principal</Label>
            <Select value={data.main_currency} onChange={set('main_currency')}>
              <option value="CRC">₡ Colones (CRC)</option>
              <option value="USD">$ Dólares (USD)</option>
            </Select>
          </div>
          <div>
            <Label>Meta de ahorro *</Label>
            <div className="relative">
              <Input
                type="number"
                min={0}
                max={100}
                step={1}
                placeholder="20"
                value={data.savings_goal_pct}
                onChange={set('savings_goal_pct')}
                className="pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">%</span>
            </div>
          </div>
        </div>

        <div>
          <Label>Ingreso mensual esperado *</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs font-medium">
              {data.main_currency === 'USD' ? '$' : '₡'}
            </span>
            <Input
              type="number"
              min={0}
              step={1000}
              placeholder="0"
              value={data.monthly_income}
              onChange={set('monthly_income')}
              className="pl-7"
            />
          </div>
          <p className="text-xs text-zinc-600 mt-1.5">
            Tu salario neto típico mensual. Se usa para calcular la tasa de ahorro.
          </p>
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <button
          onClick={onNext}
          disabled={!canProceed}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          Continuar →
        </button>
      </div>
    </div>
  )
}

// ── step 2: cuentas ───────────────────────────────────────────────────────────

function StepCuentas({
  accounts,
  onChange,
  onBack,
  onNext,
}: {
  accounts: AccountInput[]
  onChange: (a: AccountInput[]) => void
  onBack: () => void
  onNext: () => void
}) {
  function update(i: number, field: keyof AccountInput, value: string) {
    const next = [...accounts]
    next[i] = { ...next[i], [field]: value }
    onChange(next)
  }

  function addBlank() {
    onChange([...accounts, blank()])
  }

  function remove(i: number) {
    onChange(accounts.filter((_, idx) => idx !== i))
  }

  function addSuggested(s: Omit<AccountInput, 'initial_balance'>) {
    if (accounts.some((a) => a.name === s.name)) return
    onChange([...accounts, { ...s, initial_balance: '' }])
  }

  const filledAccounts = accounts.filter((a) => a.name.trim())

  return (
    <div>
      <h2 className="text-lg font-semibold text-white mb-1">Tus cuentas</h2>
      <p className="text-sm text-zinc-500 mb-5">
        Agregá tus cuentas bancarias y el saldo actual de cada una. Podés completar esto después.
      </p>

      {/* Suggestions */}
      <div className="mb-5">
        <p className="text-xs text-zinc-600 mb-2">Sugerencias rápidas</p>
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_ACCOUNTS.map((s) => {
            const already = accounts.some((a) => a.name === s.name)
            return (
              <button
                key={s.name}
                onClick={() => addSuggested(s)}
                disabled={already}
                className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
                  already
                    ? 'border-white/[0.04] text-zinc-700 cursor-not-allowed'
                    : 'border-white/[0.08] text-zinc-400 hover:border-white/[0.15] hover:text-zinc-200'
                }`}
              >
                {already ? '✓ ' : '+ '}{s.name}
              </button>
            )
          })}
        </div>
      </div>

      {/* Account rows */}
      <div className="space-y-3">
        {accounts.map((acc, i) => (
          <div
            key={i}
            className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-zinc-500 font-medium">Cuenta {i + 1}</span>
              <button
                onClick={() => remove(i)}
                className="text-zinc-600 hover:text-rose-400 text-xs transition-colors"
              >
                Eliminar
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <Label>Nombre *</Label>
                <Input
                  placeholder="BAC Débito"
                  value={acc.name}
                  onChange={(e) => update(i, 'name', e.target.value)}
                />
              </div>
              <div>
                <Label>Banco</Label>
                <Select
                  value={acc.bank_name}
                  onChange={(e) => update(i, 'bank_name', e.target.value)}
                >
                  <option value="">— Sin banco —</option>
                  {CR_BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select
                  value={acc.account_type}
                  onChange={(e) => update(i, 'account_type', e.target.value)}
                >
                  {ACCOUNT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Moneda</Label>
                <Select
                  value={acc.currency_code}
                  onChange={(e) => update(i, 'currency_code', e.target.value)}
                >
                  <option value="CRC">₡ CRC</option>
                  <option value="USD">$ USD</option>
                </Select>
              </div>
              <div>
                <Label>Saldo inicial</Label>
                <Input
                  type="number"
                  step={1000}
                  placeholder="0"
                  value={acc.initial_balance}
                  onChange={(e) => update(i, 'initial_balance', e.target.value)}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={addBlank}
        className="mt-3 w-full py-2.5 rounded-xl border border-dashed border-white/[0.08] text-xs text-zinc-500 hover:border-white/[0.15] hover:text-zinc-300 transition-colors"
      >
        + Agregar cuenta
      </button>

      <div className="mt-8 flex justify-between">
        <button
          onClick={onBack}
          className="px-5 py-2.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          ← Atrás
        </button>
        <button
          onClick={onNext}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {filledAccounts.length === 0 ? 'Omitir cuentas →' : `Continuar con ${filledAccounts.length} cuenta${filledAccounts.length > 1 ? 's' : ''} →`}
        </button>
      </div>
    </div>
  )
}

// ── step 3: confirm ───────────────────────────────────────────────────────────

function fmtCRC(n: number, currency: string) {
  return new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(n)
}

function StepConfirm({
  profile,
  accounts,
  onBack,
  onSubmit,
  isPending,
}: {
  profile: ProfileData
  accounts: AccountInput[]
  onBack: () => void
  onSubmit: () => void
  isPending: boolean
}) {
  const filled = accounts.filter((a) => a.name.trim())
  const totalBalance = filled.reduce((s, a) => s + (parseFloat(a.initial_balance) || 0), 0)
  const currency = profile.main_currency || 'CRC'

  return (
    <div>
      <h2 className="text-lg font-semibold text-white mb-1">Confirmar configuración</h2>
      <p className="text-sm text-zinc-500 mb-6">Revisá que todo esté bien antes de guardar.</p>

      <div className="space-y-4">
        {/* Profile summary */}
        <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Perfil</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {profile.display_name && (
              <div>
                <p className="text-zinc-600 text-xs">Nombre</p>
                <p className="text-zinc-200">{profile.display_name}</p>
              </div>
            )}
            <div>
              <p className="text-zinc-600 text-xs">Moneda principal</p>
              <p className="text-zinc-200">{currency}</p>
            </div>
            <div>
              <p className="text-zinc-600 text-xs">Ingreso mensual</p>
              <p className="text-emerald-400 tabular-nums">
                {profile.monthly_income ? fmtCRC(parseFloat(profile.monthly_income), currency) : '—'}
              </p>
            </div>
            <div>
              <p className="text-zinc-600 text-xs">Meta de ahorro</p>
              <p className="text-violet-400">{profile.savings_goal_pct || 20}%</p>
            </div>
          </div>
        </div>

        {/* Accounts summary */}
        {filled.length > 0 && (
          <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
              Cuentas ({filled.length})
            </p>
            <div className="space-y-2">
              {filled.map((acc, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="text-zinc-200">{acc.name}</span>
                    {acc.bank_name && (
                      <span className="text-zinc-600 text-xs ml-2">{acc.bank_name}</span>
                    )}
                    <span className="text-zinc-700 text-xs ml-2">
                      {ACCOUNT_TYPES.find((t) => t.value === acc.account_type)?.label}
                    </span>
                  </div>
                  <span className="text-zinc-300 tabular-nums">
                    {acc.initial_balance
                      ? fmtCRC(parseFloat(acc.initial_balance), acc.currency_code)
                      : '—'}
                  </span>
                </div>
              ))}
              <div className="pt-2 border-t border-white/[0.06] flex justify-between text-sm font-semibold">
                <span className="text-zinc-400">Patrimonio inicial</span>
                <span className="text-blue-400 tabular-nums">{fmtCRC(totalBalance, currency)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-8 flex justify-between">
        <button
          onClick={onBack}
          disabled={isPending}
          className="px-5 py-2.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
        >
          ← Atrás
        </button>
        <button
          onClick={onSubmit}
          disabled={isPending}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2"
        >
          {isPending ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Guardando…
            </>
          ) : (
            'Guardar y comenzar →'
          )}
        </button>
      </div>
    </div>
  )
}

// ── wizard root ───────────────────────────────────────────────────────────────

interface ExistingProfile {
  display_name: string
  monthly_income: string
  savings_goal_pct: string
  main_currency: string
  onboarding_done: boolean
}

export function SetupWizard({ userEmail, existing }: { userEmail: string; existing?: ExistingProfile }) {
  const [step, setStep] = useState(0)
  const [isPending, startTransition] = useTransition()

  const [profile, setProfile] = useState<ProfileData>({
    display_name: existing?.display_name ?? '',
    monthly_income: existing?.monthly_income ?? '',
    savings_goal_pct: existing?.savings_goal_pct ?? '20',
    main_currency: existing?.main_currency ?? 'CRC',
  })

  const [accounts, setAccounts] = useState<AccountInput[]>([blank()])

  function handleSubmit() {
    startTransition(async () => {
      await completeSetup({ ...profile, accounts })
    })
  }

  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center p-6">
      <div className="w-full max-w-xl">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-8">
          <div className="w-7 h-7 rounded-md bg-blue-500 flex items-center justify-center text-xs font-bold text-white">
            F
          </div>
          <span className="text-sm font-semibold tracking-tight">
            <span className="text-blue-400">FiRe</span>
            <span className="text-white">Oracle</span>
          </span>
        </div>

        <div className="mb-2">
          <p className="text-xs text-zinc-600">
            {existing?.onboarding_done ? 'Editar configuración' : 'Configuración inicial'} · {userEmail}
          </p>
        </div>

        <StepIndicator current={step} total={3} />

        <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] p-8">
          {step === 0 && (
            <StepPerfil
              data={profile}
              onChange={setProfile}
              onNext={() => setStep(1)}
            />
          )}
          {step === 1 && (
            <StepCuentas
              accounts={accounts}
              onChange={setAccounts}
              onBack={() => setStep(0)}
              onNext={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <StepConfirm
              profile={profile}
              accounts={accounts}
              onBack={() => setStep(1)}
              onSubmit={handleSubmit}
              isPending={isPending}
            />
          )}
        </div>
      </div>
    </div>
  )
}
