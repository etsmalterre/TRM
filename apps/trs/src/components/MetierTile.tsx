// One métier on the floor plan.
//
// The legacy tile (Appli_TRS, photo of 2026-08-28): the code on top, then
// three stacked pills — RPM while running or « Depuis » in red while stopped,
// TRS, Arrêts — and a métier without an OF shows its code only. Same
// information architecture here; the look is the Malterre charter (navy /
// gold / warm neutrals) instead of the legacy's blue-on-yellow, per the same
// decision that restyled the atelier PWA.
//
// Colour is status colour (dataviz): good / warning / critical, and every
// pill carries its word, so nothing is colour-alone. The frame itself takes
// the §41 liseré for the machine state — green running, red stopped — and
// stays neutral otherwise; a métier without an OF is a muted, dashed slot.
import { cn } from '@/lib/utils'
import type { TrsMachine } from '@/lib/trs-api'
import {
  teinteArrets,
  teinteDepuis,
  teinteTrs,
  teinteVitesse,
  fmtDuree,
  fmtPct,
  type Teinte,
} from '@/lib/affichage'

const PILL: Record<Teinte, string> = {
  vert: 'bg-emerald-500/15 text-emerald-900 border-emerald-500/30',
  ambre: 'bg-amber-500/15 text-amber-900 border-amber-500/30',
  rouge: 'bg-red-500/15 text-red-900 border-red-500/30',
}
/** The stop pill is solid: a stopped métier in production is THE attention
 *  state of this screen, and the legacy painted it solid red too. */
const PILL_PLEIN: Record<Teinte, string> = {
  vert: 'bg-emerald-600 text-white border-emerald-700',
  ambre: 'bg-amber-500 text-white border-amber-600',
  rouge: 'bg-destructive text-white border-red-700',
}

const LISERE: Record<'marche' | 'arret' | 'inconnu', string> = {
  marche: 'shadow-[inset_4px_0_0_0_rgb(16_185_129)]',
  arret: 'shadow-[inset_4px_0_0_0_rgb(239_68_68)]',
  inconnu: 'shadow-[inset_4px_0_0_0_rgb(161_161_170)]',
}

function Pill({ valeur, label, teinte, plein }: { valeur: string; label: string; teinte: Teinte; plein?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-lg border px-1 py-0.5 text-center leading-tight',
        plein ? PILL_PLEIN[teinte] : PILL[teinte],
      )}
    >
      <div className="text-lg font-semibold whitespace-nowrap">{valeur}</div>
      <div className={cn('text-[10px] uppercase tracking-wide', plein ? 'text-white/80' : 'opacity-70')}>
        {label}
      </div>
    </div>
  )
}

export function MetierTile({ machine, nowMs }: { machine: TrsMachine; nowMs: number }) {
  const { emplacement, etat, enProduction, of } = machine
  const marche = etat === 1
  const depuisMs = machine.depuisMs === null ? null : Math.max(0, nowMs - machine.depuisMs)

  if (!enProduction) {
    return (
      <div className="h-full rounded-xl border border-dashed border-border bg-muted/40 p-2 flex flex-col text-muted-foreground">
        <div className="text-2xl font-heading font-bold tracking-tight leading-none">{emplacement}</div>
        <div className="mt-auto text-[11px] leading-tight">
          {of ? 'OF non démarré' : 'Sans OF'}
          {marche && (
            <span className="block text-[10px] opacity-80">
              tourne · {machine.vitesse} tr/min
            </span>
          )}
        </div>
      </div>
    )
  }

  const frame = etat === null ? 'inconnu' : marche ? 'marche' : 'arret'
  return (
    <div
      className={cn(
        'h-full rounded-xl border border-border bg-card p-2 pl-3 flex flex-col gap-1.5 overflow-hidden',
        LISERE[frame],
      )}
    >
      <div className="flex-shrink-0 flex items-baseline justify-between gap-1">
        <div className="text-2xl font-heading font-bold tracking-tight leading-none">{emplacement}</div>
        <span
          className={cn(
            'text-[10px] font-medium uppercase tracking-wide',
            marche ? 'text-emerald-700' : etat === null ? 'text-muted-foreground' : 'text-red-700',
          )}
        >
          {marche ? 'marche' : etat === null ? '?' : 'arrêt'}
        </span>
      </div>
      {of && (
        <div className="flex-shrink-0 text-[11px] text-muted-foreground leading-tight truncate" title={`OF ${of.id}`}>
          {of.reference}
          {of.coloris ? ` · ${of.coloris}` : ''}
        </div>
      )}

      <div className="mt-auto flex-shrink-0 flex flex-col gap-1">
        {marche ? (
          <Pill
            valeur={String(machine.vitesse)}
            label="tr/min"
            teinte={teinteVitesse(machine.vitesse, of?.vitesseCible ?? 0)}
          />
        ) : (
          <Pill
            valeur={depuisMs === null ? '—' : fmtDuree(depuisMs)}
            label="depuis"
            teinte={depuisMs === null ? 'ambre' : teinteDepuis(depuisMs)}
            plein
          />
        )}
        <Pill
          valeur={fmtPct(machine.trs)}
          label="TRS"
          teinte={machine.trs === null ? 'ambre' : teinteTrs(machine.trs)}
        />
        <Pill valeur={String(machine.arrets)} label="arrêts" teinte={teinteArrets(machine.arrets)} />
      </div>
    </div>
  )
}

/** A place on the floor with no métier in it (1B). */
export function EmplacementVide({ code }: { code: string }) {
  return (
    <div className="h-full rounded-xl border border-dashed border-border/60 p-2 text-muted-foreground/50">
      <div className="text-2xl font-heading font-bold tracking-tight leading-none">{code}</div>
    </div>
  )
}
