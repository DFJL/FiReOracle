'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
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
  Grid3x3,
  X,
  LogOut,
} from 'lucide-react'

interface BottomItem {
  href: string
  label: string
  iconName: string
  badgeKey?: string
}

const BOTTOM_ITEMS: BottomItem[] = [
  { href: '/resumen',     label: 'Resumen', iconName: 'dashboard' },
  { href: '/movimientos', label: 'Bandeja', iconName: 'inbox',    badgeKey: 'pending' },
  { href: '/oracle',      label: 'Oracle',  iconName: 'sparkles' },
  { href: '/progreso',    label: 'FIRE',    iconName: 'target' },
]

function BottomIcon({ name, size = 20 }: { name: string; size?: number }) {
  if (name === 'dashboard') return <LayoutDashboard size={size} />
  if (name === 'inbox')     return <Inbox size={size} />
  if (name === 'sparkles')  return <Sparkles size={size} />
  if (name === 'target')    return <Target size={size} />
  return null
}

interface MoreItem { href: string; label: string; iconName: string }
interface MoreGroup { label: string; items: MoreItem[] }

const MORE_GROUPS: MoreGroup[] = [
  {
    label: 'Flujos',
    items: [
      { href: '/flujo',       label: 'Flujo de Caja', iconName: 'barchart' },
      { href: '/presupuesto', label: 'Presupuesto',   iconName: 'piggybank' },
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
      { href: '/metas', label: 'Metas', iconName: 'flag' },
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

function MoreIcon({ name, size = 18 }: { name: string; size?: number }) {
  if (name === 'barchart')  return <BarChart2 size={size} />
  if (name === 'piggybank') return <PiggyBank size={size} />
  if (name === 'trending')  return <TrendingUp size={size} />
  if (name === 'wallet')    return <Wallet size={size} />
  if (name === 'users')     return <Users size={size} />
  if (name === 'landmark')  return <Landmark size={size} />
  if (name === 'flag')      return <Flag size={size} />
  if (name === 'filetext')  return <FileText size={size} />
  if (name === 'shield')    return <ShieldCheck size={size} />
  if (name === 'settings')  return <Settings size={size} />
  return null
}

const MORE_HREFS = MORE_GROUPS.flatMap(g => g.items.map(i => i.href))

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== '/resumen' && pathname.startsWith(href))
}

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
  const key = Object.keys(ROUTE_LABELS).find(k => pathname === k || (k !== '/resumen' && pathname.startsWith(k)))
  const label = key ? ROUTE_LABELS[key] : ''
  if (!label) return null
  return <span className="text-xs font-bold tracking-wider text-zinc-300 truncate max-w-[160px]">{label}</span>
}

export function MobileNav({ pendingCount }: { pendingCount: number }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  useEffect(() => { setOpen(false) }, [pathname])

  const isMoreActive = MORE_HREFS.some(href => isActive(pathname, href))

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Slide-up sheet */}
      <div
        className={`md:hidden fixed left-0 right-0 z-50 bg-[#0c1209] border-t border-[#a3e635]/[0.12] rounded-t-2xl transition-transform duration-250 ease-out ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ bottom: 60 }}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <p className="text-[9px] font-black tracking-[0.22em] uppercase text-zinc-600">Módulos</p>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        <div className="px-4 pb-5 overflow-y-auto max-h-[65vh]">
          {MORE_GROUPS.map(group => (
            <div key={group.label} className="mb-4">
              <p className="px-1 mb-2 text-[9px] font-black tracking-[0.2em] uppercase text-zinc-700">
                {group.label}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {group.items.map(item => {
                  const active = isActive(pathname, item.href)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2.5 px-3.5 py-3 rounded-xl text-sm font-semibold transition-colors ${
                        active
                          ? 'text-[#a3e635] bg-[#a3e635]/[0.08] border border-[#a3e635]/20'
                          : 'text-zinc-400 bg-white/[0.03] hover:bg-white/[0.06] border border-transparent'
                      }`}
                    >
                      <span className={active ? 'text-[#a3e635]' : 'text-zinc-500'}>
                        <MoreIcon name={item.iconName} />
                      </span>
                      <span className="truncate">{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Logout */}
          <div className="mt-2 pt-3 border-t border-white/[0.06]">
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

      {/* Bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 h-[60px] bg-[#080c08]/95 backdrop-blur-sm border-t border-[#a3e635]/[0.08] flex items-stretch">
        {BOTTOM_ITEMS.map(item => {
          const active = isActive(pathname, item.href)
          const badge = item.badgeKey === 'pending' ? pendingCount : 0
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center gap-[3px] text-[10px] font-semibold tracking-wider uppercase transition-colors ${
                active ? 'text-[#a3e635]' : 'text-zinc-600 hover:text-zinc-400'
              }`}
            >
              <span className="relative">
                <BottomIcon name={item.iconName} />
                {badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 text-[8px] font-black bg-[#a3e635] text-black rounded-full px-1 min-w-[14px] text-center leading-[14px]">
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
          onClick={() => setOpen(v => !v)}
          className={`flex-1 flex flex-col items-center justify-center gap-[3px] text-[10px] font-semibold tracking-wider uppercase transition-colors ${
            isMoreActive || open ? 'text-[#a3e635]' : 'text-zinc-600 hover:text-zinc-400'
          }`}
        >
          {open
            ? <X size={20} />
            : <Grid3x3 size={20} />
          }
          Más
        </button>
      </nav>
    </>
  )
}
