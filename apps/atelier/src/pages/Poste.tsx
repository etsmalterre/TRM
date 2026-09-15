// The poste — legacy FEN_Action_Machine, the screen the bonnetier actually
// works. Layout is §45 (« Poste »), which this satisfies on all three tests:
// the métier imposes the OF and the OF imposes the pièce, there is exactly one
// action that commits, and the operator stands at it all day. Phone scale
// rather than desk scale, but the same band stack.
//
// The commit path is live: band 4 writes evenement_piece, piece_production,
// defaut_qualite and the ordre_fabrication timestamps, from an enrolled phone
// (enrolment is the right to write). There is NO undo yet — the legacy has one
// (IMG_Annuler on the last action) and this does not.
import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Loader2,
  AlertCircle,
  Gauge,
  ClipboardList,
  MessageSquareText,
  Wrench,
  History,
} from 'lucide-react'
import { BobineIcon } from '@/components/icons/BobineIcon'
import { fetchMachines, fetchOf, progression } from '@/lib/atelier-api'
import { actionsDisponibles } from '@/lib/actions'
import { depuis } from '@/lib/depuis'
import { cheminListe } from '@/lib/vue-metiers'
import { PosteHeader } from '@/components/layout/PosteHeader'
import { ConsigneCallout } from '@/components/of/ConsigneCallout'
import { SaisieBand } from '@/components/atelier/SaisieBand'
import { BonnetierPhoto } from '@/components/atelier/BonnetierPhoto'
import { BoutonIcone } from '@/components/atelier/BoutonIcone'
import { Lien } from '@/components/atelier/Lien'
import { MetierAuRepos } from '@/components/atelier/MetierAuRepos'
import { useIdentite } from '@/contexts/BonnetierContext'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function Poste() {
  const { machineId } = useParams<{ machineId: string }>()
  const navigate = useNavigate()
  const { identite } = useIdentite()
  const idMachine = Number(machineId) || 0

  // The machine list is already in cache from the picker; this resolves the
  // active OF without a dedicated round trip and refetches on its own if the
  // operator deep-linked straight here.
  const regleur = identite?.regleur ?? false
  const machinesQ = useQuery({
    queryKey: ['atelier', 'machines', regleur],
    queryFn: () => fetchMachines(regleur),
  })

  const machine = machinesQ.data?.find((m) => m.IDmachine === idMachine)
  const ofId = machine?.of?.IDordre_fabrication ?? 0

  const ofQ = useQuery({
    queryKey: ['atelier', 'of', ofId],
    queryFn: () => fetchOf(ofId),
    enabled: ofId > 0,
  })

  const of = ofQ.data
  // Hooks before any early return (React error #310 in production builds).
  const actions = useMemo(
    () => (of ? actionsDisponibles(of, identite?.regleur ?? false) : []),
    [of, identite?.regleur],
  )

  const titre = machine?.label ?? '—'
  const chargement = machinesQ.isLoading || (ofId > 0 && ofQ.isLoading)

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Band 1 — the poste bar. */}
      {/* Back to the list on the tab this métier sits on (lib/vue-metiers.ts). */}
      <PosteHeader titre={titre} onBack={() => navigate(cheminListe(machine, regleur))} />

      {chargement && (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      )}

      {!chargement && !machine && (
        <EtatVide
          titre="Métier introuvable"
          detail="Ce métier n'existe plus ou a été archivé."
        />
      )}

      {/* An idle métier is a screen of its own, not an empty state: the OF
          waiting next and the last twenty that ran here (2026-09-15). */}
      {!chargement && machine && !machine.of && <MetierAuRepos machine={machine} />}

      {!chargement && machine && machine.of && !of && (
        <EtatVide
          titre="OF illisible"
          detail={`L'OF ${machine.of.IDordre_fabrication} du métier ${machine.label} n'a pas pu être chargé.`}
        />
      )}

      {of && (
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-transparent">
          {/* Band 2 — what the context resolved to. §5 detail header: gold
              icon box, 2xl heading, the short gold gradient rule. The
              progression sits under the reference so the top-right corner
              holds the legacy's top-bar icons (IMG_Warning → FEN_Consigne,
              FEN_Fils_OF, FEN_Historique) as bare icon buttons — the régleur
              opens them every day and learns them, so no label (2026-09-15). */}
          <div className="px-3 pt-3">
            <div className="flex items-center gap-2.5">
              <div className="icon-box-gold h-10 w-10 flex items-center justify-center flex-shrink-0">
                <ClipboardList className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-heading font-bold tracking-tight leading-none">
                  OF {of.IDordre_fabrication}
                </h1>
                <p className="text-xs text-muted-foreground truncate mt-1">
                  {of.reference}
                  {of.coloris ? ` · ${of.coloris}` : ''}
                </p>
                <p className="text-xs font-medium tabular-nums truncate mt-0.5">
                  {progression(of)}
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <BoutonIcone
                  onClick={() => navigate(`/metier/${idMachine}/consigne`)}
                  label={
                    of.nb_messages > 0
                      ? `Consigne, notes et messages · ${of.nb_messages} message${of.nb_messages > 1 ? 's' : ''}`
                      : 'Consigne, notes et messages'
                  }
                  badge={of.nb_messages > 0 ? of.nb_messages : undefined}
                >
                  <MessageSquareText className="h-5 w-5" />
                </BoutonIcone>
                <BoutonIcone
                  onClick={() => navigate(`/metier/${idMachine}/fils`)}
                  label="Fils · lots et emplacements"
                >
                  <BobineIcon className="h-5 w-5" />
                </BoutonIcone>
                <BoutonIcone
                  onClick={() => navigate(`/metier/${idMachine}/historique`)}
                  label="Historique · pièces et visitage"
                >
                  <History className="h-5 w-5" />
                </BoutonIcone>
              </div>
            </div>
            <div className="mt-2 h-px w-24 bg-gradient-to-r from-gold to-transparent" />
          </div>

          {/* Band 3 — the context the operator reads before acting. */}
          <div className="p-3 space-y-2.5">
            <Card className="p-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Pièce en cours
                </div>
                <div className="text-xl font-heading font-bold tracking-tight tabular-nums">
                  N° {of.piece_en_cours.numero_affiche}
                  <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                    {of.poids_piece} Kg
                  </span>
                </div>
              </div>
              {/* The counter the bonnetier dials into the métier. Absent when
                  the reference has no sheet for this machine — the legacy
                  blanks it too, and a guessed counter is a wrong piece. */}
              <div className="flex items-center gap-2 pl-3 border-l border-border/60 flex-shrink-0">
                <Gauge className="h-4 w-4 text-muted-foreground" />
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Compteur
                  </div>
                  <div className="text-xl font-heading font-bold tabular-nums">
                    {of.compteur ?? '—'}
                  </div>
                </div>
              </div>
            </Card>

            {/* §46 — the standing instruction, identical here and on the ERP's
                OF fiche. Renders nothing when there is no consigne. */}
            <ConsigneCallout texte={of.consigne} />

            {/* The réglage sheet stays a labelled row: it appears only for a
                régleur on an OF that has not started, and it leads to the
                launch, so it is not one of the daily icons of band 2. */}
            {regleur && !of.demarre && (
              <div className="grid">
                <Lien
                  onClick={() => navigate(`/metier/${idMachine}/reglage`)}
                  icone={<Wrench className="h-5 w-5" />}
                  label="Réglage"
                  detail="Fiche de réglage et lancement"
                />
              </div>
            )}
          </div>

          {/* Band 4 — the input band, and the only place this app writes. */}
          <SaisieBand of={of} actions={actions} metier={titre} />
        </div>
      )}

      {/* Band 5 — the trace: what happened last on this piece. Anchored under
          the scroll area as app chrome, in the header's navy, so the poste is
          framed top and bottom and the trace never scrolls away or floats
          mid-screen (Vincent, 2026-09-15: the off-white band read as more
          content). It owns the bottom safe-area inset. */}
      {of && (
        <footer
          className="flex-shrink-0 bg-gradient-brand text-white shadow-[0_-6px_16px_-8px_rgba(0,0,0,0.35)]"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="px-4 py-3 flex items-center gap-3">
            {of.derniere_action ? (
              <>
                <BonnetierPhoto
                  id={of.derniere_action.IDbonnetier}
                  nom={of.derniere_action.evenement}
                  size={44}
                  className="border-gold"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gold">
                    Dernière action
                  </div>
                  <div className="text-base font-semibold truncate leading-tight">
                    {of.derniere_action.evenement}
                  </div>
                  {of.derniere_action.detail && (
                    <div className="text-xs text-white/70 truncate">{of.derniere_action.detail}</div>
                  )}
                </div>
                <div
                  className="text-right flex-shrink-0 tabular-nums"
                  title={formatQuand(of.derniere_action.date_ms)}
                >
                  <div className="text-sm font-semibold">{depuis(of.derniere_action.date_ms)}</div>
                  <div className="text-[11px] text-white/60">{formatQuand(of.derniere_action.date_ms)}</div>
                </div>
              </>
            ) : (
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gold">
                  Dernière action
                </div>
                <div className="text-sm text-white/70 italic">Rien encore sur cette pièce.</div>
              </div>
            )}
          </div>
        </footer>
      )}
    </div>
  )
}

function EtatVide({ titre, detail }: { titre: string; detail: string }) {
  return (
    <div className={cn('flex-1 flex flex-col items-center justify-center gap-2 px-8 text-center')}>
      <AlertCircle className="h-9 w-9 text-muted-foreground" />
      <p className="text-base font-semibold">{titre}</p>
      <p className="text-sm text-muted-foreground">{detail}</p>
    </div>
  )
}

function formatQuand(ms: number | null): string {
  if (ms === null) return '—'
  return new Date(ms).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}
