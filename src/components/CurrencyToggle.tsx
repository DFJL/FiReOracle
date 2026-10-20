'use client'

import { useCurrency } from '@/lib/currency'

export function CurrencyToggle({ className = '' }: { className?: string }) {
  const { currency, setCurrency } = useCurrency()
  return (
    <div className={`flex items-center gap-0.5 bg-white/[0.04] rounded-lg p-0.5 border border-white/[0.06] ${className}`}>
      {(['CRC', 'USD'] as const).map(c => (
        <button key={c} onClick={() => setCurrency(c)}
          className={`px-2.5 py-1 rounded text-xs font-bold transition-colors ${
            currency === c ? 'bg-[#a3e635] text-black' : 'text-zinc-500 hover:text-zinc-300'
          }`}>
          {c === 'CRC' ? '₡' : '$'}
        </button>
      ))}
    </div>
  )
}
