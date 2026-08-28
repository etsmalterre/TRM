import type { ComponentType, ReactNode } from 'react'
import { Calculator, Gauge, OctagonPause, Timer, TriangleAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  fmtHeure,
  fmtHeuresMin,
  fmtPct,
  FORFAITS_BRUTS_MIN,
  REGLES,
  TEINTE_CARD,
  type MachineEquipe,
  type Teinte,
} from '@/lib/trs-equipe'
import { cn } from '@/lib/utils'

// The ⓘ of the legacy ZR_TRS line, grown into a banded « bilan » dialog
// (mps_designer §18.D): three verdict tiles, then the calculation line by
// line — the production windows, P, the running time, each deductible
// itemised — so a régleur can check the figure instead of trusting it. No
// footer: nothing to confirm, the ✕, Escape and the overlay close it.
// Every number comes from the payload or from lib/trs-equipe REGLES, which
// the test pins against the API.

function VerdictTile({
  icon: Icon,
  label,
  value,
  detail,
  teinte,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  value: ReactNode
  detail: ReactNode
  teinte: Teinte | null
}) {
  const t = teinte ? TEINTE_CARD[teinte] : null
  return (
    <div className={cn('rounded-lg border-l-4 border border-border/60 bg-card p-3 shadow-sm', t?.edge ?? 'border-l-zinc-300')}>
      <div className="flex items-center gap-2">
        <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0', t?.iconBg ?? 'bg-zinc-100')}>
          <Icon className={cn('h-4 w-4', t?.icon ?? 'text-muted-foreground')} />
        </div>
        <p className="text-sm font-semibold">{label}</p>
      </div>
      <p className={cn('mt-2 text-2xl font-heading font-bold', t?.value ?? 'text-muted-foreground')}>{value}</p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

function Ligne({ label, value, sub, strong }: { label: ReactNode; value: ReactNode; sub?: boolean; strong?: boolean }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3', sub && 'pl-4')}>
      <span className={cn('text-sm', sub ? 'text-xs text-muted-foreground' : 'text-muted-foreground', strong && 'font-semibold text-foreground')}>
        {label}
      </span>
      <span className={cn('text-sm tabular-nums text-right whitespace-nowrap', sub && 'text-xs', strong && 'font-semibold')}>{value}</span>
    </div>
  )
}

export function TrsMetierDialog({
  machine: m,
  open,
  onOpenChange,
}: {
  machine: MachineEquipe | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!m) return null
  const d = m.detail
  const possibleS = m.tempsProdS - m.deductibleS
  const f = REGLES.forfaitsMin
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 border-0 bg-primary overflow-hidden max-h-[90dvh] flex flex-col">
        <div className="flex-shrink-0 flex items-center gap-2.5 border-b-2 border-gold bg-primary px-4 py-2.5 rounded-t-lg">
          <div className="h-8 w-8 flex-shrink-0 rounded-lg flex items-center justify-center shadow-sm bg-gold text-gold-foreground">
            <Gauge className="h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-heading font-bold tracking-tight truncate text-primary-foreground">
              TRS du métier {m.emplacement}
            </h2>
            <p className="text-xs text-white/70 truncate">
              {m.of ? `OF ${m.of.id} · ${[m.of.reference, m.of.coloris].filter(Boolean).join(' ')}` : 'Sans OF'}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white/80 hover:bg-white/15 hover:text-white"
            title="Fermer"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto bg-zinc-100 p-4 space-y-3 scrollbar-transparent rounded-b-lg">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <VerdictTile
              icon={Gauge}
              label="Vitesse"
              value={m.of ? `${m.of.vitesse} tr/min` : '—'}
              detail={`moyenne de l’OF · rouge < ${REGLES.seuils.vitesse.rouge}, ambre < ${REGLES.seuils.vitesse.ambre}`}
              teinte={m.of ? m.teintes.vitesse : null}
            />
            <VerdictTile
              icon={OctagonPause}
              label="Arrêts / h"
              value={m.sansAutomate ? '—' : m.arretsParHeure}
              detail={`${m.arrets} arrêt${m.arrets > 1 ? 's anormaux' : ' anormal'} sur ${fmtHeuresMin(m.tempsProdS)} de production`}
              teinte={m.sansAutomate ? null : m.teintes.arrets}
            />
            <VerdictTile
              icon={Timer}
              label="TRS"
              value={m.sansAutomate ? '—' : fmtPct(m.trs)}
              detail={`rouge ≤ ${Math.round(REGLES.seuils.trs.rouge * 100)} %, ambre ≤ ${Math.round(REGLES.seuils.trs.ambre * 100)} %`}
              teinte={m.teintes.trs}
            />
          </div>

          <div className="rounded-lg border border-border/60 bg-card p-3 shadow-sm space-y-1.5">
            <div className="flex items-center gap-2 mb-1">
              <Calculator className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold">Le calcul</h3>
              <span className="ml-auto text-xs text-muted-foreground">TRS = temps de marche ÷ temps de production possible</span>
            </div>
            <Ligne
              label={m.fenetres.length > 1 ? 'Fenêtres de production (OF en cours)' : 'Fenêtre de production (OF en cours)'}
              value={m.fenetres.length === 0 ? '—' : m.fenetres.map((w) => `${fmtHeure(w.debutMs)} → ${fmtHeure(w.finMs)}`).join(' · ')}
            />
            <Ligne label="Temps de production" value={fmtHeuresMin(m.tempsProdS)} strong />
            <Ligne label="Temps de marche réel" value={fmtHeuresMin(m.tempsMarcheS)} strong />
            <Ligne label="Déductibles" value={`− ${fmtHeuresMin(m.deductibleS)}`} strong />
            <Ligne
              sub
              label={`${d.arretsDeduits} arrêt${d.arretsDeduits > 1 ? 's' : ''} machine × ≤ ${REGLES.interventionMaxMin} min d’intervention`}
              value={fmtHeuresMin(d.arretsDeduitsS)}
            />
            <Ligne
              sub
              label={`${d.nettoyages} nettoyage${d.nettoyages > 1 ? 's' : ''} × ${d.lycra ? f.nettoyage.lycra : f.nettoyage.sans} min${d.lycra ? ' (lycra)' : ''}`}
              value={fmtHeuresMin(d.nettoyagesS)}
            />
            <Ligne
              sub
              label={`${d.finsPiece} fin${d.finsPiece > 1 ? 's' : ''} de pièce × ${d.lycra ? f.finPiece.lycra : f.finPiece.sans} min${d.lycra ? ' (lycra)' : ''}`}
              value={fmtHeuresMin(d.finsPieceS)}
            />
            <Ligne label="Temps de production possible" value={fmtHeuresMin(Math.max(0, possibleS))} strong />
            <div className="border-t border-border/60 pt-1.5">
              <Ligne
                label="TRS"
                value={
                  possibleS > 0
                    ? `${fmtHeuresMin(m.tempsMarcheS)} ÷ ${fmtHeuresMin(possibleS)} = ${fmtPct(m.trs)}`
                    : '— (aucun temps de production possible)'
                }
                strong
              />
              <Ligne
                label="Arrêts anormaux"
                value={`${d.arretsDeduits} arrêts − ${d.evenementsPiece} événement${d.evenementsPiece > 1 ? 's' : ''} pièce = ${m.arrets}`}
              />
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-card p-3 shadow-sm text-xs text-muted-foreground space-y-1.5">
            <p className="flex items-start gap-2">
              <TriangleAlert className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-amber-600" />
              <span>
                Un OF laissé « en cours » après sa dernière pièce compte comme du temps de production à l’arrêt : il fait
                baisser le TRS. Terminer l’OF depuis le téléphone dès la dernière pièce.
              </span>
            </p>
            <p>
              Ce que vit le bonnetier : un nettoyage vaut {FORFAITS_BRUTS_MIN.nettoyage.sans} min ({FORFAITS_BRUTS_MIN.nettoyage.lycra} avec
              lycra), une fin de pièce {FORFAITS_BRUTS_MIN.finPiece.sans} min ({FORFAITS_BRUTS_MIN.finPiece.lycra} avec lycra), minute
              d’intervention comprise. Le TRS peut dépasser 100 % quand ces forfaits dépassent l’arrêt réel.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
