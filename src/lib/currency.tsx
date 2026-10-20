'use client'

// Single source of truth for the CRC/USD toggle — one choice, shared by every
// page, instead of each page keeping its own useState('USD') that reset on
// navigation and could show CRC on one tab and USD on another at the same time.
import { createContext, useContext, useState, type ReactNode } from 'react'

export type Currency = 'CRC' | 'USD'

type CurrencyContextValue = {
  currency: Currency
  setCurrency: (c: Currency) => void
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null)
const STORAGE_KEY = 'fireoracle:currency'

export function CurrencyProvider({ children }: { children: ReactNode }) {
  // Per-viewer convenience only (which currency they last picked) — read
  // lazily on first client render, never required for correctness, so a
  // blocked/cleared localStorage just leaves the USD default in place.
  const [currency, setCurrencyState] = useState<Currency>(() => {
    if (typeof window === 'undefined') return 'USD'
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored === 'CRC' || stored === 'USD' ? stored : 'USD'
    } catch { return 'USD' }
  })

  const setCurrency = (c: Currency) => {
    setCurrencyState(c)
    try { localStorage.setItem(STORAGE_KEY, c) } catch { /* ignore */ }
  }

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency }}>
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext)
  if (!ctx) throw new Error('useCurrency must be used within a CurrencyProvider')
  return ctx
}

// Shared formatter — consolidates the nearly-identical fmtAmt copies that
// used to live separately in ProgresoView, PatrimonioView, etc.
export function formatCurrency(v: number, currency: Currency, rate: number, opts?: { compact?: boolean }): string {
  const val = currency === 'CRC' ? v : v / rate
  const sym = currency === 'CRC' ? '₡' : '$'
  const abs = Math.abs(val)
  const compact = opts?.compact ?? true
  if (compact && abs >= 1_000_000) return `${sym}${(val / 1_000_000).toFixed(2)}M`
  return `${sym}${Math.round(val).toLocaleString('es-CR')}`
}
