import { useMemo, useState, type ReactNode } from 'react'
import { Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useElementSize } from '@/hooks/useElementSize'
import {
  COULEURS_TIMELINE,
  echelleEquipe,
  fmtDuree,
  fmtHeure,
  fmtHeureSec,
  fmtPct,
  LARGEUR_EVENEMENT_MS,
  rectCible,
  rectMarque,
  TEINTE_TEXT,
  type Echelle,
  type EvenementTimeline,
  type MachineEquipe,
} from '@/lib/trs-equipe'
import { cn } from '@/lib/utils'

// The legacy `TL_Machine` + `ZR_TRS`: one track per métier over the shift
// (marche in green, arrêt as the white rail, piece events as 7-minute navy
// marks under the track, the OF launch in black, the OF end in dark red),
// and the Vitesse / Arrêts / TRS line with its ⓘ on the right.
//
// Hand-drawn SVG, one per track, on a scale measured from the axis cell —
// the whole 8 h fit the width (user decision: no zoom, no scroll). Every
// mark is its own hover / focus target, widened to ≥ 24 px, with the same
// readout on keyboard focus as on hover; the legend above names the series
// so nothing is colour-alone, and the values column + the ⓘ dialog are the
// table twin of the drawing (nothing is readable only by hovering).

const ROW_H = 44
const RAIL_Y = 7
const RAIL_H = 22
const EVT_Y = 32
const EVT_H = 9
const FENETRE_Y = 3
const AXIS_H = 22
const GAP = 2

const COLONNES = '56px minmax(0,1fr) 236px'

interface Survol {
  x: number
  titre: string
  lignes: string[]
}

const LIBELLE_EVENEMENT: Record<EvenementTimeline['type'], string> = {
  nettoyage: 'Nettoyage',
  debut_piece: 'Début du tricotage',
  debut_of: 'Début du tricotage · lancement de l’OF',
  fin_of: 'Fin de l’OF',
}

const COULEUR_EVENEMENT: Record<EvenementTimeline['type'], string> = {
  nettoyage: COULEURS_TIMELINE.evenement,
  debut_piece: COULEURS_TIMELINE.evenement,
  debut_of: COULEURS_TIMELINE.debutOf,
  fin_of: COULEURS_TIMELINE.finOf,
}

function Piste({
  m,
  echelle,
  nowMs,
  enCours,
  dernierRang,
}: {
  m: MachineEquipe
  echelle: Echelle
  nowMs: number
  enCours: boolean
  dernierRang: boolean
}) {
  const [survol, setSurvol] = useState<Survol | null>(null)
  const w = echelle.largeur

  const marques = useMemo(() => {
    const fenetres = m.fenetres.map((f) => ({ ...rectMarque(echelle, f.debutMs, f.finMs), f }))
    const segments = m.segments.map((s) => ({ ...rectMarque(echelle, s.debutMs, s.finMs), s }))
    const evenements = m.evenements.map((e) => ({ ...rectMarque(echelle, e.atMs, e.atMs + LARGEUR_EVENEMENT_MS), e }))
    return { fenetres, segments, evenements }
  }, [m, echelle])

  const cible = (x: number, y: number, h: number, wMark: number, s: Survol, key: string, label: string) => {
    const c = rectCible(echelle, x, wMark)
    return (
      <rect
        key={key}
        x={c.x}
        y={y}
        width={c.w}
        height={h}
        fill="transparent"
        tabIndex={0}
        role="img"
        aria-label={label}
        className="outline-none focus-visible:stroke-gold"
        strokeWidth={2}
        onMouseEnter={() => setSurvol(s)}
        onMouseLeave={() => setSurvol(null)}
        onFocus={() => setSurvol(s)}
        onBlur={() => setSurvol(null)}
      />
    )
  }

  return (
    <div className="relative" style={{ height: ROW_H }}>
      {w > 0 && (
        <svg width={w} height={ROW_H} className="block">
          {/* The rail — white IS the arrêt, as on the legacy timeline. */}
          <rect
            x={0}
            y={RAIL_Y}
            width={w}
            height={RAIL_H}
            fill={m.sansAutomate ? COULEURS_TIMELINE.sansAutomate : COULEURS_TIMELINE.arret}
            stroke={COULEURS_TIMELINE.rail}
            strokeWidth={1}
          />
          {m.sansAutomate && (
            <text x={8} y={RAIL_Y + RAIL_H / 2} dominantBaseline="middle" className="fill-muted-foreground text-[11px]">
              pas d’automate — état machine non enregistré
            </text>
          )}
          {/* Production windows (OF running) — a thin line above the rail. */}
          {marques.fenetres.map(({ x, w: fw }, i) => (
            <rect key={`f${i}`} x={x} y={FENETRE_Y} width={fw} height={2} fill="#64748b" opacity={0.7} />
          ))}
          {/* Marche segments, with a 2 px surface gap between neighbours. */}
          {marques.segments
            .filter(({ s }) => s.etat === 1)
            .map(({ x, w: sw }, i) => (
              <rect
                key={`s${i}`}
                x={x + GAP / 2}
                y={RAIL_Y + 1}
                width={Math.max(1, sw - GAP)}
                height={RAIL_H - 2}
                fill={COULEURS_TIMELINE.marche}
                opacity={0.9}
              />
            ))}
          {/* Piece events under the track. */}
          {marques.evenements.map(({ x, w: ew, e }, i) => (
            <rect key={`e${i}`} x={x} y={EVT_Y} width={ew} height={EVT_H} fill={COULEUR_EVENEMENT[e.type]} rx={1} />
          ))}
          {/* « maintenant » */}
          {enCours && (
            <line
              x1={echelle.x(nowMs)}
              x2={echelle.x(nowMs)}
              y1={0}
              y2={ROW_H}
              stroke={COULEURS_TIMELINE.maintenant}
              strokeWidth={1.5}
            />
          )}

          {/* Hit targets — drawn last so they sit above the paint. */}
          {marques.fenetres.map(({ x, w: fw, f }, i) =>
            cible(
              x, 0, RAIL_Y - 1, fw,
              { x: x + fw / 2, titre: 'OF en production', lignes: [`${fmtHeure(f.debutMs)} – ${fmtHeure(f.finMs)} · ${fmtDuree((f.finMs - f.debutMs) / 1000)}`] },
              `cf${i}`,
              `OF en production de ${fmtHeure(f.debutMs)} à ${fmtHeure(f.finMs)}`,
            ),
          )}
          {marques.segments.map(({ x, w: sw, s }, i) => {
            const d = (s.finMs - s.debutMs) / 1000
            const survolS: Survol =
              s.etat === 1
                ? { x: x + sw / 2, titre: 'En marche', lignes: [`${fmtHeureSec(s.debutMs)} – ${fmtHeureSec(s.finMs)}`, fmtDuree(d)] }
                : { x: x + sw / 2, titre: 'À l’arrêt', lignes: [`${fmtHeureSec(s.debutMs)} – ${fmtHeureSec(s.finMs)}`, fmtDuree(d)] }
            return cible(
              x, RAIL_Y, RAIL_H, sw, survolS, `cs${i}`,
              `${s.etat === 1 ? 'En marche' : 'À l’arrêt'} de ${fmtHeureSec(s.debutMs)} à ${fmtHeureSec(s.finMs)}, ${fmtDuree(d)}`,
            )
          })}
          {marques.evenements.map(({ x, w: ew, e }, i) => {
            const titre = LIBELLE_EVENEMENT[e.type]
            const lignes = [
              e.type === 'fin_of' ? `OF N° ${e.ofId} terminé ${fmtHeure(e.atMs)}` : `${fmtHeure(e.atMs)}${e.prenom ? ` · ${e.prenom}` : ''}`,
            ]
            if (e.type !== 'fin_of' && e.numero !== null) lignes.push(`Pièce n° ${e.numero} · OF ${e.ofId}`)
            return cible(
              x, EVT_Y - 2, ROW_H - EVT_Y + 2, ew,
              { x: x + ew / 2, titre, lignes }, `ce${i}`, `${titre} ${lignes.join(', ')}`,
            )
          })}
        </svg>
      )}

      {survol && w > 0 && (
        <div
          className="pointer-events-none absolute z-20 rounded-md border border-border bg-white px-2.5 py-1.5 text-xs shadow-md whitespace-nowrap"
          style={{
            left: Math.min(Math.max(0, survol.x - 90), Math.max(0, w - 200)),
            ...(dernierRang ? { bottom: ROW_H + 2 } : { top: ROW_H + 2 }),
          }}
        >
          <p className="font-semibold">{survol.titre}</p>
          {survol.lignes.map((l, i) => (
            <p key={i} className={cn('tabular-nums', i > 0 && 'text-muted-foreground')}>{l}</p>
          ))}
        </div>
      )}
    </div>
  )
}

/** One figure of the ZR_TRS line; its caption is the sticky header above the
 *  column, not repeated on every row. */
function Valeur({ value, teinte }: { value: ReactNode; teinte: string | null }) {
  return (
    <p className={cn('min-w-0 text-base font-bold tabular-nums leading-tight whitespace-nowrap', teinte ?? 'text-muted-foreground')}>{value}</p>
  )
}

function Legende({ couleur, children }: { couleur: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="inline-block h-2.5 w-3 rounded-sm border border-border/60" style={{ background: couleur }} />
      {children}
    </span>
  )
}

export function TimelineMetiers({
  machines,
  debutMs,
  finMs,
  nowMs,
  enCours,
  onInfo,
}: {
  machines: MachineEquipe[]
  debutMs: number
  finMs: number
  nowMs: number
  enCours: boolean
  onInfo: (m: MachineEquipe) => void
}) {
  const [axisRef, axis] = useElementSize<HTMLDivElement>()
  const echelle = useMemo(() => echelleEquipe(debutMs, finMs, axis.w), [debutMs, finMs, axis.w])

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-shrink-0 flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 border-b border-border/60 bg-zinc-100/80">
        <Legende couleur={COULEURS_TIMELINE.marche}>Marche</Legende>
        <Legende couleur={COULEURS_TIMELINE.arret}>Arrêt</Legende>
        <Legende couleur="#64748b">OF en production</Legende>
        <Legende couleur={COULEURS_TIMELINE.evenement}>Nettoyage · début de pièce</Legende>
        <Legende couleur={COULEURS_TIMELINE.debutOf}>Lancement d’OF</Legende>
        <Legende couleur={COULEURS_TIMELINE.finOf}>Fin d’OF</Legende>
        {enCours && <Legende couleur={COULEURS_TIMELINE.maintenant}>Maintenant</Legende>}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-transparent">
        <div className="grid" style={{ gridTemplateColumns: COLONNES }}>
          {/* Axis row — sticky */}
          <div className="sticky top-0 z-10 bg-white border-b border-border/60" style={{ height: AXIS_H }} />
          {/* min-w-0 + overflow-hidden: a grid item's min-width is its content by
              default, so a wide SVG would pin the track at its old width forever
              (the ResizeObserver then never sees the cell shrink). */}
          <div ref={axisRef} className="sticky top-0 z-10 bg-white border-b border-border/60 relative min-w-0 overflow-hidden" style={{ height: AXIS_H }}>
            {axis.w > 0 && (
              <svg width={axis.w} height={AXIS_H} className="block">
                {echelle.ticks.map((t, i) => (
                  <g key={t.ms}>
                    <line x1={t.x} x2={t.x} y1={AXIS_H - 6} y2={AXIS_H} className="stroke-border" strokeWidth={1} />
                    <text
                      x={t.x}
                      y={AXIS_H - 9}
                      textAnchor={i === 0 ? 'start' : i === echelle.ticks.length - 1 ? 'end' : 'middle'}
                      className="fill-muted-foreground text-[10px] tabular-nums"
                    >
                      {t.label}
                    </text>
                  </g>
                ))}
              </svg>
            )}
          </div>
          <div
            className="sticky top-0 z-10 bg-white border-b border-border/60 grid grid-cols-[1fr_1fr_1.3fr] gap-1 px-2 items-end pb-0.5"
            style={{ height: AXIS_H }}
          >
            {['Vitesse', 'Arrêts / h', 'TRS'].map((l) => (
              <p key={l} className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none">{l}</p>
            ))}
          </div>

          {machines.map((m, i) => {
            const dernierRang = i >= machines.length - 2 && machines.length > 3
            return (
              <div key={m.id} className="contents">
                <div className="flex items-center justify-center bg-zinc-200/60 border-b border-border/40 text-sm font-semibold" style={{ height: ROW_H }}>
                  {m.emplacement}
                </div>
                <div className="border-b border-border/40 min-w-0 overflow-hidden">
                  <Piste m={m} echelle={echelle} nowMs={nowMs} enCours={enCours} dernierRang={dernierRang} />
                </div>
                <div className="border-b border-border/40 min-w-0 grid grid-cols-[1fr_1fr_1.3fr] gap-1 px-2 items-center" style={{ height: ROW_H }}>
                  <Valeur value={m.of ? m.of.vitesse : '—'} teinte={m.of ? TEINTE_TEXT[m.teintes.vitesse] : null} />
                  <Valeur value={m.sansAutomate ? '—' : m.arretsParHeure} teinte={m.sansAutomate ? null : TEINTE_TEXT[m.teintes.arrets]} />
                  <div className="flex items-center gap-1 min-w-0">
                    <Valeur value={m.sansAutomate ? '—' : fmtPct(m.trs)} teinte={m.teintes.trs ? TEINTE_TEXT[m.teintes.trs] : null} />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 flex-shrink-0 text-muted-foreground hover:text-primary"
                      title={`Détail du calcul — métier ${m.emplacement}`}
                      onClick={() => onInfo(m)}
                    >
                      <Info className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
