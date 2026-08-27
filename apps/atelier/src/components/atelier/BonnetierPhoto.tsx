// A bonnetier's face. Mirrors `VisiteurPhoto` in TRM's ProductionVisitage.tsx
// — same endpoint, same 3x oversample, same initials fallback. Improve both
// together; if a third consumer appears, move it beside the other shared
// components rather than forking a third copy.
//
// The photo endpoint is `/prime-trm/bonnetiers/:id/photo`, reused rather than
// duplicated (Production > Prime owns it because it resizes with sharp —
// bonnetier.photo holds 750–1300px originals with EXIF orientation, and a
// browser downscaling 1000px to 48px is what made them look muddy). Same reuse
// the visitage poste already does with of-trm's copy.
import { useEffect, useState } from 'react'
import { API_URL } from '@/lib/api'
import { cn } from '@/lib/utils'

export function BonnetierPhoto({
  id,
  nom,
  size = 56,
  className,
}: {
  id: number
  nom: string
  size?: number
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setFailed(false)
  }, [id])

  const initials = nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

  // Inline style, not a Tailwind class: a class name cannot be built from a
  // number at runtime (the JIT would never see it).
  const box = { width: size, height: size }

  if (id <= 0 || failed) {
    return (
      <div
        style={{ ...box, fontSize: Math.round(size * 0.36) }}
        className={cn(
          'rounded-full border-2 border-gold/50 bg-primary text-primary-foreground',
          'flex items-center justify-center font-semibold flex-shrink-0',
          className,
        )}
      >
        {initials || '?'}
      </div>
    )
  }
  return (
    <img
      // 3x so it stays crisp on the phone's DPR without shipping the original.
      src={`${API_URL}/prime-trm/bonnetiers/${id}/photo?size=${size * 3}`}
      alt={nom}
      style={box}
      className={cn('rounded-full object-cover border-2 border-gold/50 flex-shrink-0', className)}
      onError={() => setFailed(true)}
    />
  )
}
