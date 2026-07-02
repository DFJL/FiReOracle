export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { NavLink } from '@/components/nav-link'
import { TransactionEntryWrapper } from './movimientos/TransactionEntryWrapper'
import Link from 'next/link'
import {
  LayoutDashboard,
  PiggyBank,
  TrendingUp,
  Users,
  Landmark,
  Sparkles,
  BarChart2,
  Settings,
  Wallet,
  Target,
  ShieldCheck,
  Inbox,
  Flag,
  FileText,
} from 'lucide-react'
import { getPendingCount } from '@/app/actions/inbox'
import { AlertsServer } from './AlertsServer'

type NavItem = { href: string; label: string; icon: React.ReactNode; badge?: number }
type NavGroup = { label: string; items: NavItem[] }

function buildNavGroups(pendingCount: number): NavGroup[] {
  return [
    {
      label: 'Flujos',
      items: [
        { href: '/resumen',     label: 'Resumen',       icon: <LayoutDashboard size={16} /> },
        { href: '/flujo',       label: 'Flujo de Caja', icon: <BarChart2 size={16} /> },
        { href: '/presupuesto', label: 'Presupuesto',   icon: <PiggyBank size={16} /> },
        { href: '/movimientos', label: 'Bandeja',        icon: <Inbox size={16} />, badge: pendingCount },
      ],
    },
    {
      label: 'Patrimonio',
      items: [
        { href: '/inversiones', label: 'Portafolio',  icon: <TrendingUp size={16} /> },
        { href: '/liquidez',    label: 'Liquidez',    icon: <Wallet size={16} /> },
        { href: '/prestamos',   label: 'Préstamos',   icon: <Users size={16} /> },
        { href: '/patrimonio',  label: 'Patrimonio',  icon: <Landmark size={16} /> },
      ],
    },
    {
      label: 'FIRE',
      items: [
        { href: '/progreso', label: 'Progreso',  icon: <Target size={16} /> },
        { href: '/metas',    label: 'Metas',     icon: <Flag size={16} /> },
        { href: '/oracle',   label: 'Oracle',    icon: <Sparkles size={16} /> },
      ],
    },
    {
      label: 'Herramientas',
      items: [
        { href: '/reporte',   label: 'Reporte Mensual', icon: <FileText size={16} /> },
        { href: '/auditoria', label: 'Auditoría',       icon: <ShieldCheck size={16} /> },
      ],
    },
  ]
}

// Subset shown in mobile bottom bar
const BOTTOM_NAV = [
  { href: '/resumen',     label: 'Resumen',    icon: <LayoutDashboard size={20} /> },
  { href: '/inversiones', label: 'Portafolio', icon: <TrendingUp size={20} /> },
  { href: '/liquidez',    label: 'Liquidez',   icon: <Wallet size={20} /> },
  { href: '/patrimonio',  label: 'Patrimonio', icon: <Landmark size={20} /> },
  { href: '/progreso',    label: 'FIRE',       icon: <Target size={20} /> },
]

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [{ data: profile }, pendingCount] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('onboarding_done')
      .eq('user_id', user.id)
      .maybeSingle(),
    getPendingCount(),
  ])

  const needsSetup = !profile?.onboarding_done
  const NAV_GROUPS = buildNavGroups(pendingCount)

  return (
    <div className="min-h-screen bg-[#080c08] text-[#f0f4ee] flex">
      {/* Sidebar — hidden on mobile, visible md+ */}
      <aside className="hidden md:flex w-52 shrink-0 border-r border-[#a3e635]/[0.08] p-4 flex-col gap-1 fixed h-full z-20 bg-[#080c08]">
        <div className="mb-8 px-2 flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-[#a3e635] flex items-center justify-center text-xs font-black text-black shrink-0">
            F
          </div>
          <span className="text-xs font-black tracking-widest uppercase text-[#a3e635]">
            FiReOracle
          </span>
        </div>

        <nav className="flex flex-col gap-3">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="px-3 mb-1 text-[8px] font-black tracking-[0.22em] uppercase text-zinc-700">
                {group.label}
              </p>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <NavLink key={item.href} {...item} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-auto pt-4 border-t border-white/[0.06] flex flex-col gap-0.5">
          <NavLink href="/configuracion" label="Configuración" icon={<Settings size={16} />} />
          <p className="px-3 text-xs text-zinc-600 mt-2 truncate">{user.email}</p>
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

      {/* Main content */}
      <div className="flex-1 md:ml-52 flex flex-col min-h-screen pb-16 md:pb-0">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-[#a3e635]/[0.08] bg-[#080c08]">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-[#a3e635] flex items-center justify-center text-[10px] font-black text-black shrink-0">
              F
            </div>
            <span className="text-xs font-black tracking-widest uppercase text-[#a3e635]">FiReOracle</span>
          </div>
          <div className="flex items-center gap-1">
            <Link href="/auditoria" className="p-2 rounded-lg text-zinc-400 hover:text-[#a3e635] hover:bg-white/[0.04] transition-colors">
              <ShieldCheck size={18} />
            </Link>
            <Link href="/configuracion" className="p-2 rounded-lg text-zinc-400 hover:text-[#a3e635] hover:bg-white/[0.04] transition-colors">
              <Settings size={18} />
            </Link>
          </div>
        </header>

        {/* Onboarding banner */}
        {needsSetup && (
          <div className="bg-blue-600/10 border-b border-blue-500/20 px-4 py-2.5 flex items-center justify-between gap-4">
            <p className="text-xs text-blue-300">
              <span className="font-semibold">Configuración pendiente</span>
              {' '}— Registrá tus cuentas y saldos iniciales.
            </p>
            <a
              href="/configuracion"
              className="shrink-0 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded-lg transition-colors"
            >
              Configurar
            </a>
          </div>
        )}

        {/* Smart alert banners — async, non-blocking */}
        <Suspense fallback={null}>
          <AlertsServer userId={user.id} />
        </Suspense>

        <main className="flex-1 overflow-auto">{children}</main>
      </div>

      {/* Transaction entry FAB */}
      <Suspense fallback={null}>
        <TransactionEntryWrapper />
      </Suspense>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#080c08]/95 backdrop-blur-sm border-t border-[#a3e635]/[0.08] flex items-stretch">
        {BOTTOM_NAV.map((item) => (
          <NavLink key={item.href} href={item.href} label={item.label} icon={item.icon} mobile />
        ))}
      </nav>
    </div>
  )
}
