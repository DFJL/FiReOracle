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
      <Link href={href}
        className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-semibold tracking-wider uppercase transition-colors ${
          active ? 'text-[#a3e635]' : 'text-zinc-600 hover:text-zinc-400'
        }`}
      >
        <span>{icon}</span>
        {label}
      </Link>
    )
  }

  return (
    <Link href={href}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold tracking-wider uppercase transition-colors ${
        active
          ? 'text-[#a3e635] bg-[#a3e635]/[0.08]'
          : 'text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.03]'
      }`}
    >
      <span className={active ? 'text-[#a3e635]' : ''}>{icon}</span>
      {label}
    </Link>
  )
}
