import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { OracleView } from './OracleView'
import { buildOracleContext } from '@/lib/oracleContext'

export default async function OraclePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const context = await buildOracleContext(user.id)

  return (
    <div className="h-[calc(100vh-4rem)] md:h-screen flex flex-col">
      <OracleView context={context} />
    </div>
  )
}
