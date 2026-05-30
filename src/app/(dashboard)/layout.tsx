import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { NavLink } from '@/components/nav-link'
import {
  LayoutDashboard,
  Receipt,
  PiggyBank,
  TrendingUp,
  Users,
  Landmark,
  Sparkles,
} from 'lucide-react'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} /> },
  { href: '/expenses', label: 'Gastos', icon: <Receipt size={16} /> },
  { href: '/budget', label: 'Presupuesto', icon: <PiggyBank size={16} /> },
  { href: '/investments', label: 'Inversiones', icon: <TrendingUp size={16} /> },
  { href: '/network', label: 'Network', icon: <Users size={16} /> },
  { href: '/wealth', label: 'Patrimonio', icon: <Landmark size={16} /> },
  { href: '/oracle', label: 'Oracle IA', icon: <Sparkles size={16} /> },
]

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <aside className="w-56 shrink-0 border-r border-white/5 p-4 flex flex-col gap-1 fixed h-full">
        <div className="mb-6 px-2 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center text-xs font-bold">
            F
          </div>
          <span className="text-base font-semibold tracking-tight">FiReOracle</span>
        </div>

        <nav className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </nav>

        <div className="mt-auto pt-4 border-t border-white/5">
          <p className="px-3 text-xs text-gray-600 mb-2 truncate">{user.email}</p>
          <form action="/auth/signout" method="POST">
            <button
              type="submit"
              className="w-full px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-800/60 hover:text-red-400 transition-colors text-left"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 ml-56 overflow-auto">{children}</main>
    </div>
  )
}
