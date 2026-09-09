// The métier picker — legacy FEN_Choix_Metier.
//
// Two lists behind one switch, exactly as the legacy has it: the métiers that
// still owe pieces ("Actives") and everything else. The bonnetier arrives here
// knowing which machine they are standing at, so this screen's only job is to
// let them hit the right tile without looking twice.
//
// Tiles are deliberately NOT colour-coded by consigne. §41 says a colour is
// only worth spending when it discriminates, and 7 of the 9 running OFs on the
// live base carry a consigne — a liseré here would paint almost every active
// tile red and teach the operator to ignore it. The consigne gets its full red
// callout one screen later (§46), where it is actually actionable.
//
// The RÉGLEUR sees the same screen with the régleur build's extras (legacy
// configuration Appli_Regleur, `Android\gen\Compile`):
//  - a state glyph on every active tile — réglage (the OF has not started),
//    pause (interrupted) or marche;
//  - the alert of `bAlert = pctDefaut > 2 % ou nFreqArret > 1`, which IS the
//    §41 attention state this list is allowed to spend red on: it is rare by
//    construction, and it names the métier the régleur should walk to next;
//  - « Inactives » = métiers with NO active OF (the bonnetier build also lists
//    the finished-but-still-active ones there);
//  - tapping a métier whose OF has not started opens the réglage sheet, not
//    the poste — the legacy's own routing, eligibility check included.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader2, AlertCircle, ChevronRight, Wrench, Pause, Play } from 'lucide-react'
import { fetchMachines, progression, type Machine } from '@/lib/atelier-api'
import { PosteHeader } from '@/components/layout/PosteHeader'
import { Segment } from '@/components/atelier/Segment'
import { useIdentite } from '@/contexts/BonnetierContext'
import { cn } from '@/lib/utils'

export function ChoixMetier() {
  const navigate = useNavigate()
  const { identite } = useIdentite()
  const regleur = identite?.regleur ?? false
  const [voirActives, setVoirActives] = useState(true)

  const { data, isLoading, isError } = useQuery({
    // The role is part of the key: the régleur list carries extra fields the
    // bonnetier list does not, and the poste reads the same cache entry.
    queryKey: ['atelier', 'machines', regleur],
    queryFn: () => fetchMachines(regleur),
    // The floor changes under the operator's feet — an OF gets terminé, the
    // next one activates. Short and refetched on focus, so coming back to the
    // list after a commit shows the truth.
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })

  const { actives, inactives } = useMemo(() => {
    const all = data ?? []
    return {
      actives: all.filter((m) => m.actif),
      inactives: regleur ? all.filter((m) => !m.of) : all.filter((m) => !m.actif),
    }
  }, [data, regleur])

  const liste = voirActives ? actives : inactives

  function ouvrir(m: Machine) {
    // Legacy (Appli_Regleur): « si pas DateValide(demarrage_prod) alors
    // OuvreFenêtreMobile(FEN_Reglage_Machine) » — after the eligibility check,
    // which the réglage screen itself renders here.
    if (regleur && m.of && !m.of.demarre) navigate(`/metier/${m.IDmachine}/reglage`)
    else navigate(`/metier/${m.IDmachine}`)
  }

  return (
    <div className="h-full flex flex-col bg-background">
      <PosteHeader titre="Métiers" />

      {/* The switch between the two lists. Not a §29.3 pill: that pattern is
          for a mode that changes what a commit writes, and this only chooses
          which rows are shown. A two-segment control with its counts is the
          honest shape, styled like the ERP's submenu tabs (§3). */}
      <div className="flex-shrink-0 p-2 bg-zinc-200/50 border-b border-border">
        <div className="flex gap-1 rounded-lg bg-background p-1">
          <Segment
            label="Actives"
            count={actives.length}
            active={voirActives}
            onClick={() => setVoirActives(true)}
          />
          <Segment
            label="Inactives"
            count={inactives.length}
            active={!voirActives}
            onClick={() => setVoirActives(false)}
          />
        </div>
      </div>

      <main className="flex-1 min-h-0 overflow-y-auto scrollbar-transparent p-3 space-y-2.5">
        {isLoading && (
          <div className="flex justify-center pt-10">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center gap-2 pt-10 text-center text-muted-foreground">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm">Impossible de charger les métiers.</p>
          </div>
        )}

        {data && liste.length === 0 && (
          <p className="pt-10 text-center text-sm text-muted-foreground italic">
            {voirActives ? 'Aucun métier en production.' : 'Tous les métiers tournent.'}
          </p>
        )}

        {liste.map((m) => (
          <MetierTile key={m.IDmachine} m={m} onOpen={() => ouvrir(m)} />
        ))}

        {/* The safe-area inset as trailing padding, so the last tile clears the
            gesture bar instead of sitting under it. */}
        <div style={{ height: 'env(safe-area-inset-bottom)' }} />
      </main>
    </div>
  )
}

/** The three legacy tile icons (reglage1 / pause1 / play1), as glyphs. */
const ETATS = {
  reglage: { Icon: Wrench, titre: 'En réglage — OF non lancé', classe: 'text-warning' },
  pause: { Icon: Pause, titre: 'OF interrompu', classe: 'text-primary' },
  marche: { Icon: Play, titre: 'En marche', classe: 'text-success' },
} as const

const pct = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 })

function MetierTile({ m, onOpen }: { m: Machine; onOpen: () => void }) {
  const of = m.of
  const r = m.regleur
  const alerte = !!r?.alerte
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'w-full text-left rounded-xl border bg-card shadow-sm p-3.5',
        'flex items-center gap-3 active:bg-muted transition-colors',
        of ? 'border-border' : 'border-border/60',
        // §41: the frame colour is reserved for "needs my attention now" —
        // and on the régleur list that is exactly what the legacy alert means.
        alerte && 'border-destructive/50 bg-destructive/5',
      )}
    >
      {/* The métier code is the biggest thing on the tile: it is what the
          bonnetier matches against the machine in front of them. */}
      <span
        className={cn(
          'text-4xl font-heading font-bold tracking-tight tabular-nums w-[4.5rem] flex-shrink-0',
          of ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {m.label}
      </span>

      <span className="flex-1 min-w-0">
        {of ? (
          <>
            <span className="block text-sm font-medium truncate">
              {of.reference}
              {of.coloris ? <span className="text-muted-foreground"> · {of.coloris}</span> : null}
            </span>
            <span className="block text-xs text-muted-foreground mt-0.5 tabular-nums">
              OF {of.IDordre_fabrication} · {progression(of)}
            </span>
            {r && (alerte || r.freq_arret > 0) && (
              <span className="flex flex-wrap gap-1.5 mt-1.5">
                {alerte && r.pct_defaut > 0 && (
                  <Pastille rouge>{pct.format(r.pct_defaut)} de 2nd choix</Pastille>
                )}
                {r.freq_arret > 0 && (
                  <Pastille rouge={alerte && r.freq_arret > 1}>
                    {r.freq_arret} arrêt{r.freq_arret > 1 ? 's' : ''}/h
                  </Pastille>
                )}
              </span>
            )}
          </>
        ) : (
          <span className="block text-sm text-muted-foreground italic">Aucun OF en cours</span>
        )}
      </span>

      {r && (
        <EtatGlyphe etat={r.etat} />
      )}
      <ChevronRight className="h-6 w-6 text-muted-foreground flex-shrink-0" />
    </button>
  )
}

function EtatGlyphe({ etat }: { etat: keyof typeof ETATS }) {
  const { Icon, titre, classe } = ETATS[etat]
  return (
    <span title={titre} className={cn('flex-shrink-0 flex items-center justify-center h-9 w-9 rounded-full bg-secondary', classe)}>
      <Icon className="h-5 w-5" />
    </span>
  )
}

/** A régleur figure on the tile: red when it is the reason for the alert,
 *  plain otherwise (the legacy shows the stop frequency on every tile). */
function Pastille({ rouge, children }: { rouge?: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 h-6 text-xs font-medium tabular-nums border',
        rouge
          ? 'bg-destructive/10 text-destructive border-destructive/30'
          : 'bg-secondary text-muted-foreground border-border/60',
      )}
    >
      {children}
    </span>
  )
}
