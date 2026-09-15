// A salarié's face: the bonnetier photo through `lst_salarie.id_mps`, or his
// initials when he is not linked or has no photo. Same look as the atelier's
// BonnetierPhoto (gold ring, navy initials).
import { useEffect, useState } from 'react'
import { photoUrl, type SalarieRef } from '@/lib/pointage-api'
import { cn } from '@/lib/utils'

export function SalariePhoto({
  salarie,
  size,
  className,
}: {
  salarie: SalarieRef
  size: number
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setFailed(false)
  }, [salarie.id])

  const nom = `${salarie.prenom} ${salarie.nom}`.trim()
  const initiales = [salarie.prenom, salarie.nom]
    .map((w) => w.trim()[0]?.toUpperCase() ?? '')
    .join('')
  // Inline size: a Tailwind class cannot be built from a number at runtime.
  const box = { width: size, height: size }

  if (!salarie.photo || failed) {
    return (
      <div
        style={{ ...box, fontSize: Math.round(size * 0.36) }}
        className={cn(
          'rounded-full border-2 border-gold/50 bg-primary text-primary-foreground',
          'flex items-center justify-center font-semibold flex-shrink-0',
          className,
        )}
        aria-label={nom}
      >
        {initiales || '?'}
      </div>
    )
  }
  return (
    <img
      src={photoUrl(salarie.id, size)}
      alt={nom}
      style={box}
      className={cn('rounded-full object-cover border-2 border-gold/50 flex-shrink-0', className)}
      onError={() => setFailed(true)}
    />
  )
}
