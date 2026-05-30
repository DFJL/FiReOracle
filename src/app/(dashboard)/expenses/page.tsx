import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

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
    year: 'numeric',
  })
}

const PAGE_SIZE = 50

const movementBadge: Record<string, { label: string; className: string }> = {
  income: { label: 'Ingreso', className: 'bg-emerald-500/10 text-emerald-400' },
  expense: { label: 'Gasto', className: 'bg-rose-500/10 text-rose-400' },
  cash_withdrawal: { label: 'Efectivo', className: 'bg-amber-500/10 text-amber-400' },
}

interface PageProps {
  searchParams: Promise<{ page?: string; type?: string }>
}

export default async function ExpensesPage({ searchParams }: PageProps) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const page = Math.max(1, parseInt(params.page ?? '1'))
  const type = params.type ?? ''
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from('transactions')
    .select('date, vendor, concept, category_code, movement_type, amount, expense_group, notes', {
      count: 'exact',
    })
    .not('amount', 'is', null)
    .order('date', { ascending: false })
    .range(from, to)

  if (type) query = query.eq('movement_type', type)

  const { data: transactions, count } = await query

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE)

  const buildUrl = (p: number, t?: string) => {
    const q = new URLSearchParams()
    q.set('page', String(p))
    if (t) q.set('type', t)
    return `/expenses?${q.toString()}`
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Gastos</h1>
          <p className="text-sm text-gray-500 mt-1">
            {(count ?? 0).toLocaleString('es-CR')} transacciones en total
          </p>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 bg-gray-900 border border-white/5 rounded-lg p-1">
          {[
            { value: '', label: 'Todas' },
            { value: 'expense', label: 'Gastos' },
            { value: 'income', label: 'Ingresos' },
            { value: 'cash_withdrawal', label: 'Efectivo' },
          ].map((tab) => (
            <a
              key={tab.value}
              href={buildUrl(1, tab.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                type === tab.value
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab.label}
            </a>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl bg-gray-900 border border-white/5 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Comercio / Concepto</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Categoría</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Monto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {(transactions ?? []).map((tx, i) => {
              const badge = movementBadge[tx.movement_type ?? '']
              return (
                <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3 text-gray-400 tabular-nums whitespace-nowrap">
                    {tx.date ? fmtDate(tx.date) : '—'}
                  </td>
                  <td className="px-5 py-3 max-w-xs">
                    <p className="text-gray-200 truncate">{tx.vendor ?? '—'}</p>
                    {tx.concept && tx.concept !== tx.vendor && (
                      <p className="text-xs text-gray-600 truncate">{tx.concept}</p>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {tx.category_code ? (
                      <span className="text-xs text-gray-400">{tx.category_code}</span>
                    ) : (
                      <span className="text-xs text-gray-700">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {badge && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${badge.className}`}>
                        {badge.label}
                      </span>
                    )}
                  </td>
                  <td className={`px-5 py-3 text-right tabular-nums font-medium ${
                    tx.movement_type === 'income' ? 'text-emerald-400' :
                    tx.movement_type === 'expense' ? 'text-rose-400' : 'text-amber-400'
                  }`}>
                    {tx.movement_type === 'expense' ? '−' : tx.movement_type === 'income' ? '+' : ''}
                    {fmt(Number(tx.amount))}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Página {page} de {totalPages}
            </p>
            <div className="flex gap-2">
              {page > 1 && (
                <a
                  href={buildUrl(page - 1, type)}
                  className="px-3 py-1.5 rounded-lg bg-gray-800 text-xs text-gray-300 hover:bg-gray-700 transition-colors"
                >
                  ← Anterior
                </a>
              )}
              {page < totalPages && (
                <a
                  href={buildUrl(page + 1, type)}
                  className="px-3 py-1.5 rounded-lg bg-gray-800 text-xs text-gray-300 hover:bg-gray-700 transition-colors"
                >
                  Siguiente →
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
