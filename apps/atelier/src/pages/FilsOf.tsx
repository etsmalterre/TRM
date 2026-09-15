// Fils OF — legacy FEN_Fils_OF (both builds).
//
// Where the yarn is. For the OF on the métier — and, on two more segments,
// for the OF that ran before it and the one queued after it — one card per
// lot reserved on the OF: the yarn, the lot number, what is left of it, its
// place in the store (the biggest thing on the card: it is what the bonnetier
// walks to), and the supplier. Under the lots, the reference's composition
// with the régleur's note per feed (« boucle », « fond + liage »).
//
// The three segments are the legacy's three buttons. The neighbours are
// computed once, for the OF on the métier, and the screen then re-reads the
// same endpoint with the neighbour's id — exactly what the legacy window does
// with its two prepared queries. The legacy paints the title red when the
// displayed OF is not the one on the machine; here a badge says which one it
// is, because a red title on a screen that also carries red consignes reads
// as an alarm.
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader2, AlertCircle, Cylinder, MapPin, Info } from 'lucide-react'
import { fetchMachines, fetchFilsOf, progression, type FilsOf as FilsOfPayload, type LotFilOf } from '@/lib/atelier-api'
import { PosteHeader } from '@/components/layout/PosteHeader'
import { Segment } from '@/components/atelier/Segment'
import { useIdentite } from '@/contexts/BonnetierContext'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type Vue = 'precedent' | 'en_cours' | 'suivant'

export function FilsOf() {
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

  // The source OF — its neighbours drive the segments.
  const sourceQ = useQuery({
    queryKey: ['atelier', 'fils', ofId],
    queryFn: () => fetchFilsOf(ofId),
    enabled: ofId > 0,
  })
  const source = sourceQ.data

  const [vue, setVue] = useState<Vue>('en_cours')
  // A poll that swaps the OF under the screen (the ERP finished it, the next
  // one is now on the métier) lands back on « OF en cours ».
  useEffect(() => setVue('en_cours'), [ofId])

  const vueId = vue === 'precedent' ? source?.precedent ?? 0 : vue === 'suivant' ? source?.suivant ?? 0 : ofId
  const autreQ = useQuery({
    queryKey: ['atelier', 'fils', vueId],
    queryFn: () => fetchFilsOf(vueId),
    enabled: vue !== 'en_cours' && vueId > 0,
  })
  const affiche: FilsOfPayload | undefined = vue === 'en_cours' ? source : autreQ.data

  const titre = machine?.label ?? '—'
  const chargement = machinesQ.isLoading || (ofId > 0 && sourceQ.isLoading)

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

      {!chargement && ofId > 0 && sourceQ.isError && (
        <EtatVide titre="Fils indisponibles" detail="Impossible de charger les fils de cet OF." />
      )}

      {source && (
        <>
          {/* Band 2 — the OF being shown, which is not always the one on the métier. */}
          <div className="flex-shrink-0 px-3 pt-3">
            <div className="flex items-center gap-2.5">
              <div className="icon-box-gold h-10 w-10 flex items-center justify-center flex-shrink-0">
                <Cylinder className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-heading font-bold tracking-tight leading-none">
                  OF {affiche?.IDordre_fabrication ?? vueId}
                </h1>
                <p className="text-xs text-muted-foreground truncate mt-1">
                  {affiche ? (
                    <>
                      {affiche.reference}
                      {affiche.coloris ? ` · ${affiche.coloris}` : ''}
                    </>
                  ) : (
                    '…'
                  )}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                {vue !== 'en_cours' && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 h-5 flex items-center bg-warning/15 text-warning-foreground">
                    {vue === 'precedent' ? 'OF précédent' : 'OF suivant'}
                  </span>
                )}
                {affiche && <span className="text-sm font-medium tabular-nums text-right">{progression(affiche)}</span>}
              </div>
            </div>
            <div className="mt-2 h-px w-24 bg-gradient-to-r from-gold to-transparent" />
          </div>

          {/* The three buttons of the legacy; a missing neighbour hides its segment. */}
          <div className="flex-shrink-0 p-2 mt-1 bg-zinc-200/50 border-y border-border">
            <div className="flex gap-1 rounded-lg bg-background p-1">
              {source.precedent !== null && (
                <Segment label="Précédent" active={vue === 'precedent'} onClick={() => setVue('precedent')} />
              )}
              <Segment label="En cours" active={vue === 'en_cours'} onClick={() => setVue('en_cours')} />
              {source.suivant !== null && (
                <Segment label="Suivant" active={vue === 'suivant'} onClick={() => setVue('suivant')} />
              )}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-transparent p-3 space-y-2.5">
            {vue !== 'en_cours' && autreQ.isLoading && (
              <div className="flex justify-center pt-6">
                <Loader2 className="h-6 w-6 animate-spin text-accent" />
              </div>
            )}
            {vue !== 'en_cours' && autreQ.isError && (
              <p className="pt-6 text-center text-sm text-destructive">Impossible de charger cet OF.</p>
            )}

            {affiche && (
              <>
                {affiche.lots.length === 0 ? (
                  <p className="pt-6 pb-2 text-center text-sm text-muted-foreground italic">
                    Aucun lot de fil en cours sur cet OF.
                  </p>
                ) : (
                  affiche.lots.map((l) => <LotCarte key={l.IDstock_fil} lot={l} />)
                )}

                {affiche.composition.length > 0 && (
                  <Card className="overflow-hidden">
                    <div className="px-3 py-2 bg-sand border-b border-border">
                      <span className="text-xs font-semibold uppercase tracking-wide text-accent">Composition</span>
                    </div>
                    <ul className="divide-y divide-border/60">
                      {affiche.composition.map((c) => (
                        <li key={c.IDcomposition_ecru} className="px-3 py-2.5">
                          <div className="text-sm font-medium">
                            <span className="tabular-nums font-bold">{c.pourcentage} %</span>
                            <span className="text-muted-foreground"> · </span>
                            {c.fil}
                          </div>
                          {!!c.commentaire && (
                            <div className="mt-0.5 flex items-center gap-1.5 text-sm text-accent-blue italic">
                              <Info className="h-3.5 w-3.5 flex-shrink-0" />
                              {c.commentaire}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
              </>
            )}
            <div style={{ height: 'env(safe-area-inset-bottom)' }} />
          </div>
        </>
      )}
    </div>
  )
}

/** One reserved lot — the legacy's ZR_Fil row: yarn on the band, lot and
 *  stock on the left, the store location as the largest thing on the card
 *  (it is what the bonnetier is looking for), the supplier under it. */
function LotCarte({ lot }: { lot: LotFilOf }) {
  return (
    <Card className="overflow-hidden">
      <div className="px-3 py-2 bg-sand border-b border-border">
        <span className="text-sm font-semibold text-accent">{lot.fil}</span>
      </div>
      <div className="p-3 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm">
            <span className="text-muted-foreground">Lot : </span>
            <span className="font-heading font-bold text-base tabular-nums">{lot.lot || '—'}</span>
          </div>
          <div className="text-sm text-muted-foreground tabular-nums mt-0.5">{formatKg(lot.stock)}</div>
        </div>
        <div className="text-right flex-shrink-0 min-w-0">
          <div className={cn('flex items-center justify-end gap-1 font-heading font-bold text-xl tracking-tight', !lot.emplacement && 'text-muted-foreground')}>
            <MapPin className="h-4 w-4 text-accent flex-shrink-0" />
            <span className="truncate">{lot.emplacement || '—'}</span>
          </div>
          {!!lot.fournisseur && <div className="text-xs text-muted-foreground italic truncate">{lot.fournisseur}</div>}
        </div>
      </div>
      {!!lot.commentaire && (
        <p className="px-3 pb-2.5 -mt-1 text-xs text-muted-foreground whitespace-pre-wrap">{lot.commentaire}</p>
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

const kg = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
function formatKg(v: number): string {
  return `${kg.format(v)} Kg`
}
