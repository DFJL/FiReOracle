import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-2">Dashboard</h1>
      <p className="text-gray-400">Bienvenido, {user.email}</p>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        {['Gastos', 'Presupuesto', 'Oracle IA'].map((module) => (
          <div
            key={module}
            className="p-6 rounded-xl bg-gray-900 border border-gray-800 text-gray-300"
          >
            <h2 className="font-semibold text-white">{module}</h2>
            <p className="mt-1 text-sm text-gray-500">Próximamente</p>
          </div>
        ))}
      </div>
    </div>
  )
}
