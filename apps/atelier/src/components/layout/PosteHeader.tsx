// The constant three-cell bar at the top of every atelier screen:
//
//     [ M | ←  ]      MÉTIER      [ photo + prénom ]
//
// This is §45.2's "barre poste" promoted to app chrome. The atelier PWA has no
// sidebar (§3 is the ERP shell, on a desk), so the app's navy has to live here
// — that band is what makes the phone read as a Malterre app rather than as a
// generic web page, and it is the single strongest carrier of the charter on a
// screen this small.
//
// The legacy bar is gold-on-cream; ours is navy with gold accents, per the
// user's decision (2026-08-27) that every Malterre app now shares one charter.
// The information architecture is the legacy's, unchanged: the métier code is
// the biggest thing on the screen because it is what tells the bonnetier the
// phone is showing THEIR machine and not the one next to it.
//
// The right cell is the identification gate of §45.4 — and, exactly as in the
// legacy, tapping it is how you leave your post.
import { useState, type ReactNode } from 'react'
import { ArrowLeft, LogOut } from 'lucide-react'
import { BonnetierPhoto } from '@/components/atelier/BonnetierPhoto'
import { useIdentite } from '@/contexts/BonnetierContext'
import { cn } from '@/lib/utils'

export function PosteHeader({
  titre,
  onBack,
  children,
}: {
  /** The métier code, or the app name on screens with no machine context. */
  titre: ReactNode
  /** Omitted on the top-level screen, where the left cell shows the M instead. */
  onBack?: () => void
  /** Optional second line under the bar (the OF context band). */
  children?: ReactNode
}) {
  const { identite, quitter } = useIdentite()
  const [confirmQuit, setConfirmQuit] = useState(false)

  return (
    <header className="flex-shrink-0 bg-gradient-brand text-white shadow-lg">
      {/* The installed PWA paints under the status bar (viewport-fit=cover),
          so the navy band owns the inset instead of leaving a white strip. */}
      <div style={{ height: 'env(safe-area-inset-top)' }} />
      <div className="h-16 flex items-stretch">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            title="Retour"
            className="w-16 flex-shrink-0 flex items-center justify-center border-r border-white/15 active:bg-white/10 transition-colors"
          >
            <ArrowLeft className="h-7 w-7" />
          </button>
        ) : (
          <div className="w-16 flex-shrink-0 flex items-center justify-center border-r border-white/15">
            {/* Same mark as the ERP sidebar's collapsed logo (§3). */}
            <span className="text-gold font-heading font-bold text-3xl leading-none">M</span>
          </div>
        )}

        <div className="flex-1 min-w-0 flex items-center justify-center px-2">
          <span className="text-3xl font-heading font-bold tracking-tight truncate">{titre}</span>
        </div>

        <button
          type="button"
          onClick={() => setConfirmQuit(true)}
          title="Quitter votre poste"
          disabled={!identite}
          className={cn(
            'w-20 flex-shrink-0 flex flex-col items-center justify-center gap-0.5',
            'border-l border-white/15 active:bg-white/10 transition-colors disabled:opacity-40',
          )}
        >
          <BonnetierPhoto id={identite?.id ?? 0} nom={identite?.prenom ?? ''} size={36} />
          <span className="text-[10px] leading-none max-w-full truncate px-1">
            {identite?.prenom ?? '—'}
          </span>
        </button>
      </div>
      {children}

      {confirmQuit && identite && (
        <QuitterSheet
          prenom={identite.prenom}
          onCancel={() => setConfirmQuit(false)}
          onConfirm={() => {
            setConfirmQuit(false)
            quitter()
          }}
        />
      )}
    </header>
  )
}

// Leaving your post is confirmed, as in the legacy (« Confirmez-vous vouloir
// quitter votre poste » + « Pointage » + the date).
//
// Purpose-built rather than the ERP's ConfirmDialog (§33): that component is a
// desk-sized centred dialog with `h-9` buttons, and this is a phone held in a
// gloved hand. §33's actual rule is "never window.confirm" — which this
// honours — and §45 asks for station-scale targets, so the two choices are
// full-width and 64px tall. Same navy/gold vocabulary as everything else.
function QuitterSheet({
  prenom,
  onCancel,
  onConfirm,
}: {
  prenom: string
  onCancel: () => void
  onConfirm: () => void
}) {
  const maintenant = new Date().toLocaleString('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-end"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="w-full bg-card text-foreground rounded-t-2xl p-5 pb-8 space-y-4 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-xl font-heading font-bold tracking-tight">Quitter votre poste ?</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {prenom} · Pointage {maintenant}
          </p>
        </div>
        <div className="space-y-2">
          <button
            type="button"
            onClick={onConfirm}
            className="w-full h-16 rounded-xl bg-primary text-primary-foreground text-lg font-semibold flex items-center justify-center gap-2 active:opacity-90"
          >
            <LogOut className="h-5 w-5" />
            Oui, je quitte
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full h-16 rounded-xl border border-border bg-background text-lg font-semibold active:bg-muted"
          >
            Non, je reste
          </button>
        </div>
      </div>
    </div>
  )
}
