// Band 4 of the poste (§45.2) — the only place in this app that writes.
//
// Legacy: FEN_Action_Machine's COMBO_Action + GR_Defaut + BTN_Valider.
//
// Redesigned 2026-09-15 (Vincent: « no scrolling on this screen »). The legacy
// shape — pick an action, pick a defect, press Valider, confirm — cost a band
// header, a five-row column of choices and a 64 px Valider, ~430 px of a phone.
// The actions fall into three kinds, and the band now says so in two rows:
//
//   [ Nettoyage 1/2 ] [ Fin de pièce ] [⏸]   routine · routine · régleur only
//   [ Signaler un défaut              ]       quality
//
//  - A tile opens its confirmation directly: two taps, never one. The legacy's
//    « Voulez-vous vraiment enregistrer » stays — there is no undo on the phone.
//  - Tiles hold their SLOT. Nettoyage stays in place once the piece's cleanings
//    are done (disabled, « 2/2 ✓ ») rather than vanishing and sliding Fin de
//    pièce under the thumb; it only drops out on an OF that requires none.
//    « Terminer OF » takes Fin de pièce's slot on the last piece, as the legacy
//    swaps the combo entry.
//  - « Dernière pièce » (« finir le fil » OFs only) is the other answer of the
//    Fin de pièce sheet, not a third tile. ⚠️ It is NOT a milder Fin de pièce:
//    the API closes the piece AND TERMINATES THE OF (same branch as Terminer
//    OF), so it gets its own « l'OF sera terminé » confirmation.
//  - Pause / play is the régleur's Interrompre / Relancer OF pair as one square
//    button carrying the métier list's state glyph: blue ⏸, green ▶ while the
//    OF stands interrupted.
//  - Défaut opens DefautSheet, which is its own confirmation.
//
// Failures render INLINE as text, never a toast (§45.3): at a machine a toast is
// missed, and a missed failure means the bonnetier believes they recorded
// something they did not. The phone buzzes on the server's answer (main.tsx).
//
// Which actions exist is still decided by lib/actions.ts, mirrored by the API —
// this band only lays them out.
import { useEffect, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Brush,
  Check,
  CheckCheck,
  Clock,
  Flag,
  Loader2,
  Pause,
  Play,
  ShieldAlert,
} from 'lucide-react'
import {
  fetchLookupsDefauts,
  posterEvenement,
  type OfContexte,
  type SaisiePayload,
} from '@/lib/atelier-api'
import type { ActionAtelier } from '@/lib/actions'
import { useIdentite } from '@/contexts/BonnetierContext'
import { ConfirmSheet } from '@/components/atelier/ConfirmSheet'
import { DefautSheet } from '@/components/atelier/DefautSheet'
import { messagePourErreur } from '@/lib/erreurs'
import { cn } from '@/lib/utils'

/** What is open over the band. `ofId` pins the sheet to the OF it was opened
 *  on, so a poll that swaps the OF underneath can never redirect a write. */
type Feuille =
  | { kind: 'confirmer'; action: ActionAtelier; ofId: number }
  | { kind: 'fin'; ofId: number }
  | { kind: 'defaut'; ofId: number }

const ICONES: Partial<Record<ActionAtelier, ReactNode>> = {
  'Lancement OF': <Play className="h-5 w-5" />,
  Nettoyage: <Brush className="h-5 w-5" />,
  'Fin de pièce': <Flag className="h-5 w-5" />,
  'Terminer OF': <CheckCheck className="h-5 w-5" />,
  'Dernière pièce': <CheckCheck className="h-5 w-5" />,
  'Interrompre OF': <Pause className="h-5 w-5" />,
  'Relancer OF': <Play className="h-5 w-5" />,
}

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

  const [feuille, setFeuille] = useState<Feuille | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  // Fetched with the band rather than on opening the sheet, so the sheet opens
  // on its chips instead of a spinner.
  const lookups = useQuery({
    queryKey: ['atelier', 'lookups', 'defauts'],
    queryFn: fetchLookupsDefauts,
    // Legacy window content — it does not change between deploys.
    staleTime: Infinity,
    refetchInterval: false,
  })

  // The OF is polled (lib/rafraichissement.ts), so what is offered can change
  // under an open sheet: another phone recorded the fin de pièce, the ERP
  // terminated the OF, the next one activated. The sheet is closed with the
  // reason inline rather than sent for the server to refuse. `actions` is
  // memoised on the OF object, which React Query keeps stable while the payload
  // is unchanged, so this only fires on a real change.
  useEffect(() => {
    if (!feuille) return
    const requise: ActionAtelier =
      feuille.kind === 'confirmer' ? feuille.action : feuille.kind === 'fin' ? 'Dernière pièce' : 'Défaut'
    if (feuille.ofId !== of.IDordre_fabrication || !actions.includes(requise)) {
      setFeuille(null)
      setErreur("L'OF a évolué depuis un autre poste : l'action choisie n'est plus proposée.")
    }
  }, [actions, feuille, of.IDordre_fabrication])

  const mut = useMutation({
    mutationFn: (body: SaisiePayload) => posterEvenement(of.IDordre_fabrication, body),
    onSuccess: () => {
      setErreur(null)
      // The métier list carries each OF's progression, so it is stale too.
      qc.invalidateQueries({ queryKey: ['atelier', 'of', of.IDordre_fabrication] })
      qc.invalidateQueries({ queryKey: ['atelier', 'machines'] })
    },
    onError: (e: Error & { status?: number }) => {
      setErreur(messagePourErreur(e))
    },
  })

  // Why nothing in the band can be pressed right now — the title of every
  // disabled tile (§45.3).
  const bloque = !identite
    ? "Personne n'est identifié sur ce poste."
    : mut.isPending
      ? 'Enregistrement en cours…'
      : null

  function enregistrer(action: ActionAtelier, defaut?: SaisiePayload['defaut']) {
    if (!identite) return
    setErreur(null)
    mut.mutate(
      { action, IDbonnetier: identite.id, defaut },
      // Only the défaut sheet stays open during the write, so a refusal lands
      // inside it with the chosen type still selected.
      { onSuccess: () => setFeuille(null) },
    )
  }

  function ouvrir(f: Feuille) {
    setErreur(null)
    setFeuille(f)
  }

  const ofId = of.IDordre_fabrication
  const enCours = mut.isPending ? (mut.variables?.action as ActionAtelier | undefined) : undefined
  const a = (x: ActionAtelier) => actions.includes(x)

  const lancement = a('Lancement OF')
  const fin: ActionAtelier | null = a('Terminer OF') ? 'Terminer OF' : a('Fin de pièce') ? 'Fin de pièce' : null
  const pause: ActionAtelier | null = a('Relancer OF') ? 'Relancer OF' : a('Interrompre OF') ? 'Interrompre OF' : null
  const avecNettoyage = of.nb_nettoyages_requis > 0
  const nettoyagesFaits = Math.min(of.nb_nettoyages_faits, of.nb_nettoyages_requis)

  return (
    <div className="px-3 pb-3 space-y-2">
      {!of.demarre && !lancement ? (
        // A bonnetier on an OF the régleur has not launched yet: nothing to
        // record, and the band says why rather than showing a launch button
        // the server would refuse (lib/actions.ts, 2026-09-22).
        <p className="flex items-center justify-center gap-2 h-16 rounded-xl border border-dashed border-border text-sm text-muted-foreground">
          <Clock className="h-4 w-4 flex-shrink-0" />
          OF non lancé — en attente du régleur
        </p>
      ) : lancement ? (
        <button
          type="button"
          disabled={bloque !== null}
          title={bloque ?? `Enregistrer « Lancement OF » sur ${metier}`}
          onClick={() => ouvrir({ kind: 'confirmer', action: 'Lancement OF', ofId })}
          className="w-full h-16 rounded-xl bg-gold text-gold-foreground text-lg font-semibold flex items-center justify-center gap-2 shadow active:opacity-90 disabled:opacity-40 disabled:shadow-none"
        >
          {enCours === 'Lancement OF' ? <Loader2 className="h-5 w-5 animate-spin" /> : ICONES['Lancement OF']}
          Lancement OF
        </button>
      ) : (
        <>
          {/* Row 1 — the routine pair, and the régleur's pause / play. */}
          <div className="flex gap-2">
            {avecNettoyage && (
              <Tuile
                icone={ICONES.Nettoyage}
                label="Nettoyage"
                sous={
                  a('Nettoyage') ? (
                    `${nettoyagesFaits}/${of.nb_nettoyages_requis}`
                  ) : (
                    <span className="inline-flex items-center gap-0.5">
                      {nettoyagesFaits}/{of.nb_nettoyages_requis}
                      <Check className="h-3 w-3" />
                    </span>
                  )
                }
                enCours={enCours === 'Nettoyage'}
                disabled={bloque !== null || !a('Nettoyage')}
                title={
                  bloque ??
                  (a('Nettoyage')
                    ? `Enregistrer « Nettoyage » sur ${metier}`
                    : 'Les nettoyages de cette pièce sont faits.')
                }
                onClick={() => ouvrir({ kind: 'confirmer', action: 'Nettoyage', ofId })}
              />
            )}
            {fin && (
              <Tuile
                icone={ICONES[fin]}
                label={fin}
                sous={fin === 'Terminer OF' ? 'dernière pièce' : a('Dernière pièce') ? 'ou dernière' : undefined}
                accent={fin === 'Terminer OF'}
                enCours={enCours === fin || enCours === 'Dernière pièce'}
                disabled={bloque !== null}
                title={bloque ?? `Enregistrer « ${fin} » sur ${metier}`}
                onClick={() =>
                  ouvrir(
                    fin === 'Fin de pièce' && a('Dernière pièce')
                      ? { kind: 'fin', ofId }
                      : { kind: 'confirmer', action: fin, ofId },
                  )
                }
              />
            )}
            {/* Dressed like the tiles beside it (white card, border, shadow),
                carrying the métier list's state glyph (ChoixMetier ETATS: round
                bg-secondary disc) — the glyph of the state the tap LEADS TO, in
                that state's colour: blue ⏸ to interrupt, green ▶ to resume. A
                bare grey disc read as disabled next to the tiles (2026-09-15). */}
            {pause && (
              <button
                type="button"
                disabled={bloque !== null}
                onClick={() => ouvrir({ kind: 'confirmer', action: pause, ofId })}
                title={bloque ?? (pause === 'Relancer OF' ? "L'OF est interrompu — Relancer OF" : 'Interrompre OF')}
                aria-label={pause}
                className="h-16 w-16 flex-shrink-0 rounded-xl border border-border bg-card shadow-sm flex items-center justify-center transition-colors active:bg-muted disabled:opacity-40"
              >
                <span
                  className={cn(
                    'h-11 w-11 rounded-full flex items-center justify-center',
                    pause === 'Relancer OF' ? 'bg-success/15 text-success' : 'bg-primary/10 text-primary',
                  )}
                >
                  {enCours === pause ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : pause === 'Relancer OF' ? (
                    <Play className="h-6 w-6 fill-current" />
                  ) : (
                    <Pause className="h-6 w-6 fill-current" />
                  )}
                </span>
              </button>
            )}
          </div>

          {/* Row 2 — quality. */}
          {a('Défaut') && (
            <button
              type="button"
              disabled={bloque !== null}
              title={bloque ?? `Signaler un défaut sur ${metier}`}
              onClick={() => ouvrir({ kind: 'defaut', ofId })}
              className="w-full h-14 rounded-xl border border-border bg-card shadow-sm text-lg font-semibold flex items-center justify-center gap-2 active:bg-muted disabled:opacity-40"
            >
              {enCours === 'Défaut' ? (
                <Loader2 className="h-5 w-5 animate-spin text-destructive" />
              ) : (
                <ShieldAlert className="h-5 w-5 text-destructive" />
              )}
              Signaler un défaut
            </button>
          )}
        </>
      )}

      {erreur && feuille?.kind !== 'defaut' && (
        <p className="flex items-start gap-2 text-sm text-destructive px-1">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>{erreur}</span>
        </p>
      )}

      {feuille?.kind === 'confirmer' && (
        <ConfirmSheet
          titre={<>Voulez-vous vraiment enregistrer&nbsp;?</>}
          detail={
            feuille.action === 'Dernière pièce' || feuille.action === 'Terminer OF'
              ? `${metier} — ${feuille.action} · l'OF ${ofId} sera terminé`
              : `${metier} — ${feuille.action}`
          }
          oui={
            feuille.action === 'Dernière pièce' || feuille.action === 'Terminer OF'
              ? "Oui, terminer l'OF"
              : 'Oui, enregistrer'
          }
          icone={ICONES[feuille.action] ?? <Check className="h-5 w-5" />}
          onCancel={() => setFeuille(null)}
          onConfirm={() => {
            const action = feuille.action
            setFeuille(null)
            enregistrer(action)
          }}
        />
      )}

      {feuille?.kind === 'fin' && (
        <ConfirmSheet
          titre={<>Voulez-vous vraiment enregistrer&nbsp;?</>}
          detail={`${metier} — Fin de pièce`}
          oui="Oui, fin de pièce"
          icone={ICONES['Fin de pièce']}
          alternative={{
            label: "C'est la dernière pièce",
            icone: ICONES['Dernière pièce'],
            onClick: () => setFeuille({ kind: 'confirmer', action: 'Dernière pièce', ofId }),
          }}
          onCancel={() => setFeuille(null)}
          onConfirm={() => {
            setFeuille(null)
            enregistrer('Fin de pièce')
          }}
        />
      )}

      {feuille?.kind === 'defaut' && (
        <DefautSheet
          metier={metier}
          piece={of.piece_en_cours.numero_affiche}
          lookups={lookups.data}
          enCours={mut.isPending}
          bloque={identite ? null : "Personne n'est identifié sur ce poste."}
          erreur={erreur}
          onEnregistrer={(d) => enregistrer('Défaut', d)}
          onClose={() => {
            setFeuille(null)
            setErreur(null)
          }}
        />
      )}
    </div>
  )
}

// A routine action: 64 px tall (a gloved thumb), half the row. The optional
// second line carries the state the operator checks before tapping.
function Tuile({
  icone,
  label,
  sous,
  accent = false,
  enCours,
  disabled,
  title,
  onClick,
}: {
  icone: ReactNode
  label: string
  sous?: ReactNode
  accent?: boolean
  enCours: boolean
  disabled: boolean
  title: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'flex-1 min-w-0 h-16 px-2 rounded-xl border shadow-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-40',
        accent ? 'border-gold bg-gold-light/60 active:bg-gold-light' : 'border-border bg-card active:bg-muted',
      )}
    >
      <span className="text-primary flex-shrink-0">
        {enCours ? <Loader2 className="h-5 w-5 animate-spin" /> : icone}
      </span>
      <span className="min-w-0 text-left leading-tight">
        <span className="block text-base font-semibold truncate">{label}</span>
        {sous && <span className="block text-xs text-muted-foreground tabular-nums">{sous}</span>}
      </span>
    </button>
  )
}
