// « Signaler un défaut » — legacy GR_Defaut, lifted out of the action band
// into a bottom sheet (2026-09-15) so the band can stay two rows tall.
//
// The sheet IS the confirmation. Picking a type (and a size for a cm-type) is
// already a deliberate act, so there is no « Voulez-vous vraiment » on top of
// it — a departure from the legacy, decided with Vincent. Every other action of
// the poste keeps its ConfirmSheet.
//
// Same 64 px gold commit + 64 px Annuler as every sheet of the app; the commit's
// `title` names why it is disabled (§45.3) and a refusal renders inline, inside
// the sheet, which stays open so nothing typed is lost.
import { useState } from 'react'
import { Loader2, ShieldAlert, AlertTriangle } from 'lucide-react'
import type { LookupsDefauts } from '@/lib/atelier-api'
import { cn } from '@/lib/utils'

export function DefautSheet({
  metier,
  piece,
  lookups,
  enCours,
  bloque,
  erreur,
  onEnregistrer,
  onClose,
}: {
  metier: string
  piece: number
  lookups: LookupsDefauts | undefined
  enCours: boolean
  /** A reason the band cannot write at all (nobody identified), or null. */
  bloque: string | null
  erreur: string | null
  onEnregistrer: (defaut: { type: string; taille?: number }) => void
  onClose: () => void
}) {
  const [type, setType] = useState<string | null>(null)
  const [taille, setTaille] = useState<number | null>(null)

  const unite = type ? lookups?.types.find((t) => t.type === type)?.unite ?? null : null

  // One branch per precondition, so the disabled button always says why.
  const empeche = ((): string | null => {
    if (bloque) return bloque
    if (!type) return 'Choisissez le type de défaut.'
    // Only cm-types carry a size — the legacy's own rule.
    if (unite === 'cm' && taille === null) return 'Choisissez la taille du défaut.'
    if (enCours) return 'Enregistrement en cours…'
    return null
  })()

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-end"
      onClick={enCours ? undefined : onClose}
      role="presentation"
    >
      <div
        className="w-full max-h-[92dvh] overflow-y-auto scrollbar-transparent bg-card text-foreground rounded-t-2xl p-5 pb-8 space-y-3 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-xl font-heading font-bold tracking-tight">Signaler un défaut</h2>
          <p className="text-base text-muted-foreground mt-0.5">
            {metier} — pièce N° {piece}
          </p>
        </div>

        <Groupe titre="Type de défaut">
          {!lookups && <Loader2 className="h-5 w-5 animate-spin text-accent" />}
          {lookups?.types.map((t) => (
            <Chip
              key={t.type}
              label={t.type}
              actif={t.type === type}
              onClick={() => {
                setType(t.type === type ? null : t.type)
                setTaille(null)
              }}
            />
          ))}
        </Groupe>

        {unite === 'cm' && (
          <Groupe titre="Taille">
            {lookups?.tailles.map((t, i) => (
              <Chip
                key={t.label}
                label={t.label}
                actif={taille === i + 1}
                onClick={() => setTaille(taille === i + 1 ? null : i + 1)}
              />
            ))}
          </Groupe>
        )}

        {erreur && (
          <p className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>{erreur}</span>
          </p>
        )}

        <div className="space-y-2 pt-1">
          <button
            type="button"
            disabled={empeche !== null}
            title={empeche ?? `Enregistrer le défaut « ${type} » sur ${metier}`}
            onClick={() => {
              if (empeche || !type) return
              onEnregistrer({ type, ...(taille !== null ? { taille } : {}) })
            }}
            className="w-full h-16 rounded-xl bg-gold text-gold-foreground text-lg font-semibold flex items-center justify-center gap-2 shadow active:opacity-90 disabled:opacity-40 disabled:shadow-none"
          >
            {enCours ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldAlert className="h-5 w-5" />}
            Enregistrer le défaut
          </button>
          <button
            type="button"
            disabled={enCours}
            onClick={onClose}
            className="w-full h-16 rounded-xl border border-border bg-background text-lg font-semibold active:bg-muted disabled:opacity-40"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  )
}

function Groupe({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5 px-0.5">
        {titre}
      </div>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </div>
  )
}

function Chip({ label, actif, onClick }: { label: string; actif: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={cn(
        'h-12 px-2 rounded-lg border text-base font-medium transition-colors',
        actif ? 'border-gold bg-gold text-gold-foreground' : 'border-border bg-background active:bg-muted',
      )}
    >
      {label}
    </button>
  )
}
