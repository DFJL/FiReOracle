'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutDashboard, PiggyBank, TrendingUp, Users, Landmark,
  Sparkles, BarChart2, Settings, Wallet, Target, ShieldCheck,
  Inbox, Flag, FileText, Grid3x3, X, LogOut,
} from 'lucide-react'

// ── Icon helpers ─────────────────────────────────────────────────────────────

function NavIcon({ name, size = 18 }: { name: string; size?: number }) {
  const icons: Record<string, React.ReactNode> = {
    dashboard:  <LayoutDashboard size={size} />,
    barchart:   <BarChart2 size={size} />,
    piggybank:  <PiggyBank size={size} />,
    inbox:      <Inbox size={size} />,
    trending:   <TrendingUp size={size} />,
    wallet:     <Wallet size={size} />,
    users:      <Users size={size} />,
    landmark:   <Landmark size={size} />,
    target:     <Target size={size} />,
    flag:       <Flag size={size} />,
    sparkles:   <Sparkles size={size} />,
    filetext:   <FileText size={size} />,
    shield:     <ShieldCheck size={size} />,
    settings:   <Settings size={size} />,
  }
  return <>{icons[name] ?? null}</>
}

// ── Data ─────────────────────────────────────────────────────────────────────

const PINNED = [
  { href: '/resumen',     label: 'Resumen',  iconName: 'dashboard' },
  { href: '/movimientos', label: 'Bandeja',  iconName: 'inbox',    isPending: true },
  { href: '/oracle',      label: 'Oracle',   iconName: 'sparkles' },
  { href: '/progreso',    label: 'FIRE',     iconName: 'target' },
]

const ALL_GROUPS = [
  {
    label: 'Flujos',
    items: [
      { href: '/resumen',     label: 'Resumen',       iconName: 'dashboard' },
      { href: '/flujo',       label: 'Flujo de Caja', iconName: 'barchart' },
      { href: '/presupuesto', label: 'Presupuesto',   iconName: 'piggybank' },
      { href: '/movimientos', label: 'Bandeja',        iconName: 'inbox', isPending: true },
    ],
  },
  {
    label: 'Patrimonio',
    items: [
      { href: '/inversiones', label: 'Portafolio', iconName: 'trending' },
      { href: '/liquidez',    label: 'Liquidez',   iconName: 'wallet' },
      { href: '/prestamos',   label: 'Préstamos',  iconName: 'users' },
      { href: '/patrimonio',  label: 'Patrimonio', iconName: 'landmark' },
    ],
  },
  {
    label: 'FIRE',
    items: [
      { href: '/progreso', label: 'Progreso', iconName: 'target' },
      { href: '/metas',    label: 'Metas',    iconName: 'flag' },
      { href: '/oracle',   label: 'Oracle',   iconName: 'sparkles' },
    ],
  },
  {
    label: 'Herramientas',
    items: [
      { href: '/reporte',       label: 'Reporte',       iconName: 'filetext' },
      { href: '/auditoria',     label: 'Auditoría',     iconName: 'shield' },
      { href: '/configuracion', label: 'Configuración', iconName: 'settings' },
    ],
  },
]

// ── Route labels for header title ────────────────────────────────────────────

const ROUTE_LABELS: Record<string, string> = {
  '/resumen':       'Resumen',
  '/flujo':         'Flujo de Caja',
  '/presupuesto':   'Presupuesto',
  '/movimientos':   'Bandeja',
  '/inversiones':   'Portafolio',
  '/liquidez':      'Liquidez',
  '/prestamos':     'Préstamos',
  '/patrimonio':    'Patrimonio',
  '/progreso':      'FIRE · Progreso',
  '/metas':         'FIRE · Metas',
  '/oracle':        'Oracle',
  '/reporte':       'Reporte Mensual',
  '/auditoria':     'Auditoría',
  '/configuracion': 'Configuración',
}

export function MobilePageTitle() {
  const pathname = usePathname()
  const key = Object.keys(ROUTE_LABELS).find(
    k => pathname === k || (k !== '/resumen' && pathname.startsWith(k))
  )
  const label = key ? ROUTE_LABELS[key] : ''
  if (!label) return null
  return (
    <span className="text-xs font-bold tracking-wider text-zinc-300 truncate max-w-[160px]">
      {label}
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== '/resumen' && pathname.startsWith(href))
}

export function MobileNav({ pendingCount }: { pendingCount: number }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // Close sheet on navigation
  useEffect(() => { setOpen(false) }, [pathname])

  return (
    <>
      {/* Full-screen overlay (conditionally rendered — no CSS-transform tricks) */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40 flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Sheet */}
          <div className="relative z-10 bg-[#0c1209] border-t border-[#a3e635]/20 rounded-t-2xl max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
              <p className="text-[9px] font-black tracking-[0.22em] uppercase text-zinc-500">
                Módulos
              </p>
              <button
                onClick={() => setOpen(false)}
                className="p-2 -mr-1 rounded-lg text-zinc-500 hover:text-zinc-200 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Groups */}
            <div className="overflow-y-auto px-4 pb-4">
              {ALL_GROUPS.map(group => (
                <div key={group.label} className="mb-4">
                  <p className="px-1 mb-2 text-[9px] font-black tracking-[0.2em] uppercase text-zinc-700">
                    {group.label}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {group.items.map(item => {
                      const active = isActive(pathname, item.href)
                      const badge = item.isPending ? pendingCount : 0
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`flex items-center gap-2.5 px-3.5 py-3 rounded-xl text-sm font-semibold transition-colors ${
                            active
                              ? 'text-[#a3e635] bg-[#a3e635]/10 border border-[#a3e635]/20'
                              : 'text-zinc-400 bg-white/[0.04] border border-transparent hover:bg-white/[0.07]'
                          }`}
                        >
                          <span className={active ? 'text-[#a3e635]' : 'text-zinc-500'}>
                            <NavIcon name={item.iconName} />
                          </span>
                          <span className="flex-1 truncate">{item.label}</span>
                          {badge > 0 && (
                            <span className="text-[9px] font-black bg-[#a3e635] text-black rounded-full px-1.5 min-w-[18px] text-center">
                              {badge}
                            </span>
                          )}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}

              {/* Logout */}
              <div className="pt-3 border-t border-white/[0.06]">
                <form action="/auth/signout" method="POST">
                  <button
                    type="submit"
                    className="w-full flex items-center gap-2.5 px-3.5 py-3 rounded-xl text-sm font-semibold text-zinc-500 hover:text-rose-400 hover:bg-white/[0.04] transition-colors"
                  >
                    <LogOut size={18} />
                    Cerrar sesión
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom tab bar — always visible, no z-index competition with sheet */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 h-[60px] bg-[#080c08] border-t border-[#a3e635]/10 flex">
        {PINNED.map(item => {
          const active = isActive(pathname, item.href)
          const badge = item.isPending ? pendingCount : 0
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold tracking-wide uppercase transition-colors ${
                active ? 'text-[#a3e635]' : 'text-zinc-600'
              }`}
            >
              <span className="relative">
                <NavIcon name={item.iconName} size={20} />
                {badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 text-[8px] font-black bg-[#a3e635] text-black rounded-full px-1 min-w-[14px] text-center leading-[14px]">
                    {badge}
                  </span>
                )}
              </span>
              {item.label}
            </Link>
          )
        })}

        {/* Más */}
        <button
          onClick={() => setOpen(true)}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold tracking-wide uppercase transition-colors ${
            open ? 'text-[#a3e635]' : 'text-zinc-600'
          }`}
        >
          <Grid3x3 size={20} />
          Más
        </button>
      </nav>
    </>
  )
}
