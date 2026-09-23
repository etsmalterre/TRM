// A bonnetier's face on the wall band — the same endpoint, oversample and
// initials fallback as `BonnetierPhoto` (apps/atelier) and `VisiteurPhoto`
// (apps/web ProductionVisitage.tsx), but SIZED IN --u: the band is laid out
// in the tablet unit (index.css), so a face must shrink with it on the
// 960 px tablet and grow on a 12", which a px `size` prop cannot do. Hence a
// fixed class size here rather than the inline-style size of the two others.
//
// The photo endpoint is `/prime-trm/bonnetiers/:id/photo` (resizes with
// sharp; the originals are 750–1300 px with EXIF orientation), unguarded like
// everything the tablet reads — the wall has no cookie. One request per
// face, then the browser's cache (Cache-Control: private, max-age=86400).
import { useEffect, useState } from 'react'
import { API_URL } from '@/lib/api'
import { cn } from '@/lib/utils'

/** Requested edge in px: crisp on a DPR-2 tablet at any --u the plan gets. */
const PHOTO_PX = 160

/** Diameter 3.7u — nearly the full 4.4u band, no label above (user's
 *  request, 2026-09-23). Literal classes, not a template: Tailwind's JIT
 *  only sees what is spelled out. */
const BOX = 'h-[calc(var(--u)*3.7)] w-[calc(var(--u)*3.7)] rounded-full border-2 border-gold/70 flex-shrink-0'

export function Visage({ id, prenom, nom, className }: { id: number; prenom: string; nom: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setFailed(false)
  }, [id])

  const label = `${prenom} ${nom}`.trim()
  const initials = [prenom, nom]
    .map((w) => w.trim()[0]?.toUpperCase() ?? '')
    .join('')

  if (id <= 0 || failed) {
    return (
      <div
        title={label}
        className={cn(BOX, 'bg-primary text-primary-foreground flex items-center justify-center font-semibold', 'text-[calc(var(--u)*1.3)]', className)}
      >
        {initials || '?'}
      </div>
    )
  }
  return (
    <img
      src={`${API_URL}/prime-trm/bonnetiers/${id}/photo?size=${PHOTO_PX}`}
      alt={label}
      title={label}
      className={cn(BOX, 'object-cover bg-primary', className)}
      onError={() => setFailed(true)}
    />
  )
}
