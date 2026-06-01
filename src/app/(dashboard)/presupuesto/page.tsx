import { PiggyBank } from 'lucide-react'

export default function PresupuestoPage() {
  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
      <div className="w-16 h-16 rounded-2xl bg-[#a3e635]/10 border border-[#a3e635]/20 flex items-center justify-center">
        <PiggyBank size={28} className="text-[#a3e635]/60" />
      </div>
      <div>
        <p className="text-xl font-black text-white mb-1">Presupuesto</p>
        <p className="text-sm text-zinc-500 max-w-sm">
          Límites por categoría con tracking vs. real del período. Próximamente.
        </p>
      </div>
    </div>
  )
}
