// The poste — legacy FEN_Action_Machine, the screen the bonnetier actually
// works. Layout is §45 (« Poste »), which this satisfies on all three tests:
// the métier imposes the OF and the OF imposes the pièce, there is exactly one
// action that commits, and the operator stands at it all day. Phone scale
// rather than desk scale, but the same band stack.
//
// The commit path is live: band 4 writes evenement_piece, piece_production,
// defaut_qualite and the ordre_fabrication timestamps, behind the
// `saisie_atelier` right. There is NO undo yet — the legacy has one
// (IMG_Annuler on the last action) and this does not.
import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Loader2,
  AlertCircle,
  Gauge,
  ClipboardList,
  Clock,
  MessageSquareText,
  Wrench,
  ChevronRight,
} from 'lucide-react'
import { fetchMachines, fetchOf, progression } from '@/lib/atelier-api'
import { actionsDisponibles } from '@/lib/actions'
import { PosteHeader } from '@/components/layout/PosteHeader'
import { ConsigneCallout } from '@/components/of/ConsigneCallout'
import { SaisieBand } from '@/components/atelier/SaisieBand'
import { BonnetierPhoto } from '@/components/atelier/BonnetierPhoto'
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
    staleTime: 30_000,
  })

  const machine = machinesQ.data?.find((m) => m.IDmachine === idMachine)
  const ofId = machine?.of?.IDordre_fabrication ?? 0

  const ofQ = useQuery({
    queryKey: ['atelier', 'of', ofId],
    queryFn: () => fetchOf(ofId),
    enabled: ofId > 0,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
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
      <PosteHeader titre={titre} onBack={() => navigate('/')} />

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

      {!chargement && machine && !of && (
        <EtatVide
          titre="Aucun OF en cours"
          detail={`Le métier ${machine.label} ne tourne sur aucun ordre de fabrication.`}
        />
      )}

      {of && (
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-transparent">
          {/* Band 2 — what the context resolved to. §5 detail header: gold
              icon box, 2xl heading, the short gold gradient rule. */}
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
              </div>
              <span className="text-sm font-medium tabular-nums text-right flex-shrink-0">
                {progression(of)}
              </span>
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

            {/* The legacy's top-bar icons (IMG_Warning → FEN_Consigne with the
                message count; the réglage sheet for a régleur on an OF that has
                not started), as station-scale rows rather than 24 px glyphs. */}
            <div className="grid grid-cols-2 gap-2.5">
              <Lien
                onClick={() => navigate(`/metier/${idMachine}/consigne`)}
                icone={<MessageSquareText className="h-5 w-5" />}
                label="Consigne"
                detail={
                  of.nb_messages > 0
                    ? `${of.nb_messages} message${of.nb_messages > 1 ? 's' : ''}`
                    : 'Aucun message'
                }
                badge={of.nb_messages > 0 ? of.nb_messages : undefined}
              />
              {regleur && !of.demarre && (
                <Lien
                  onClick={() => navigate(`/metier/${idMachine}/reglage`)}
                  icone={<Wrench className="h-5 w-5" />}
                  label="Réglage"
                  detail="Fiche de réglage et lancement"
                />
              )}
            </div>
          </div>

          {/* Band 4 — the input band, and the only place this app writes. */}
          <SaisieBand of={of} actions={actions} metier={titre} />

          {/* Band 5 — the trace: what happened last on this piece. */}
          <div className="px-3 pb-3">
            <div className="border-t border-border/60 pt-2.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
                Dernière action
              </div>
              {of.derniere_action ? (
                <div className="flex items-center gap-2.5">
                  <BonnetierPhoto
                    id={of.derniere_action.IDbonnetier}
                    nom={of.derniere_action.evenement}
                    size={36}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">
                      {of.derniere_action.evenement}
                    </div>
                    {of.derniere_action.detail && (
                      <div className="text-xs text-muted-foreground truncate">
                        {of.derniere_action.detail}
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatQuand(of.derniere_action.date_ms)}
                  </span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  Rien encore sur cette pièce.
                </p>
              )}
            </div>
          </div>

          <div style={{ height: 'env(safe-area-inset-bottom)' }} />
        </div>
      )}
    </div>
  )
}

/** A navigation row of band 3: icon, label, one line of detail, chevron. Same
 *  height as the tiles of the métier list, so a thumb finds it the same way. */
function Lien({
  onClick,
  icone,
  label,
  detail,
  badge,
}: {
  onClick: () => void
  icone: React.ReactNode
  label: string
  detail: string
  badge?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-xl border border-border bg-card shadow-sm p-3 flex items-center gap-2.5 active:bg-muted transition-colors min-w-0"
    >
      <span className="relative flex-shrink-0 h-9 w-9 rounded-full bg-secondary text-primary flex items-center justify-center">
        {icone}
        {badge !== undefined && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-gold text-gold-foreground text-[10px] font-bold flex items-center justify-center tabular-nums">
            {badge}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold truncate">{label}</span>
        <span className="block text-xs text-muted-foreground truncate">{detail}</span>
      </span>
      <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
    </button>
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
