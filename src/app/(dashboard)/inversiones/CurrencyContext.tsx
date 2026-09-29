'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

export type Currency = 'CRC' | 'USD'

const CurrencyCtx = createContext<{ currency: Currency; setCurrency: (c: Currency) => void } | null>(null)

// One toggle, shared by every section on /inversiones — a page.tsx Server
// Component can't hold this state itself, so each client child used to keep
// its own local copy. PortfolioView's had one; PortfolioModelPanel didn't
// have one at all, which is why flipping the toggle up top did nothing to
// the numbers at the bottom of the page.
export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrency] = useState<Currency>('USD')
  return <CurrencyCtx.Provider value={{ currency, setCurrency }}>{children}</CurrencyCtx.Provider>
}

export function useCurrency() {
  const ctx = useContext(CurrencyCtx)
  if (!ctx) throw new Error('useCurrency must be used within a CurrencyProvider')
  return ctx
}
