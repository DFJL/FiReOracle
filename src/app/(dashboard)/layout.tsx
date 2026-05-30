import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <aside className="w-56 shrink-0 border-r border-gray-800 p-4 flex flex-col gap-1">
        <div className="mb-6 px-2">
          <span className="text-xl font-bold text-blue-400">FiReOracle</span>
        </div>
        {[
          { href: '/dashboard', label: 'Dashboard' },
          { href: '/expenses', label: 'Gastos' },
          { href: '/budget', label: 'Presupuesto' },
          { href: '/investments', label: 'Inversiones' },
          { href: '/network', label: 'Network' },
          { href: '/wealth', label: 'Patrimonio' },
          { href: '/oracle', label: 'Oracle IA' },
        ].map(({ href, label }) => (
          <a
            key={href}
            href={href}
            className="px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
          >
            {label}
          </a>
        ))}
        <div className="mt-auto pt-4 border-t border-gray-800">
          <form action="/auth/signout" method="POST">
            <button
              type="submit"
              className="w-full px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-800 hover:text-red-400 transition-colors text-left"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
