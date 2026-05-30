'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Step = 'email' | 'sent'

export default function LoginPage() {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function handleSendLink(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: true,
      },
    })

    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    setStep('sent')
  }

  if (step === 'sent') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="w-full max-w-md p-8 rounded-2xl bg-gray-900 border border-gray-800 shadow-xl text-center">
          <div className="mb-4 text-4xl">📬</div>
          <h2 className="text-xl font-bold text-white mb-2">Revisá tu correo</h2>
          <p className="text-gray-400 text-sm">
            Te enviamos un link de acceso a{' '}
            <span className="text-blue-400 font-medium">{email}</span>.
            <br />
            El link expira en 1 hora.
          </p>
          <button
            onClick={() => { setStep('email'); setError(null) }}
            className="mt-6 text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            Usar otro correo
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-md p-8 rounded-2xl bg-gray-900 border border-gray-800 shadow-xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white">FiReOracle</h1>
          <p className="mt-2 text-gray-400 text-sm">Centro de inteligencia financiera</p>
        </div>

        <form onSubmit={handleSendLink} className="space-y-5">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="tu@email.com"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-950 border border-red-800 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition-colors"
          >
            {loading ? 'Enviando...' : 'Enviar link de acceso'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-600">
          Recibirás un link mágico — sin contraseña
        </p>
      </div>
    </div>
  )
}
