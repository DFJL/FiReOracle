import { getDailyFact } from '@/lib/dailyFacts'

export async function DailyFactServer({ userId }: { userId: string }) {
  const fact = await getDailyFact(userId)
  if (!fact) return null

  return (
    <div className="mx-4 md:mx-8 mt-3 rounded-xl bg-gradient-to-r from-[#a3e635]/[0.08] to-transparent border border-[#a3e635]/20 px-4 py-2.5 flex items-center gap-3">
      <span className="text-lg shrink-0" aria-hidden>{fact.emoji}</span>
      <p className="text-xs text-zinc-300 leading-relaxed">
        <span className="font-black text-[#a3e635] uppercase tracking-wider text-[9px] mr-2 align-middle">Dato del día</span>
        {fact.text}
      </p>
    </div>
  )
}
