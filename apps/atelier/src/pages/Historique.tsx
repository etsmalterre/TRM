// Historique — legacy FEN_Historique (régleur build).
//
// What has already come off this OF, in two lists behind one switch:
//   Production   one row per piece_production, newest first — « Pièce N° i »
//                (a position counted down from the row count, not the numero
//                column), its knitting time, and its productivity against the
//                theoretical minimum of the reference on this métier. Tapping
//                a row unfolds its events (the legacy's SC_Popup: who did what,
//                when — Début du tricotage, Nettoyage, Fin du tricotage…).
//   Visitage     one card per stock_ecru roll the visitage poste weighed —
//                number, date, weight, visiteuse, and the first/second-choice
//                mark.
//
// Read-only, and the régleur's — as in the legacy, which opens it from a
// régleur-only icon. It was offered to both roles from 2026-09-15 to
// 2026-09-22; Vincent took it back from the bonnetier (the poste hides the
// icon, and this screen sends a bonnetier back to the poste should a stale
// link land here).
//
// The % is the legacy's own arithmetic (ETM/apps/api/src/lib/historique-atelier-trm.ts),
// NOT the ERP's approximation: an Android phone still in service next to this
// one must print the same number.
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader2, AlertCircle, History, Clock, CheckCircle2, XCircle, ChevronDown, ChevronUp, MessageSquareText } from 'lucide-react'
import {
  fetchMachines,
  fetchOf,
  fetchHistorique,
  fetchEvenementsPiece,
  progression,
  type PieceHistorique,
  type RouleauHistorique,
} from '@/lib/atelier-api'
import { PosteHeader } from '@/components/layout/PosteHeader'
import { BonnetierPhoto } from '@/components/atelier/BonnetierPhoto'
import { Segment } from '@/components/atelier/Segment'
import { useIdentite } from '@/contexts/BonnetierContext'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type Onglet = 'production' | 'visitage'

export function Historique() {
  const { machineId } = useParams<{ machineId: string }>()
  const navigate = useNavigate()
  const { identite } = useIdentite()
  const idMachine = Number(machineId) || 0
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
  const histQ = useQuery({
    queryKey: ['atelier', 'historique', ofId],
    queryFn: () => fetchHistorique(ofId),
    enabled: ofId > 0,
  })
  const of = ofQ.data
  const hist = histQ.data

  const [onglet, setOnglet] = useState<Onglet>('production')
  // The unfolded piece. Reset when the métier moves to another OF (the poll
  // swaps ofId under the screen), so a stale piece id is never queried.
  const [ouverte, setOuverte] = useState<number | null>(null)
  useEffect(() => setOuverte(null), [ofId])
  // A bonnetier has no way in from the poste; a deep link or a stale history
  // entry lands back on the poste of the same métier.
  useEffect(() => {
    if (identite && !regleur) navigate(`/metier/${idMachine}`, { replace: true })
  }, [identite, regleur, idMachine, navigate])

  const titre = machine?.label ?? '—'
  const chargement = machinesQ.isLoading || (ofId > 0 && (ofQ.isLoading || histQ.isLoading))

  return (
    <div className="h-full flex flex-col bg-background">
      <PosteHeader titre={titre} onBack={() => navigate(-1)} />

      {chargement && (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      )}

      {!chargement && (!machine || !ofId) && (
        <EtatVide
          titre="Aucun OF en cours"
          detail={machine ? `Le métier ${machine.label} ne tourne sur aucun ordre de fabrication.` : "Ce métier n'existe plus."}
        />
      )}

      {!chargement && ofId > 0 && histQ.isError && (
        <EtatVide titre="Historique indisponible" detail="Impossible de charger l'historique de cet OF." />
      )}

      {of && hist && (
        <>
          {/* Band 2 — the OF the métier resolved to (§5 detail header). */}
          <div className="flex-shrink-0 px-3 pt-3">
            <div className="flex items-center gap-2.5">
              <div className="icon-box-gold h-10 w-10 flex items-center justify-center flex-shrink-0">
                <History className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-heading font-bold tracking-tight leading-none">OF {of.IDordre_fabrication}</h1>
                <p className="text-xs text-muted-foreground truncate mt-1">
                  {of.reference}
                  {of.coloris ? ` · ${of.coloris}` : ''}
                </p>
              </div>
              <span className="text-sm font-medium tabular-nums text-right flex-shrink-0">{progression(of)}</span>
            </div>
            <div className="mt-2 h-px w-24 bg-gradient-to-r from-gold to-transparent" />
          </div>

          <div className="flex-shrink-0 p-2 mt-1 bg-zinc-200/50 border-y border-border">
            <div className="flex gap-1 rounded-lg bg-background p-1">
              <Segment
                label="Production"
                count={hist.pieces.length}
                active={onglet === 'production'}
                onClick={() => setOnglet('production')}
              />
              <Segment
                label="Visitage"
                count={hist.rouleaux.length}
                active={onglet === 'visitage'}
                onClick={() => setOnglet('visitage')}
              />
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-transparent p-3 space-y-2">
            {onglet === 'production' && (
              <>
                {hist.pieces.length === 0 && (
                  <p className="pt-10 text-center text-sm text-muted-foreground italic">Aucune pièce sur cet OF.</p>
                )}
                {hist.pieces.map((p) => (
                  <PieceLigne
                    key={p.IDpiece_production}
                    ofId={ofId}
                    piece={p}
                    ouverte={ouverte === p.IDpiece_production}
                    onToggle={() => setOuverte((o) => (o === p.IDpiece_production ? null : p.IDpiece_production))}
                  />
                ))}
                {hist.pieces.length > 0 && (
                  <p className="pt-1 text-[11px] text-muted-foreground text-center">
                    {hist.duree_mini_min !== null
                      ? `Productivité = ${formatMinutes(hist.duree_mini_min)} (durée mini de la référence sur ce métier) / durée réelle.`
                      : 'Pas de fiche de réglage pour cette référence sur ce métier : aucune productivité calculable.'}
                  </p>
                )}
              </>
            )}

            {onglet === 'visitage' && (
              <>
                {hist.rouleaux.length === 0 && (
                  <p className="pt-10 text-center text-sm text-muted-foreground italic">Aucun rouleau visité sur cet OF.</p>
                )}
                {hist.rouleaux.map((r) => (
                  <RouleauCarte key={r.IDstock_ecru} rouleau={r} />
                ))}
              </>
            )}
            <div style={{ height: 'env(safe-area-inset-bottom)' }} />
          </div>
        </>
      )}
    </div>
  )
}

/** One piece: the row, and under it, once tapped, its events. The row is a
 *  button; the fold is a §31 contained drawer at phone scale — it opens in
 *  place rather than over the list, so the piece above and below stay
 *  readable for comparison. */
function PieceLigne({
  ofId,
  piece,
  ouverte,
  onToggle,
}: {
  ofId: number
  piece: PieceHistorique
  ouverte: boolean
  onToggle: () => void
}) {
  const evQ = useQuery({
    queryKey: ['atelier', 'evenements-piece', ofId, piece.IDpiece_production],
    queryFn: () => fetchEvenementsPiece(ofId, piece.IDpiece_production),
    enabled: ouverte,
  })
  const Chevron = ouverte ? ChevronUp : ChevronDown

  return (
    <Card className={cn('overflow-hidden', ouverte && 'border-accent/50 ring-1 ring-accent/30')}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={ouverte}
        className="w-full text-left p-3 flex items-center gap-3 active:bg-muted transition-colors min-w-0"
      >
        <div className="min-w-0 flex-1">
          <div className="text-base font-heading font-bold tracking-tight tabular-nums">Pièce N° {piece.position}</div>
          {!!piece.observations && (
            <div className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
              <MessageSquareText className="h-3 w-3 flex-shrink-0" />
              {piece.observations}
            </div>
          )}
        </div>
        {piece.terminee ? (
          <>
            <span className="text-sm text-muted-foreground tabular-nums flex items-center gap-1 flex-shrink-0">
              <Clock className="h-3.5 w-3.5" />
              {piece.duree_min !== null ? `${piece.duree_min} min` : '—'}
            </span>
            <span
              className={cn(
                'text-base font-bold tabular-nums w-14 text-right flex-shrink-0',
                piece.pct === null ? 'text-muted-foreground' : piece.alerte ? 'text-destructive' : 'text-success',
              )}
            >
              {piece.pct !== null ? `${piece.pct} %` : '—'}
            </span>
          </>
        ) : (
          <span className="text-xs font-semibold uppercase tracking-wide rounded-full px-2.5 h-7 flex items-center bg-gold/15 text-gold-foreground flex-shrink-0">
            En cours
          </span>
        )}
        <Chevron className="h-5 w-5 text-muted-foreground flex-shrink-0" />
      </button>

      {ouverte && (
        <div className="border-t border-border/60 bg-zinc-100/80 p-2 space-y-1.5">
          {evQ.isLoading && (
            <div className="flex justify-center py-3">
              <Loader2 className="h-5 w-5 animate-spin text-accent" />
            </div>
          )}
          {evQ.isError && <p className="py-2 text-center text-sm text-destructive">Impossible de charger les événements.</p>}
          {evQ.data && evQ.data.length === 0 && (
            <p className="py-2 text-center text-sm text-muted-foreground italic">Aucun événement sur cette pièce.</p>
          )}
          {evQ.data?.map((e) => (
            <div key={e.id} className="flex items-center gap-2.5 rounded-lg bg-card border border-border/60 px-2.5 py-2">
              <BonnetierPhoto id={e.IDbonnetier} nom={e.prenom || e.evenement} size={32} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold truncate">{e.prenom || '—'}</span>
                  <span className="text-[11px] text-muted-foreground tabular-nums flex-shrink-0">{formatQuand(e.date_ms)}</span>
                </div>
                <div className="text-sm text-accent-blue truncate">{e.evenement}</div>
                {!!e.observation && <div className="text-xs text-muted-foreground truncate">{e.observation}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

/** One weighed roll — the legacy's ZR_Visitage row: number and date on the
 *  band, weight and visiteuse in the body, the choice as a mark. */
function RouleauCarte({ rouleau }: { rouleau: RouleauHistorique }) {
  return (
    <Card className="overflow-hidden">
      <div className="px-3 py-1.5 bg-sand border-b border-border flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-accent tabular-nums">{rouleau.numero || `Pièce ${rouleau.num_piece_OF}`}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{formatQuand(rouleau.date_ms)}</span>
      </div>
      <div className="p-3 flex items-center gap-3">
        <div className="text-xl font-heading font-bold tabular-nums flex-shrink-0 w-24">
          {formatKg(rouleau.poids)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Visiteur</div>
          <div className="text-sm font-semibold truncate">{rouleau.visiteur || '—'}</div>
        </div>
        {rouleau.second_choix ? (
          <XCircle className="h-7 w-7 text-destructive flex-shrink-0" aria-label="2ᵉ choix" />
        ) : (
          <CheckCircle2 className="h-7 w-7 text-success flex-shrink-0" aria-label="1er choix" />
        )}
      </div>
      {!!rouleau.observations && (
        <p className="px-3 pb-2.5 -mt-1 text-xs text-muted-foreground whitespace-pre-wrap">{rouleau.observations}</p>
      )}
    </Card>
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

const quand = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'medium' })
function formatQuand(ms: number | null): string {
  return ms === null ? '—' : quand.format(new Date(ms))
}

const kg = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })
function formatKg(v: number): string {
  return `${kg.format(v)} Kg`
}

function formatMinutes(min: number): string {
  return `${Math.round(min)} min`
}

