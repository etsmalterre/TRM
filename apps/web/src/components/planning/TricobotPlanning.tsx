// Tricobot « Faire le planning » on Atelier › Planning (LIVA #1296).
//
// The agent « Planning atelier » (MPS API lib/agents/planning-atelier/) never
// runs on its own: Isa asks for an empty week here, with her instructions of
// the moment, Tricobot writes the week into the grid, she corrects in place and
// closes it with « Valider le planning ». What she changed (computed by the
// API) and her why is Tricobot's retour; a week never validated counts as a
// réussite.
//
// Three pieces: the toolbar button, the dialog asking for instructions, and the
// band above the grid (Tricobot's explanation until validated, then a one-line
// verdict).

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TricobotMascot } from '@/components/icons/TricobotMascot'

// ── Types (mirror ETM/apps/api/src/routes/planning-atelier.ts « Tricobot ») ──

type EquipeCode = 'M' | 'A' | 'N'

export interface TricobotRun {
  id: string
  createdAt: string
  lancePar: string | null
  instructions: string
  explication: string
  attention: string[]
  nbCreneaux: number
  equipes: Array<{ equipe: EquipeCode; prenoms: string[] }>
  evaluation: { note: 'reussite' | 'echec'; commentaire: string; par: string; le: string } | null
  /** What changed since Tricobot wrote the week (empty = kept as is). */
  ecarts: string[]
}

export interface TricobotSemaine {
  mode: 'off' | 'essai' | 'actif'
  derniereInstruction: string
  run: TricobotRun | null
}

const EQUIPE_LABEL: Record<EquipeCode, string> = { M: 'Matin', A: 'Après-midi', N: 'Nuit' }

export const tricobotKey = (semaine: string) => ['atelier-tricobot', semaine]

export function useTricobotSemaine(semaine: string) {
  return useQuery<TricobotSemaine>({
    queryKey: tricobotKey(semaine),
    queryFn: () => apiFetch(`/planning-atelier/tricobot?semaine=${semaine}`),
  })
}

function messageDe(e: unknown): string {
  const body = (e as { body?: { message?: string } })?.body
  return body?.message ?? (e instanceof Error ? e.message : 'Erreur')
}

function fmtDateHeure(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** Tricobot speaks for himself — mascot + bubble (same as SousTraitantsPoint's TricobotBulle). */
function TricobotBulle({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="flex items-end gap-3">
      <TricobotMascot className="h-14 w-14 -mb-1 flex-shrink-0" />
      <div className="relative min-w-0 flex-1 rounded-xl rounded-bl-none border border-accent/30 bg-accent/10 px-3 py-2">
        <p className="text-sm font-semibold">{titre}</p>
        <div className="text-sm text-foreground/80">{children}</div>
      </div>
    </div>
  )
}

// ── Toolbar button ───────────────────────────────────────

export function FairePlanningBouton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" className="h-9 pl-1.5" onClick={onClick} title="Demander à Tricobot de préparer cette semaine">
      <TricobotMascot className="h-6 w-6 mr-1" />
      Faire le planning
    </Button>
  )
}

// ── « Faire le planning » dialog ─────────────────────────

export function FairePlanningDialog({
  open,
  semaine,
  numeroSemaine,
  derniereInstruction,
  nbDesiderata,
  onClose,
  onDone,
}: {
  open: boolean
  /** The grid week's Sunday. */
  semaine: string
  numeroSemaine: number
  derniereInstruction: string
  nbDesiderata: number
  onClose: () => void
  onDone: () => void
}) {
  const [instructions, setInstructions] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Prefilled with the last instructions: what stays true carries over.
  useEffect(() => {
    if (open) {
      setInstructions(derniereInstruction)
      setError(null)
    }
  }, [open, derniereInstruction])

  const lancer = useMutation({
    mutationFn: () =>
      apiFetch<TricobotRun>('/planning-atelier/tricobot', {
        method: 'POST',
        body: JSON.stringify({ semaine, instructions: instructions.trim() }),
      }),
    onSuccess: onDone,
    onError: (e) => setError(messageDe(e)),
  })

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !lancer.isPending) onClose() }}>
      <DialogContent className="max-w-lg" onClose={() => { if (!lancer.isPending) onClose() }}>
        <DialogHeader>
          <DialogTitle>Faire le planning — semaine {numeroSemaine}</DialogTitle>
        </DialogHeader>
        <div className="mt-4 space-y-3">
          <TricobotBulle titre="Je prépare la semaine ?">
            Je continue le roulement des dernières semaines
            {nbDesiderata > 0
              ? ` et je tiens compte des ${nbDesiderata} desiderata de la semaine`
              : ' (aucun desiderata cette semaine)'}
            . Dis-moi ce qui change : je ne devine pas une équipe de nuit ni un passage en 8 h.
          </TricobotBulle>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Consignes pour cette semaine</label>
            <textarea
              rows={4}
              autoFocus
              maxLength={2000}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              disabled={lancer.isPending}
              placeholder="Ex. : on remet une équipe de nuit, journées de 8 h ; Olivier en congés."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            />
            <p className="text-[11px] text-muted-foreground">Vide : il continue comme les semaines précédentes.</p>
          </div>
          {error && (
            <p className="text-sm text-destructive flex items-start gap-1.5">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              {error}
            </p>
          )}
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={lancer.isPending}>
            Annuler
          </Button>
          <Button onClick={() => lancer.mutate()} disabled={lancer.isPending}>
            {lancer.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {lancer.isPending ? 'Tricobot prépare la semaine…' : 'Faire le planning'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Band above the grid ──────────────────────────────────

export function TricobotBandeau({ semaine, run }: { semaine: string; run: TricobotRun }) {
  const queryClient = useQueryClient()
  const [validerOpen, setValiderOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valider = useMutation({
    mutationFn: (commentaire: string) =>
      apiFetch<TricobotRun>(`/planning-atelier/tricobot/${run.id}/valider`, {
        method: 'POST',
        body: JSON.stringify({ commentaire }),
      }),
    onSuccess: () => {
      setValiderOpen(false)
      setError(null)
      queryClient.invalidateQueries({ queryKey: tricobotKey(semaine) })
    },
    onError: (e) => setError(messageDe(e)),
  })

  const auteur = `Préparé par Tricobot le ${fmtDateHeure(run.createdAt)}${run.lancePar ? ` à la demande de ${run.lancePar}` : ''}`

  // Validated: one line, the verdict.
  if (run.evaluation) {
    const corrige = run.evaluation.note === 'echec'
    return (
      <div
        className={cn(
          'flex-shrink-0 rounded-md border px-2.5 py-1.5 text-xs flex items-start gap-1.5',
          corrige ? 'border-destructive/30 bg-destructive/5' : 'border-emerald-500/30 bg-emerald-500/5',
        )}
      >
        <TricobotMascot className="h-4 w-4 mt-px" />
        <span className="min-w-0 flex-1">
          {corrige ? (
            <>
              <span className="font-semibold text-destructive">Tricobot corrigé</span>
              {run.evaluation.commentaire && <span className="text-foreground"> — {run.evaluation.commentaire}</span>}
            </>
          ) : (
            <span className="font-semibold text-emerald-700">Planning de Tricobot validé tel quel</span>
          )}
          <span className="text-muted-foreground"> · {run.evaluation.par}, le {fmtDateHeure(run.evaluation.le)}</span>
        </span>
        {run.ecarts.length > 0 && !corrige && (
          // Changed after a « tel quel » validation: offer to validate again.
          <button type="button" className="flex-shrink-0 text-accent hover:underline" onClick={() => setValiderOpen(true)}>
            Modifié depuis — revalider
          </button>
        )}
        <ValiderPlanningDialog
          open={validerOpen}
          ecarts={run.ecarts}
          isPending={valider.isPending}
          error={error}
          onClose={() => setValiderOpen(false)}
          onConfirm={(c) => valider.mutate(c)}
        />
      </div>
    )
  }

  return (
    <div className="flex-shrink-0 rounded-lg border border-accent/30 bg-accent/[0.06] p-3 flex items-start gap-3">
      <TricobotMascot className="h-12 w-12 flex-shrink-0" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className="text-sm font-semibold">Planning préparé par Tricobot</p>
          <p className="text-[11px] text-muted-foreground">{auteur}</p>
        </div>
        {run.equipes.length > 0 && (
          <p className="text-xs">
            {run.equipes.map((g, i) => (
              <span key={g.equipe}>
                {i > 0 && <span className="text-muted-foreground"> · </span>}
                <span className="font-medium">{EQUIPE_LABEL[g.equipe]}</span> : {g.prenoms.join(', ')}
              </span>
            ))}
          </p>
        )}
        {run.explication && <p className="text-sm text-foreground/80">{run.explication}</p>}
        {run.attention.length > 0 && (
          <ul className="space-y-0.5">
            {run.attention.map((a) => (
              <li key={a} className="text-xs text-amber-800 flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-px" />
                {a}
              </li>
            ))}
          </ul>
        )}
        {run.instructions && (
          <p className="text-[11px] text-muted-foreground">Consignes données : « {run.instructions} »</p>
        )}
      </div>
      <div className="flex-shrink-0 flex flex-col items-end gap-1">
        <Button
          size="sm"
          disabled={valider.isPending}
          onClick={() => {
            setError(null)
            // Kept as is: validate at once. Changed: ask why first.
            if (run.ecarts.length === 0) valider.mutate('')
            else setValiderOpen(true)
          }}
        >
          {valider.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
          Valider le planning
        </Button>
        <p className="text-[11px] text-muted-foreground">
          {run.ecarts.length === 0
            ? 'Aucune modification pour l’instant'
            : `${run.ecarts.length} créneau${run.ecarts.length > 1 ? 'x' : ''} modifié${run.ecarts.length > 1 ? 's' : ''}`}
        </p>
        {error && !validerOpen && <p className="text-[11px] text-destructive max-w-56 text-right">{error}</p>}
      </div>
      <ValiderPlanningDialog
        open={validerOpen}
        ecarts={run.ecarts}
        isPending={valider.isPending}
        error={error}
        onClose={() => setValiderOpen(false)}
        onConfirm={(c) => valider.mutate(c)}
      />
    </div>
  )
}

// ── « Valider le planning » after corrections ────────────

function ValiderPlanningDialog({
  open,
  ecarts,
  isPending,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean
  ecarts: string[]
  isPending: boolean
  error: string | null
  onClose: () => void
  onConfirm: (commentaire: string) => void
}) {
  const [commentaire, setCommentaire] = useState('')
  useEffect(() => {
    if (open) setCommentaire('')
  }, [open])
  const n = ecarts.length
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg" onClose={onClose}>
        <DialogHeader>
          <DialogTitle>Former Tricobot — valider le planning</DialogTitle>
        </DialogHeader>
        <div className="mt-4 space-y-3">
          <TricobotBulle titre={n > 0 ? `Tu as changé ${n} créneau${n > 1 ? 'x' : ''}` : 'Rien n’a changé'}>
            {n > 0
              ? 'Dis-moi pourquoi : je m’en sers pour mieux faire le planning la prochaine fois.'
              : 'Je note que mon planning était bon.'}
          </TricobotBulle>
          {n > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-lg border bg-zinc-100/80 p-2 space-y-1 scrollbar-transparent">
              {ecarts.map((e) => (
                <p key={e} className="text-xs tabular-nums">{e}</p>
              ))}
            </div>
          )}
          {n > 0 && (
            <textarea
              rows={3}
              autoFocus
              maxLength={2000}
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              placeholder="Ex. : les binômes n’étaient ensemble que depuis 2 semaines ; Marie ne fait pas de nuit."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            />
          )}
          {error && (
            <p className="text-sm text-destructive flex items-start gap-1.5">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              {error}
            </p>
          )}
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button disabled={isPending || (n > 0 && !commentaire.trim())} onClick={() => onConfirm(commentaire.trim())}>
            {isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {n > 0 ? 'Envoyer à Tricobot et valider' : 'Valider'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
