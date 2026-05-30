import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency: 'CRC',
    maximumFractionDigits: 0,
  }).format(n)
}

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-CR', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  })
}

// ── types ─────────────────────────────────────────────────────────────────────

interface TxRow {
  id: string | null
  date: string | null
  vendor: string | null
  concept: string | null
  category_code: string | null
  movement_type: string | null
  amount: number | null
}

// ── page ──────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50

const MOVEMENT_FILTER_MAP: Record<string, string> = {
  ingresos: 'income',
  gastos: 'expense',
  retiros: 'cash_withdrawal',
}

const movBadge: Record<string, { label: string; cls: string }> = {
  income: { label: 'Ingreso', cls: 'bg-emerald-500/10 text-emerald-400' },
  expense: { label: 'Gasto', cls: 'bg-rose-500/10 text-rose-400' },
  cash_withdrawal: { label: 'Efectivo', cls: 'bg-amber-500/10 text-amber-400' },
}

const amtColor: Record<string, string> = {
  income: 'text-emerald-400',
  expense: 'text-rose-400',
  cash_withdrawal: 'text-amber-400',
}

interface PageProps {
  searchParams: Promise<{ page?: string; tab?: string }>
}

export default async function MovimientosPage({ searchParams }: PageProps) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const currentPage = Math.max(1, parseInt(params.page ?? '1', 10))
  const tab = params.tab ?? 'todos'
  const offset = (currentPage - 1) * PAGE_SIZE
  const movFilter = MOVEMENT_FILTER_MAP[tab] ?? null

  // Build query
  let query = supabase
    .from('transactions')
    .select('id, date, vendor, concept, category_code, movement_type, amount', { count: 'exact' })
    .not('amount', 'is', null)
    .order('date', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (movFilter) {
    query = query.eq('movement_type', movFilter)
  }

  const { data, count, error } = await query

  const rows = (data ?? []) as TxRow[]
  const totalCount = count ?? 0
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  if (error) {
    console.error('movimientos query error', error)
  }

  const tabs = [
    { code: 'todos', label: 'Todos' },
    { code: 'ingresos', label: 'Ingresos' },
    { code: 'gastos', label: 'Gastos' },
    { code: 'retiros', label: 'Retiros' },
  ]

  function tabHref(tabCode: string) {
    return `/movimientos?tab=${tabCode}&page=1`
  }

  function pageHref(p: number) {
    return `/movimientos?tab=${tab}&page=${p}`
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-white">Movimientos</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          {totalCount.toLocaleString('es-CR')} transacciones en total
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-white/[0.03] border border-white/[0.06] rounded-lg p-1 w-fit mb-6">
        {tabs.map((t) => (
          <a
            key={t.code}
            href={tabHref(t.code)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              tab === t.code
                ? 'bg-white/[0.08] text-white'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t.label}
          </a>
        ))}
      </div>

      {/* Table card */}
      <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[120px_1fr_140px_100px_100px] px-5 py-3 border-b border-white/[0.06]">
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Fecha</span>
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Descripción</span>
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Categoría</span>
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Tipo</span>
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider text-right">Monto</span>
        </div>

        {/* Rows */}
        <div className="divide-y divide-white/[0.04]">
          {rows.length === 0 && (
            <p className="px-5 py-8 text-sm text-zinc-600 text-center">Sin movimientos</p>
          )}
          {rows.map((tx, i) => {
            const badge = movBadge[tx.movement_type ?? '']
            const color = amtColor[tx.movement_type ?? ''] ?? 'text-zinc-400'
            const sign = tx.movement_type === 'expense' ? '−' : tx.movement_type === 'income' ? '+' : ''
            return (
              <div
                key={tx.id ?? i}
                className="grid grid-cols-[120px_1fr_140px_100px_100px] px-5 py-3 items-center hover:bg-white/[0.02] transition-colors"
              >
                <span className="text-xs text-zinc-500 tabular-nums">
                  {tx.date ? fmtDate(tx.date) : '—'}
                </span>
                <div className="min-w-0 pr-3">
                  <p className="text-sm text-zinc-200 truncate">{tx.vendor ?? tx.concept ?? '—'}</p>
                  {tx.concept && tx.vendor && (
                    <p className="text-xs text-zinc-600 truncate">{tx.concept}</p>
                  )}
                </div>
                <span className="text-xs text-zinc-500 truncate">
                  {tx.category_code ?? '—'}
                </span>
                <span>
                  {badge && (
                    <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${badge.cls}`}>
                      {badge.label}
                    </span>
                  )}
                </span>
                <span className={`text-sm font-medium tabular-nums text-right ${color}`}>
                  {sign}{fmt(Number(tx.amount))}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-zinc-600">
            Página {currentPage} de {totalPages}
          </p>
          <div className="flex gap-2">
            {currentPage > 1 && (
              <a
                href={pageHref(currentPage - 1)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.03] border border-white/[0.06] text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                Anterior
              </a>
            )}
            {currentPage < totalPages && (
              <a
                href={pageHref(currentPage + 1)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.03] border border-white/[0.06] text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                Siguiente
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
