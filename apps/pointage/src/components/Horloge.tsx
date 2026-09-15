// The wall clock — the first thing the legacy pointeuse showed, and what a
// salarié checks before tapping his face. White on the navy band.
import { useEffect, useState } from 'react'
import { dateLongue, heure, secondes } from '@/lib/heures'
import { cn } from '@/lib/utils'

/** Now, re-rendered every `intervalMs`. */
export function useMaintenant(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(t)
  }, [intervalMs])
  return now
}

export function Horloge({ taille = 'grande' }: { taille?: 'grande' | 'compacte' }) {
  const now = useMaintenant()
  const grande = taille === 'grande'
  return (
    <div className="text-center leading-none select-none" aria-live="off">
      <div className={cn('font-heading font-bold tabular-nums tracking-tight', grande ? 'text-6xl' : 'text-4xl')}>
        {heure(now)}
        <span className={cn('text-white/40 font-semibold', grande ? 'text-3xl ml-1' : 'text-2xl ml-0.5')}>
          {secondes(now)}
        </span>
      </div>
      {grande && <div className="mt-2 text-lg text-white/70 first-letter:uppercase">{dateLongue(now)}</div>}
    </div>
  )
}
