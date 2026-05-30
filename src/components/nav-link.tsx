'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavLinkProps {
  href: string
  label: string
  icon: React.ReactNode
  mobile?: boolean
}

export function NavLink({ href, label, icon, mobile }: NavLinkProps) {
  const pathname = usePathname()
  const active = pathname === href || (href !== '/resumen' && pathname.startsWith(href))

  if (mobile) {
    return (
      <Link
        href={href}
        className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors ${
          active ? 'text-white' : 'text-zinc-600'
        }`}
      >
        <span className={active ? 'text-white' : 'text-zinc-600'}>{icon}</span>
        {label}
      </Link>
    )
  }

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
        active
          ? 'text-white bg-white/[0.06]'
          : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]'
      }`}
    >
      <span className={active ? 'text-white' : 'text-zinc-600'}>{icon}</span>
      {label}
    </Link>
  )
}
