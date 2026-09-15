// The poste of a métier with NO OF (2026-09-15). Until now the screen was an
// empty state — an icon and « Aucun OF en cours » — which told the régleur who
// tapped an idle tile nothing they could act on. It now answers the question
// they came with: what is planned here next, and what ran here before.
//
// Same band stack as the working poste (§45), minus band 4: there is nothing
// to commit on an idle machine. Band 2 is the standard detail header; the
// rest is two sectioned cards in the réglage sheet's own grammar (sand
// Entete, rows divided by hairlines): « À suivre » — the head of the queue —
// and the last twenty finished OFs of the métier, newest first. Each row
// reads like a métier tile: the OF number big on the left, the article on
// top, the figures as pills underneath. Read-only, both roles; no legacy
// window shows this (FEN_Historique is the per-piece history of one OF).
import { useQuery } from '@tanstack/react-query'
import { Loader2, AlertCircle, Scale } from 'lucide-react'
import { TmRollIcon } from '@/components/icons/TmRollIcon'
import { fetchDerniersOf, type Machine, type DernierOfMetier } from '@/lib/atelier-api'
import { depuis } from '@/lib/depuis'
import { Card } from '@/components/ui/card'
import { Entete } from '@/components/atelier/Entete'
import { Pastille } from '@/components/atelier/Pastille'

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
        {/* The OF waiting at the head of this métier's queue. The régleur
            activates it from the ERP (« Passer en cours ») or it activates
            itself on the previous closing (auto_activation); the phone only
            names it. */}
        {prochain && (
          <Card className="overflow-hidden">
            <Entete>À suivre</Entete>
            <RangeeOf
              numero={prochain.IDordre_fabrication}
              article={article(prochain)}
              pastilles={
                <Pastille accent>
                  <TmRollIcon className="h-3.5 w-3.5" />
                  {prochain.finir_fil ? `~${prochain.nb_pieces} · Finir le fil` : pieces(prochain.nb_pieces)}
                </Pastille>
              }
            />
          </Card>
        )}

        {/* The history. One card, one row per OF, hairlines between rows: at
            twenty rows a card each would be a wall of borders. */}
        <Card className="overflow-hidden">
          <Entete>Derniers OF sur ce métier</Entete>

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
            <p className="px-3 py-2.5 text-sm text-muted-foreground italic">Aucun OF terminé sur ce métier.</p>
          )}

          {histQ.data && histQ.data.ofs.length > 0 && (
            <ul className="divide-y divide-border/60">
              {histQ.data.ofs.map((of) => (
                <li key={of.IDordre_fabrication}>
                  <RangeeOf
                    numero={of.IDordre_fabrication}
                    article={article(of)}
                    quand={depuis(of.fin_ms)}
                    pastilles={<Figures of={of} />}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div style={{ height: 'env(safe-area-inset-bottom)' }} />
    </div>
  )
}

function article(of: { reference: string; coloris: string }): string {
  return of.coloris ? `${of.reference} · ${of.coloris}` : of.reference
}

function pieces(nb: number): string {
  return `${nb} pièce${nb > 1 ? 's' : ''}`
}

/** One OF as a row: the number big on the left like a métier code, the
 *  article on the first line with « when » flush right, the pills under it.
 *  The same three slots as the picker's tiles, one size down. */
function RangeeOf({
  numero,
  article,
  quand,
  pastilles,
}: {
  numero: number
  article: string
  quand?: string
  pastilles: React.ReactNode
}) {
  return (
    <div className="px-3 py-2.5 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5">
      <span className="row-span-2 w-14 text-xl font-heading font-bold tracking-tight tabular-nums leading-none">
        {numero}
      </span>
      <span className="min-w-0 flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium truncate">{article}</span>
        {quand && <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">{quand}</span>}
      </span>
      <span className="flex flex-wrap gap-1.5 min-w-0">{pastilles}</span>
    </div>
  )
}

/** Pieces done over ordered, the weight visited, and the second-choice share
 *  only when there is one — a zero would be noise on nineteen rows out of
 *  twenty. Amber, as every warning pill of the app. */
function Figures({ of }: { of: DernierOfMetier }) {
  return (
    <>
      <Pastille>
        <TmRollIcon className="h-3.5 w-3.5" />
        {of.produites} / {of.finir_fil ? '~' : ''}{of.nb_pieces}
      </Pastille>
      <Pastille>
        <Scale className="h-3 w-3" />
        {kg.format(of.poids)} kg
      </Pastille>
      {of.poids_second_choix > 0 && (
        <Pastille teinte="ambre" title="Poids de 2ᵉ choix sur cet OF">
          2ᵉ choix {kg.format(of.poids_second_choix)} kg
        </Pastille>
      )}
    </>
  )
}
