'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function ResetForm() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const searchParams = useSearchParams()
  const supabase = createClient()

  // Supabase puts the session in the URL hash on password reset links
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      // SESSION_ESTABLISHED means the reset token was valid
      if (event === 'PASSWORD_RECOVERY') {
        // ready to set new password — already handled by the form
      }
    })
    return () => subscription.unsubscribe()
  }, [supabase])

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('Las contraseñas no coinciden')
      return
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres')
      return
    }

    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setError(error.message)
    } else {
      setDone(true)
      setTimeout(() => { window.location.href = '/dashboard' }, 2000)
    }
  }

  if (done) {
    return (
      <div className="text-center">
        <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-white mb-2">Contraseña actualizada</h2>
        <p className="text-gray-400 text-sm">Redirigiendo al dashboard…</p>
      </div>
    )
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Nueva contraseña</h1>
        <p className="mt-1 text-gray-400 text-sm">Elegí una contraseña segura</p>
      </div>

      <form onSubmit={handleReset} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Nueva contraseña</label>
          <input
            type="password"
            required
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Mínimo 8 caracteres"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Confirmar contraseña</label>
          <input
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="••••••••"
          />
        </div>

        {error && (
          <p className="text-sm text-red-400 bg-red-950/50 border border-red-800/50 rounded-lg px-3 py-2">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium transition-colors"
        >
          {loading ? 'Guardando...' : 'Guardar contraseña'}
        </button>
      </form>
    </>
  )
}

export default function ResetPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-md p-8 rounded-2xl bg-gray-900 border border-white/5 shadow-xl">
        <Suspense fallback={<div className="text-gray-400 text-sm">Cargando…</div>}>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  )
}
