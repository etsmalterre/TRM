import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/** Outlined fabric-roll silhouette — a « tombé de métier » écru roll, i.e. one
 *  pièce. Mirror of the ERP's `apps/web/src/components/icons/TmRollIcon.tsx`.
 *
 *  A CSS-masked `<span>` so the icon inherits text colour:
 *
 *    <TmRollIcon className="h-3 w-3" />
 *
 *  Source asset: `public/icons/tm.png` (precached by the service worker via
 *  `includeAssets: ['icons/*.png']`, so it renders offline).
 */
export function TmRollIcon({ className, style, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      role="img"
      aria-hidden="true"
      className={cn('inline-block bg-current flex-shrink-0', className)}
      style={{
        maskImage: "url('/icons/tm.png')",
        WebkitMaskImage: "url('/icons/tm.png')",
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
        ...style,
      }}
      {...rest}
    />
  )
}
