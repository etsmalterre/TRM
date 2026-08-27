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
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader2, AlertCircle, ChevronRight } from 'lucide-react'
import { fetchMachines, progression, type Machine } from '@/lib/atelier-api'
import { PosteHeader } from '@/components/layout/PosteHeader'
import { cn } from '@/lib/utils'

export function ChoixMetier() {
  const navigate = useNavigate()
  const [voirActives, setVoirActives] = useState(true)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['atelier', 'machines'],
    queryFn: fetchMachines,
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
      inactives: all.filter((m) => !m.actif),
    }
  }, [data])

  const liste = voirActives ? actives : inactives

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
          <MetierTile key={m.IDmachine} m={m} onOpen={() => navigate(`/metier/${m.IDmachine}`)} />
        ))}

        {/* The safe-area inset as trailing padding, so the last tile clears the
            gesture bar instead of sitting under it. */}
        <div style={{ height: 'env(safe-area-inset-bottom)' }} />
      </main>
    </div>
  )
}

function Segment({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex-1 h-11 rounded-md text-base font-medium transition-colors',
        active
          ? 'bg-accent text-accent-foreground shadow-sm'
          : 'text-muted-foreground active:bg-accent/10',
      )}
    >
      {label}
      <span className={cn('ml-1.5 text-sm tabular-nums', active ? 'text-accent-foreground/70' : 'text-muted-foreground/70')}>
        {count}
      </span>
    </button>
  )
}

function MetierTile({ m, onOpen }: { m: Machine; onOpen: () => void }) {
  const of = m.of
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'w-full text-left rounded-xl border bg-card shadow-sm p-3.5',
        'flex items-center gap-3 active:bg-muted transition-colors',
        of ? 'border-border' : 'border-border/60',
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
          </>
        ) : (
          <span className="block text-sm text-muted-foreground italic">Aucun OF en cours</span>
        )}
      </span>

      <ChevronRight className="h-6 w-6 text-muted-foreground flex-shrink-0" />
    </button>
  )
}
