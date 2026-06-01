import { Users } from 'lucide-react'

export default function PrestamosPage() {
  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
      <div className="w-16 h-16 rounded-2xl bg-[#a3e635]/10 border border-[#a3e635]/20 flex items-center justify-center">
        <Users size={28} className="text-[#a3e635]/60" />
      </div>
      <div>
        <p className="text-xl font-black text-white mb-1">Préstamos</p>
        <p className="text-sm text-zinc-500 max-w-sm">
          Seguimiento de deudas, balance pendiente y proyección de pagos. Próximamente.
        </p>
      </div>
    </div>
  )
}
