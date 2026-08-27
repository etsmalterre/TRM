// Band 4 of the poste (§45.2) — the one band that flexes, and the only place
// in this app that writes.
//
// Legacy: FEN_Action_Machine's COMBO_Action + GR_Defaut + BTN_Valider. Three
// deliberate departures from that window, all form-factor:
//
//  1. The action list is a column of tap targets, not a dropdown. A combo on a
//     phone opens a native picker over the whole screen, which hides the OF
//     context the operator is checking the action against — and a gloved
//     fingertip is ~20mm, so the choices have to be at least that tall anyway.
//  2. The commit button is full-width at the FOOT of the band, not pinned
//     top-right as §45.3 prescribes. §45.3 is written for a desk station read
//     at arm's length; on a phone held one-handed the bottom of the screen is
//     the only place a thumb reaches reliably, and the eye already ends there
//     after the last choice. Same rules otherwise: gold, an icon, a spinner
//     while pending, a `title` naming the exact reason it is disabled, and
//     failures rendered INLINE as text — never a toast, which at a machine is
//     missed, and a missed failure means the bonnetier believes they recorded
//     something they did not.
//  3. The size picker only appears for a cm-type defect, which is the legacy's
//     own rule (`si COMBO_Défaut.Select() dans (1,3,4,5)`) expressed through
//     the served `unite` rather than through combo positions.
//
// The legacy's confirmation ("Voulez-vous vraiment enregistrer" + métier +
// action) is kept: these actions are consequential, several are effectively
// irreversible from the phone today, and the bonnetiers already expect it.
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Loader2, AlertTriangle } from 'lucide-react'
import {
  fetchLookupsDefauts,
  posterEvenement,
  type OfContexte,
  type SaisiePayload,
} from '@/lib/atelier-api'
import type { ActionAtelier } from '@/lib/actions'
import { useIdentite } from '@/contexts/BonnetierContext'
import { cn } from '@/lib/utils'

export function SaisieBand({
  of,
  actions,
  metier,
}: {
  of: OfContexte
  actions: ActionAtelier[]
  metier: string
}) {
  const { identite } = useIdentite()
  const qc = useQueryClient()

  const [choisie, setChoisie] = useState<ActionAtelier | null>(null)
  const [typeDefaut, setTypeDefaut] = useState<string | null>(null)
  const [taille, setTaille] = useState<number | null>(null)
  const [confirmer, setConfirmer] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const lookups = useQuery({
    queryKey: ['atelier', 'lookups', 'defauts'],
    queryFn: fetchLookupsDefauts,
    // Legacy window content — it does not change between deploys.
    staleTime: Infinity,
  })

  const uniteDuType = useMemo(() => {
    if (!typeDefaut) return null
    return lookups.data?.types.find((t) => t.type === typeDefaut)?.unite ?? null
  }, [typeDefaut, lookups.data])

  const mut = useMutation({
    mutationFn: (body: SaisiePayload) => posterEvenement(of.IDordre_fabrication, body),
    onSuccess: () => {
      setChoisie(null)
      setTypeDefaut(null)
      setTaille(null)
      setErreur(null)
      // The métier list carries each OF's progression, so it is stale too.
      qc.invalidateQueries({ queryKey: ['atelier', 'of', of.IDordre_fabrication] })
      qc.invalidateQueries({ queryKey: ['atelier', 'machines'] })
    },
    onError: (e: Error & { status?: number }) => {
      setErreur(messagePourErreur(e))
    },
  })

  // One branch per precondition, so the disabled button always says why (§45.3).
  const empeche = ((): string | null => {
    if (!identite) return "Personne n'est identifié sur ce poste."
    if (!choisie) return 'Choisissez une action.'
    if (choisie === 'Défaut') {
      if (!typeDefaut) return 'Choisissez le type de défaut.'
      if (uniteDuType === 'cm' && taille === null) return 'Choisissez la taille du défaut.'
    }
    if (mut.isPending) return 'Enregistrement en cours…'
    return null
  })()

  function valider() {
    if (empeche || !identite || !choisie) return
    setErreur(null)
    mut.mutate({
      action: choisie,
      IDbonnetier: identite.id,
      defaut:
        choisie === 'Défaut' && typeDefaut
          ? { type: typeDefaut, ...(taille !== null ? { taille } : {}) }
          : undefined,
    })
  }

  return (
    <div className="px-3 pb-3">
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-3 py-2 bg-sand border-b border-border">
          <span className="text-xs font-semibold uppercase tracking-wide text-accent">Action</span>
        </div>

        <ul className="p-2 space-y-1.5">
          {actions.map((a) => (
            <li key={a}>
              <button
                type="button"
                onClick={() => {
                  setChoisie(a === choisie ? null : a)
                  setErreur(null)
                  if (a !== 'Défaut') {
                    setTypeDefaut(null)
                    setTaille(null)
                  }
                }}
                aria-pressed={a === choisie}
                className={cn(
                  'w-full h-14 px-3 rounded-lg border text-left text-lg font-medium',
                  'flex items-center justify-between transition-colors',
                  a === choisie
                    ? 'border-gold bg-gold-light/60 text-foreground'
                    : 'border-border bg-background active:bg-muted',
                )}
              >
                {a}
                {a === choisie && <Check className="h-5 w-5 text-accent" />}
              </button>
            </li>
          ))}
        </ul>

        {choisie === 'Défaut' && (
          <div className="px-2 pb-2 space-y-2">
            <Groupe titre="Type de défaut">
              {lookups.isLoading && <Loader2 className="h-5 w-5 animate-spin text-accent" />}
              {lookups.data?.types.map((t) => (
                <Chip
                  key={t.type}
                  label={t.type}
                  actif={t.type === typeDefaut}
                  onClick={() => {
                    setTypeDefaut(t.type === typeDefaut ? null : t.type)
                    setTaille(null)
                  }}
                />
              ))}
            </Groupe>

            {/* Only cm-types carry a size — the legacy's own rule. */}
            {uniteDuType === 'cm' && (
              <Groupe titre="Taille">
                {lookups.data?.tailles.map((t, i) => (
                  <Chip
                    key={t.label}
                    label={t.label}
                    actif={taille === i + 1}
                    onClick={() => setTaille(taille === i + 1 ? null : i + 1)}
                  />
                ))}
              </Groupe>
            )}
          </div>
        )}

        <div className="p-2 pt-0">
          {erreur && (
            <p className="mb-2 flex items-start gap-2 text-sm text-destructive px-1">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{erreur}</span>
            </p>
          )}
          <button
            type="button"
            onClick={() => setConfirmer(true)}
            disabled={empeche !== null}
            title={empeche ?? `Enregistrer « ${choisie} » sur ${metier}`}
            className={cn(
              'w-full h-16 rounded-xl text-lg font-semibold flex items-center justify-center gap-2',
              'bg-gold text-gold-foreground shadow active:opacity-90',
              'disabled:opacity-40 disabled:shadow-none',
            )}
          >
            {mut.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Check className="h-5 w-5" />
            )}
            Valider
          </button>
        </div>
      </div>

      {confirmer && choisie && (
        <ConfirmSheet
          metier={metier}
          action={choisie}
          onCancel={() => setConfirmer(false)}
          onConfirm={() => {
            setConfirmer(false)
            valider()
          }}
        />
      )}
    </div>
  )
}

function Groupe({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-secondary p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5 px-0.5">
        {titre}
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
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
        'h-11 px-3 rounded-lg border text-base font-medium transition-colors',
        actif
          ? 'border-gold bg-gold text-gold-foreground'
          : 'border-border bg-card active:bg-muted',
      )}
    >
      {label}
    </button>
  )
}

// The legacy's own confirmation, verbatim in wording: « Voulez-vous vraiment
// enregistrer » over "<métier> - <action>".
function ConfirmSheet({
  metier,
  action,
  onCancel,
  onConfirm,
}: {
  metier: string
  action: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end" onClick={onCancel} role="presentation">
      <div
        className="w-full bg-card text-foreground rounded-t-2xl p-5 pb-8 space-y-4 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-xl font-heading font-bold tracking-tight">
            Voulez-vous vraiment enregistrer&nbsp;?
          </h2>
          <p className="text-base text-muted-foreground mt-1">
            {metier} — {action}
          </p>
        </div>
        <div className="space-y-2">
          <button
            type="button"
            onClick={onConfirm}
            className="w-full h-16 rounded-xl bg-gold text-gold-foreground text-lg font-semibold flex items-center justify-center gap-2 active:opacity-90"
          >
            <Check className="h-5 w-5" />
            Oui, enregistrer
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full h-16 rounded-xl border border-border bg-background text-lg font-semibold active:bg-muted"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  )
}

/** Status codes → sentences the bonnetier can act on (§45.3: never a raw
 *  code, never a toast). 409 in particular is not an error the operator
 *  caused — the floor moved under them, usually because someone else advanced
 *  the same OF. */
function messagePourErreur(e: Error & { status?: number }): string {
  switch (e.status) {
    case 401:
      return "Ce téléphone n'est pas connecté. Prévenez le régleur."
    case 403:
      return "Ce téléphone n'a pas le droit d'enregistrer. Prévenez le régleur."
    case 409:
      return "Cette action n'est plus possible — l'OF a changé. Revenez en arrière et rouvrez le métier."
    case 404:
      return "Cet OF n'existe plus."
    default:
      return "L'enregistrement a échoué. Réessayez ; si ça recommence, prévenez le régleur."
  }
}
