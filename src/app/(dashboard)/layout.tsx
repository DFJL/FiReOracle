import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { NavLink } from '@/components/nav-link'
import {
  LayoutDashboard,
  ArrowLeftRight,
  PiggyBank,
  TrendingUp,
  Users,
  Landmark,
  Sparkles,
  BarChart2,
} from 'lucide-react'

const NAV_ITEMS = [
  { href: '/resumen', label: 'Resumen', icon: <LayoutDashboard size={16} /> },
  { href: '/movimientos', label: 'Movimientos', icon: <ArrowLeftRight size={16} /> },
  { href: '/flujo', label: 'Flujo de Caja', icon: <BarChart2 size={16} /> },
  { href: '/presupuesto', label: 'Presupuesto', icon: <PiggyBank size={16} /> },
  { href: '/inversiones', label: 'Inversiones', icon: <TrendingUp size={16} /> },
  { href: '/prestamos', label: 'Préstamos', icon: <Users size={16} /> },
  { href: '/patrimonio', label: 'Patrimonio', icon: <Landmark size={16} /> },
  { href: '/oracle', label: 'Oracle', icon: <Sparkles size={16} /> },
]

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-[#09090b] text-white flex">
      <aside className="w-52 shrink-0 border-r border-white/[0.06] p-4 flex flex-col gap-1 fixed h-full">
        <div className="mb-6 px-2 flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-blue-500 flex items-center justify-center text-xs font-bold shrink-0">
            F
          </div>
          <span className="text-sm font-semibold tracking-tight">
            <span className="text-blue-400">FiRe</span>
            <span className="text-white">Oracle</span>
          </span>
        </div>

        <nav className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </nav>

        <div className="mt-auto pt-4 border-t border-white/[0.06]">
          <p className="px-3 text-xs text-zinc-600 mb-2 truncate">{user.email}</p>
          <form action="/auth/signout" method="POST">
            <button
              type="submit"
              className="w-full px-3 py-2 rounded-lg text-sm text-zinc-500 hover:bg-white/[0.04] hover:text-rose-400 transition-colors text-left"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 ml-52 overflow-auto">{children}</main>
    </div>
  )
}
