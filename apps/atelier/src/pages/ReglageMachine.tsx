// The réglage sheet — legacy FEN_Reglage_Machine, a régleur-build window.
//
// What a régleur reads at the machine before « Lancer OF »: the LFA of the
// reference that just ran next to the LFA of the one to set up, with the
// métier's repères per feed tour; the plateau and abattage settings, the
// chute count and the counter to dial in, the spreader and the piece weight;
// the yarn on the OF; and the consigne. Then one commit — the launch — which
// stamps `demarrage_prod`, opens piece 1 and writes « Début du tricotage »,
// through the same « Lancement OF » event the poste offers, so there is one
// write path for it, not two.
//
// §45 « Poste » at phone scale, like the poste itself: the context is imposed
// (the métier decides the OF), there is exactly one action that commits, and
// everything else on screen exists to make that one press correct. The commit
// button sits at the foot of the screen for the same one-handed reason as
// SaisieBand's.
//
// The consigne is the régleur's to write here (2026-09-15): the legacy sheet
// carries an IMG_Consigne that opens FEN_Consigne plan 3 and comes back; here
// the callout is followed by « Modifier » / « Supprimer » (or « Ajouter une
// consigne » when there is none) and the editor is a bottom sheet over this
// screen, so the régleur never leaves the sheet they are setting the machine
// from. The write is the one PUT of lib/consigne.ts — deleting is saving the
// empty string, behind its own confirmation.
//
// « Notes » opens the Consigne screen on its Notes tab: the standing
// notes of the reference (`obs_ref_ecru`, the ERP's « Commentaires
// historiques ») and the message_of thread — everything anyone has written
// about this OF, in one place, one tap away.
//
// Legacy Choix_Metier refuses to open this window when no `ref_ecru_machine`
// sheet exists for the reference on this métier (« La référence demandée
// n'est pas disponible sur cette machine »). Here the sheet renders that
// sentence in place of the launch button — the refusal stays, the dead end
// does not.
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Loader2,
  AlertCircle,
  AlertTriangle,
  Wrench,
  Play,
  Check,
  ChevronRight,
  Pencil,
  Trash2,
  Plus,
  NotebookText,
} from 'lucide-react'
import { fetchMachines, fetchMessages, fetchNotesRef, fetchReglage, posterEvenement } from '@/lib/atelier-api'
import { messagePourErreur } from '@/lib/erreurs'
import { useEcrireConsigne, messagePourErreurConsigne } from '@/lib/consigne'
import { PosteHeader } from '@/components/layout/PosteHeader'
import { ConsigneCallout } from '@/components/of/ConsigneCallout'
import { ConsigneSheet } from '@/components/of/ConsigneSheet'
import { ConfirmSheet } from '@/components/atelier/ConfirmSheet'
import { Lien } from '@/components/atelier/Lien'
import { Entete } from '@/components/atelier/Entete'
import { useIdentite } from '@/contexts/BonnetierContext'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function ReglageMachine() {
  const { machineId } = useParams<{ machineId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { identite } = useIdentite()
  const idMachine = Number(machineId) || 0
  const regleur = identite?.regleur ?? false

  const machinesQ = useQuery({
    queryKey: ['atelier', 'machines', regleur],
    queryFn: () => fetchMachines(regleur),
  })
  const machine = machinesQ.data?.find((m) => m.IDmachine === idMachine)
  const ofId = machine?.of?.IDordre_fabrication ?? 0

  const sheetQ = useQuery({
    queryKey: ['atelier', 'reglage', ofId],
    queryFn: () => fetchReglage(ofId),
    enabled: ofId > 0,
  })
  const sheet = sheetQ.data

  // The counts behind « Notes ». Same keys as the Consigne screen, so the
  // tap there lands on data already in cache.
  const notesQ = useQuery({
    queryKey: ['atelier', 'notes', ofId],
    queryFn: () => fetchNotesRef(ofId),
    enabled: ofId > 0,
  })
  const messagesQ = useQuery({
    queryKey: ['atelier', 'messages', ofId],
    queryFn: () => fetchMessages(ofId),
    enabled: ofId > 0,
  })

  const [confirmer, setConfirmer] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [editerConsigne, setEditerConsigne] = useState(false)
  const [supprimerConsigne, setSupprimerConsigne] = useState(false)
  const [erreurConsigne, setErreurConsigne] = useState<string | null>(null)

  const ecrireConsigne = useEcrireConsigne(ofId, identite?.id ?? 0)

  const lancer = useMutation({
    mutationFn: () => posterEvenement(ofId, { action: 'Lancement OF', IDbonnetier: identite!.id }),
    onSuccess: () => {
      setErreur(null)
      qc.invalidateQueries({ queryKey: ['atelier', 'machines'] })
      qc.invalidateQueries({ queryKey: ['atelier', 'of', ofId] })
      qc.invalidateQueries({ queryKey: ['atelier', 'reglage', ofId] })
      // Legacy: « OuvreFenêtreMobile(FEN_Choix_Metier) » after the launch.
      navigate('/', { replace: true })
    },
    onError: (e: Error & { status?: number }) => setErreur(messagePourErreur(e)),
  })

  // One branch per precondition, so the disabled button always says why (§45.3).
  const empeche = ((): string | null => {
    if (!identite) return "Personne n'est identifié sur ce poste."
    if (!sheet) return 'Chargement…'
    if (sheet.termine) return 'Cet OF est terminé.'
    if (sheet.demarre) return 'Cet OF est déjà lancé.'
    if (!sheet.eligible) return "La référence demandée n'est pas disponible sur cette machine."
    if (lancer.isPending) return 'Lancement en cours…'
    return null
  })()

  const titre = machine?.label ?? '—'
  const chargement = machinesQ.isLoading || (ofId > 0 && sheetQ.isLoading)
  // The API refuses a consigne on a finished OF (409); a bonnetier's phone
  // reads only. The route, not this flag, is what holds the rule.
  const peutEcrireConsigne = regleur && !!identite && !!sheet && !sheet.termine

  const nbNotes = notesQ.data?.length
  const nbMessages = messagesQ.data?.length
  const detailHistorique =
    nbNotes === undefined && nbMessages === undefined
      ? 'Notes de la référence et messages'
      : [
          `${nbNotes ?? 0} note${(nbNotes ?? 0) > 1 ? 's' : ''}`,
          `${nbMessages ?? 0} message${(nbMessages ?? 0) > 1 ? 's' : ''}`,
        ].join(' · ')
  const totalHistorique = (nbNotes ?? 0) + (nbMessages ?? 0)

  return (
    <div className="h-full flex flex-col bg-background">
      <PosteHeader titre={titre} onBack={() => navigate(-1)} />

      {chargement && (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      )}

      {!chargement && !machine && (
        <EtatVide titre="Métier introuvable" detail="Ce métier n'existe plus ou a été archivé." />
      )}

      {!chargement && machine && !ofId && (
        <EtatVide
          titre="Aucun OF à régler"
          detail={`Le métier ${machine.label} n'a aucun ordre de fabrication en attente.`}
        />
      )}

      {!chargement && ofId > 0 && sheetQ.isError && (
        <EtatVide titre="Fiche indisponible" detail="Impossible de charger la fiche de réglage." />
      )}

      {sheet && (
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-transparent">
          {/* Band 2 — what the métier resolved to (§5 detail header). */}
          <div className="px-3 pt-3">
            <div className="flex items-center gap-2.5">
              <div className="icon-box-gold h-10 w-10 flex items-center justify-center flex-shrink-0">
                <Wrench className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-heading font-bold tracking-tight leading-none">
                  OF {sheet.IDordre_fabrication}
                </h1>
                <p className="text-xs text-muted-foreground truncate mt-1">
                  {sheet.reference}
                  {sheet.coloris ? ` · ${sheet.coloris}` : ''}
                </p>
              </div>
              <span
                className={cn(
                  'text-xs font-semibold uppercase tracking-wide rounded-full px-2.5 h-7 flex items-center flex-shrink-0',
                  sheet.demarre ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning-foreground',
                )}
              >
                {sheet.demarre ? 'Lancé' : 'À lancer'}
              </span>
            </div>
            <div className="mt-2 h-px w-24 bg-gradient-to-r from-gold to-transparent" />
          </div>

          <div className="p-3 space-y-2.5">
            {!sheet.eligible && (
              <Card className="p-3 flex items-start gap-2.5 border-destructive/30 bg-destructive/5">
                <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold">
                    La référence demandée n'est pas disponible sur cette machine.
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Aucune fiche de réglage n'existe pour {sheet.reference || 'cette référence'} sur le
                    métier {sheet.machine}. À créer dans l'ERP (Tombé Métier › Références) avant de lancer.
                  </p>
                </div>
              </Card>
            )}

            {/* §46 — the consigne, and for a régleur the hands on it. The
                callout stays the one component; only the strip under it is
                new. Nothing when there is none and the phone cannot write. */}
            <ConsigneCallout texte={sheet.consigne} />
            {peutEcrireConsigne &&
              (sheet.consigne.trim() ? (
                <div className="grid grid-cols-2 gap-2 -mt-0.5">
                  <ActionConsigne
                    icone={<Pencil className="h-4 w-4" />}
                    label="Modifier"
                    onClick={() => {
                      setErreurConsigne(null)
                      setEditerConsigne(true)
                    }}
                  />
                  <ActionConsigne
                    icone={<Trash2 className="h-4 w-4" />}
                    label="Supprimer"
                    destructive
                    disabled={ecrireConsigne.isPending}
                    onClick={() => {
                      setErreurConsigne(null)
                      setSupprimerConsigne(true)
                    }}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setErreurConsigne(null)
                    setEditerConsigne(true)
                  }}
                  className="w-full h-11 rounded-xl border border-dashed border-border text-sm font-medium text-muted-foreground flex items-center justify-center gap-1.5 active:bg-muted"
                >
                  <Plus className="h-4 w-4" />
                  Ajouter une consigne
                </button>
              ))}
            {erreurConsigne && (
              <p className="flex items-start gap-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{erreurConsigne}</span>
              </p>
            )}

            {/* Repères — the legacy's ZR_Repere: one row per feed tour. */}
            <Card className="overflow-hidden">
              <Entete>Repères</Entete>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="text-left font-medium px-3 py-1.5">Tour</th>
                    <th className="text-right font-medium px-2 py-1.5">LFA préc.</th>
                    <th className="text-right font-medium px-2 py-1.5">LFA</th>
                    <th className="text-right font-medium px-3 py-1.5">Repère</th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.reperes
                    .filter((r) => r.tour <= 4 || r.repere)
                    .map((r) => (
                      <tr key={r.tour} className="border-t border-border/60">
                        <td className="px-3 py-2 font-medium tabular-nums">{r.tour}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{r.lfa_precedente || '—'}</td>
                        <td className="px-2 py-2 text-right tabular-nums font-semibold">{r.lfa || '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.repere || '—'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </Card>

            {/* Réglages — the legacy's ZR_Reglage, five label/value pairs. */}
            <Card className="overflow-hidden">
              <Entete>Réglages</Entete>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 p-3">
                <KV label="Hauteur plateau" value={sheet.reglages.hauteur_pl} />
                <KV label="Abattage" value={sheet.reglages.abattage} />
                <KV label="Nb chutes" value={sheet.reglages.nb_chutes || ''} />
                <KV label="Compteur" value={sheet.reglages.compteur ?? ''} strong />
                <KV label="Écarteur" value={sheet.reglages.ecarteur || ''} />
                <KV label="Poids pièce" value={sheet.reglages.poids_piece ? `${sheet.reglages.poids_piece} Kg` : ''} />
                <KV label="Maille d'ouverture" value={sheet.reglages.maille_ouverture ? 'Oui' : 'Non'} />
                <KV label="Tombé métier" value={sheet.reglages.tombe_metier} />
                <KV label="Ouvert au large" value={sheet.reglages.ouvert_visiteuse ? 'Oui' : 'Non'} />
              </div>
            </Card>

            {/* Fils — the distinct (fil, coloris) pairs of the composition. */}
            <Card className="overflow-hidden">
              <Entete>Fils</Entete>
              {sheet.fils.length === 0 ? (
                <p className="px-3 py-2.5 text-sm text-muted-foreground italic">Aucun fil affecté à cet OF.</p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {sheet.fils.map((f) => (
                    <li key={f} className="px-3 py-2.5 text-sm font-medium">
                      {f}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Everything written about this OF — the legacy's IMG_Consigne
                glyph, as one station-scale row. Not « Historique »: that word is
                the poste's pieces-and-rolls screen (legacy FEN_Historique), and
                one label opening two different screens is a trap. */}
            <div className="grid">
              <Lien
                onClick={() => navigate(`/metier/${idMachine}/consigne`, { state: { onglet: 'notes' } })}
                icone={<NotebookText className="h-5 w-5" />}
                label="Notes"
                detail={detailHistorique}
                badge={totalHistorique > 0 ? totalHistorique : undefined}
              />
            </div>

            {/* The commit — or, once launched, the way to the poste. */}
            {sheet.demarre ? (
              <button
                type="button"
                onClick={() => navigate(`/metier/${idMachine}`, { replace: true })}
                className="w-full h-16 rounded-xl bg-primary text-primary-foreground text-lg font-semibold flex items-center justify-center gap-2 active:opacity-90"
              >
                Ouvrir le poste
                <ChevronRight className="h-5 w-5" />
              </button>
            ) : (
              <div className="space-y-2">
                {erreur && (
                  <p className="flex items-start gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>{erreur}</span>
                  </p>
                )}
                <button
                  type="button"
                  disabled={!!empeche}
                  title={empeche ?? 'Lancer cet OF sur ce métier'}
                  onClick={() => setConfirmer(true)}
                  className="w-full h-16 rounded-xl bg-gold text-gold-foreground text-lg font-semibold flex items-center justify-center gap-2 active:opacity-90 disabled:opacity-40"
                >
                  {lancer.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
                  Lancer OF
                </button>
                {empeche && identite && (
                  <p className="text-xs text-muted-foreground text-center">{empeche}</p>
                )}
              </div>
            )}
          </div>

          <div style={{ height: 'env(safe-area-inset-bottom)' }} />
        </div>
      )}

      {confirmer && sheet && (
        <ConfirmSheet
          // Legacy wording: « Voulez-vous vraiment lancer cet OF sur <emplacement> ? »
          titre={<>Voulez-vous vraiment lancer cet OF sur {sheet.machine}&nbsp;?</>}
          detail={`OF ${sheet.IDordre_fabrication} — ${sheet.reference}${sheet.coloris ? ` · ${sheet.coloris}` : ''}`}
          oui="Oui, lancer"
          icone={<Check className="h-5 w-5" />}
          onCancel={() => setConfirmer(false)}
          onConfirm={() => {
            setConfirmer(false)
            if (!empeche) lancer.mutate()
          }}
        />
      )}

      {editerConsigne && sheet && identite && (
        <ConsigneSheet
          ofId={ofId}
          initiale={sheet.consigne}
          IDbonnetier={identite.id}
          onClose={() => setEditerConsigne(false)}
        />
      )}

      {supprimerConsigne && sheet && (
        <ConfirmSheet
          titre="Supprimer la consigne ?"
          detail={sheet.consigne}
          oui="Oui, supprimer"
          icone={<Trash2 className="h-5 w-5" />}
          variante="destructive"
          onCancel={() => setSupprimerConsigne(false)}
          onConfirm={() => {
            setSupprimerConsigne(false)
            ecrireConsigne.mutate('', {
              onError: (e) => setErreurConsigne(messagePourErreurConsigne(e as Error & { status?: number })),
            })
          }}
        />
      )}
    </div>
  )
}

/** One of the two hands on the consigne: thumb-height, quiet — the red
 *  callout above is the loud thing, the buttons must not compete with it. */
function ActionConsigne({
  icone,
  label,
  destructive,
  disabled,
  onClick,
}: {
  icone: React.ReactNode
  label: string
  destructive?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'h-11 rounded-xl border bg-card text-sm font-semibold flex items-center justify-center gap-1.5 active:bg-muted disabled:opacity-40',
        destructive ? 'border-destructive/30 text-destructive' : 'border-border text-foreground',
      )}
    >
      {icone}
      {label}
    </button>
  )
}

function KV({ label, value, strong }: { label: string; value: string | number; strong?: boolean }) {
  const v = String(value ?? '').trim()
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn('text-base tabular-nums truncate', strong ? 'font-heading font-bold text-xl' : 'font-medium', !v && 'text-muted-foreground')}>
        {v || '—'}
      </div>
    </div>
  )
}

function EtatVide({ titre, detail }: { titre: string; detail: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 px-8 text-center">
      <AlertCircle className="h-9 w-9 text-muted-foreground" />
      <p className="text-base font-semibold">{titre}</p>
      <p className="text-sm text-muted-foreground">{detail}</p>
    </div>
  )
}
