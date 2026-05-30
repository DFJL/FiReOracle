'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavLinkProps {
  href: string
  label: string
  icon: React.ReactNode
}

export function NavLink({ href, label, icon }: NavLinkProps) {
  const pathname = usePathname()
  const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
        active
          ? 'bg-blue-500/10 text-blue-400 font-medium'
          : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200'
      }`}
    >
      <span className={active ? 'text-blue-400' : 'text-gray-500'}>{icon}</span>
      {label}
    </Link>
  )
}
