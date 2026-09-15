// The poste of a métier with NO OF (2026-09-15). Until now the screen was an
// empty state — an icon and « Aucun OF en cours » — which told the régleur who
// tapped an idle tile nothing they could act on. It now answers the question
// they came with: what is planned here next, and what ran here before.
//
// Same band stack as the working poste (§45), minus band 4: there is nothing
// to commit on an idle machine. Band 2 is the standard detail header, band 3
// the waiting OF as a card, and the rest of the height is the history — the
// last twenty finished OFs of the métier, one row each, newest first. Read-
// only, both roles; no legacy window shows this (FEN_Historique is the
// per-piece history of one OF).
import { useQuery } from '@tanstack/react-query'
import { Loader2, AlertCircle, CircleDashed, History, ArrowRightCircle } from 'lucide-react'
import { fetchDerniersOf, type Machine, type DernierOfMetier } from '@/lib/atelier-api'
import { depuis } from '@/lib/depuis'
import { Card } from '@/components/ui/card'

const kg = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

export function MetierAuRepos({ machine }: { machine: Machine }) {
  const prochain = machine.inactif?.prochain_of ?? null

  const histQ = useQuery({
    queryKey: ['atelier', 'machines', machine.IDmachine, 'derniers-of'],
    queryFn: () => fetchDerniersOf(machine.IDmachine),
    // Polled with the app's defaults (lib/rafraichissement.ts): four bounded
    // reads every 10 s while this screen is up, so an OF terminated from the
    // ERP appears here without a reload.
  })

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-transparent">
      {/* Band 2 — what the métier resolved to: nothing running. */}
      <div className="px-3 pt-3">
        <div className="flex items-center gap-2.5">
          <div className="icon-box-gold h-10 w-10 flex items-center justify-center flex-shrink-0">
            <CircleDashed className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-heading font-bold tracking-tight leading-none">
              Aucun OF en cours
            </h1>
            <p className="text-xs text-muted-foreground truncate mt-1">
              Le métier {machine.label} ne tourne sur aucun ordre de fabrication.
            </p>
          </div>
        </div>
        <div className="mt-2 h-px w-24 bg-gradient-to-r from-gold to-transparent" />
      </div>

      <div className="p-3 space-y-2.5">
        {/* Band 3 — the OF waiting at the head of this métier's queue. The
            régleur activates it from the ERP (« Passer en cours ») or it
            activates itself on the previous closing (auto_activation); the
            phone only names it. */}
        {prochain && (
          <Card className="p-3 flex items-center gap-3">
            <span className="flex-shrink-0 h-9 w-9 rounded-full bg-secondary text-primary flex items-center justify-center">
              <ArrowRightCircle className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                À suivre · OF {prochain.IDordre_fabrication}
              </div>
              <div className="text-base font-semibold truncate">
                {prochain.reference}
                {prochain.coloris ? ` · ${prochain.coloris}` : ''}
              </div>
            </div>
            <span className="text-sm tabular-nums text-muted-foreground flex-shrink-0">
              {prochain.finir_fil ? `~${prochain.nb_pieces} (Finir le fil)` : `${prochain.nb_pieces} pièce${prochain.nb_pieces > 1 ? 's' : ''}`}
            </span>
          </Card>
        )}

        {/* The history. One card, one row per OF, dividers between rows: at
            twenty rows a card each would be a wall of borders. */}
        <div>
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
            <History className="h-3.5 w-3.5" />
            Derniers OF sur ce métier
          </div>

          {histQ.isLoading && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-7 w-7 animate-spin text-accent" />
            </div>
          )}

          {histQ.isError && (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
              <AlertCircle className="h-7 w-7 text-destructive" />
              <p className="text-sm">Impossible de charger l'historique.</p>
            </div>
          )}

          {histQ.data && histQ.data.ofs.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground italic">
              Aucun OF terminé sur ce métier.
            </p>
          )}

          {histQ.data && histQ.data.ofs.length > 0 && (
            <Card className="divide-y divide-border/60">
              {histQ.data.ofs.map((of) => (
                <LigneOf key={of.IDordre_fabrication} of={of} />
              ))}
            </Card>
          )}
        </div>
      </div>

      <div style={{ height: 'env(safe-area-inset-bottom)' }} />
    </div>
  )
}

/** One finished OF: number and article on the first line, when it stopped
 *  flush right; pieces and weight on the second, the second-choice share only
 *  when there is one — a zero would be noise on nineteen rows out of twenty. */
function LigneOf({ of }: { of: DernierOfMetier }) {
  return (
    <div className="px-3 py-2.5">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold tabular-nums flex-shrink-0">OF {of.IDordre_fabrication}</span>
        <span className="text-sm truncate min-w-0 flex-1">
          {of.reference}
          {of.coloris ? ` · ${of.coloris}` : ''}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">{depuis(of.fin_ms)}</span>
      </div>
      <div className="text-xs text-muted-foreground tabular-nums mt-0.5">
        {of.produites} / {of.finir_fil ? '~' : ''}{of.nb_pieces} pièce{of.nb_pieces > 1 ? 's' : ''} · {kg.format(of.poids)} kg
        {of.poids_second_choix > 0 && <> · 2ᵉ choix {kg.format(of.poids_second_choix)} kg</>}
      </div>
    </div>
  )
}
