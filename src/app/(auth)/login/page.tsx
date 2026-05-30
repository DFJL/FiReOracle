'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Step = 'login' | 'forgot' | 'forgot_sent'

export default function LoginPage() {
  const [step, setStep] = useState<Step>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    setLoading(false)
    if (error) {
      setError(error.message === 'Invalid login credentials'
        ? 'Email o contraseña incorrectos'
        : error.message)
    } else {
      window.location.href = '/dashboard'
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset`,
    })

    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setStep('forgot_sent')
    }
  }

  if (step === 'forgot_sent') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="w-full max-w-md p-8 rounded-2xl bg-gray-900 border border-white/5 shadow-xl text-center">
          <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Revisá tu correo</h2>
          <p className="text-gray-400 text-sm">
            Te enviamos un link para restablecer tu contraseña a{' '}
            <span className="text-blue-400">{email}</span>.
          </p>
          <button
            onClick={() => { setStep('login'); setError(null) }}
            className="mt-6 text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            ← Volver al login
          </button>
        </div>
      </div>
    )
  }

  if (step === 'forgot') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="w-full max-w-md p-8 rounded-2xl bg-gray-900 border border-white/5 shadow-xl">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-white">Recuperar contraseña</h1>
            <p className="mt-1 text-gray-400 text-sm">Te enviamos un link a tu correo</p>
          </div>

          <form onSubmit={handleForgot} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">Email</label>
              <input
                id="email"
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="tu@email.com"
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
              {loading ? 'Enviando...' : 'Enviar link de recuperación'}
            </button>
          </form>

          <button
            onClick={() => { setStep('login'); setError(null) }}
            className="mt-6 text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            ← Volver al login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-md p-8 rounded-2xl bg-gray-900 border border-white/5 shadow-xl">
        <div className="mb-8 text-center">
          <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center mx-auto mb-4 text-lg font-bold">F</div>
          <h1 className="text-2xl font-semibold text-white">FiReOracle</h1>
          <p className="mt-1 text-gray-500 text-sm">Centro de inteligencia financiera</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">Email</label>
            <input
              id="email"
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="tu@email.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">Contraseña</label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
            {loading ? 'Entrando...' : 'Iniciar sesión'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={() => { setStep('forgot'); setError(null) }}
            className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            ¿Olvidaste tu contraseña?
          </button>
        </div>
      </div>
    </div>
  )
}
