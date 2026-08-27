// « Observations régleur » — the standing notes an écru reference carries
// (`obs_ref_ecru`), scoped per métier and per coloris.
//
// Two screens show them, exactly as the legacy does — the OF fiche
// (`FI_Gestion_OF`, filtered to this OF's ref/métier/coloris) and Tombé Métier ›
// Références (`FI_Ref_TombéMetier`, the whole reference) — and both open the
// same editor (`FEN_Editer_Observation`: Machine · Coloris · Observation).
// So the card, the dialog and the delete confirmation live here once.
//
// Do NOT confuse these with the OF's own two text fields:
//   - `ordre_fabrication.observations` = the CONSIGNE, this run only (red
//     callout, `ConsigneCallout.tsx`);
//   - `message_of` = the bonnetier's thread from the Android terminal.
// obs_ref_ecru outlives both: it belongs to the reference, so a note written
// today shows up on an OF launched two years ago (that is the point, and it is
// why the legacy tab on OF 1741 shows a 2024 note on a 2022 order).
//
// Writes are behind `edit_of` — the same key `POST /of-trm` needs, since these
// notes exist to be read at lancement. Reading stays open to whoever has the
// screen.

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardList, Loader2, Plus, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PopoverSelect } from '@/components/ui/popover-select'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { apiFetch } from '@/lib/api'
import { useHasPermission } from '@/contexts/PermissionsContext'
import { formatHfsqlDate } from '@/lib/dates'
import { cn } from '@/lib/utils'

export interface ObsRefRow {
  id: number
  date: string | null
  observation: string
  IDmachine: number
  IDcolori_ecru: number
  /** Resolved label — 'Toutes' when IDmachine is the 0 wildcard. */
  machine: string
  /** Resolved label — 'Tout coloris' when IDcolori_ecru is the 0 wildcard. */
  coloris: string
  cible_machine: boolean
  cible_coloris: boolean
}

interface MachineLookup { id: number; nom: string }
interface ColorisLookup { id: number; reference: string }

// ── One observation card (§8.1 sidebar item card) ──────

function ObsCard({
  obs,
  canEdit,
  onEdit,
  onDelete,
}: {
  obs: ObsRefRow
  canEdit: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div
      className={cn(
        // The card of « Commentaires historiques » in CreateOfDialog, verbatim
        // (user decision, 2026-08-27). Same object, same clothes: the régleur
        // reads these notes at lancement and again on the fiche, and a white
        // §8.1 sidebar card made them look like two unrelated things. The gold
        // tint is the deliberate exception to §8.1 here.
        'group rounded-lg border border-gold/30 border-l-4 border-l-gold bg-gold-light/60 px-3 py-2 transition-colors',
        canEdit && 'cursor-pointer hover:border-accent/60',
      )}
      onClick={canEdit ? onEdit : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        {/* The scope, in the legacy's own words. The axis this note actually
            targets is bold — « Toutes » / « Tout coloris » must not read with
            the same weight as a real métier. */}
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground min-w-0 flex-wrap">
          <span className="tabular-nums">{obs.date ? formatHfsqlDate(obs.date) : '—'}</span>
          <span>·</span>
          <span className={cn(obs.cible_machine && 'font-semibold text-foreground')}>{obs.machine}</span>
          <span>·</span>
          <span className={cn(obs.cible_coloris && 'font-semibold text-foreground')}>{obs.coloris}</span>
        </div>
        {canEdit && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 -mr-1 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
            title="Supprimer cette observation"
            onClick={(e) => { e.stopPropagation(); onDelete() }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>
      <p className="text-sm whitespace-pre-line mt-1">{obs.observation}</p>
    </div>
  )
}

// ── Editor dialog (port of FEN_Editer_Observation) ─────

function ObsDialog({
  open,
  refId,
  refLabel,
  obs,
  /** Métier to preselect on a new note — the OF's, when it has one. */
  defaultMachine = 0,
  /** Coloris to preselect on a new note — the OF's, when it has one. */
  defaultColoris = 0,
  onClose,
  onSaved,
}: {
  open: boolean
  refId: number
  refLabel: string
  obs: ObsRefRow | null
  defaultMachine?: number
  defaultColoris?: number
  onClose: () => void
  onSaved: () => void
}) {
  const [machineId, setMachineId] = useState(0)
  const [coloriId, setColoriId] = useState(0)
  const [texte, setTexte] = useState('')
  const [error, setError] = useState<string | null>(null)

  const machinesQ = useQuery<MachineLookup[]>({
    queryKey: ['of-trm-machines'],
    queryFn: () => apiFetch('/of-trm/lookups/machines'),
    enabled: open,
  })
  const colorisQ = useQuery<ColorisLookup[]>({
    queryKey: ['of-trm-coloris-ecru', refId],
    queryFn: () => apiFetch(`/of-trm/lookups/coloris-ecru?ref=${refId}`),
    enabled: open && refId > 0,
  })

  // Seed on open: the row being edited, or the caller's context for a new one.
  useEffect(() => {
    if (!open) return
    setMachineId(obs ? obs.IDmachine : defaultMachine)
    setColoriId(obs ? obs.IDcolori_ecru : defaultColoris)
    setTexte(obs ? obs.observation : '')
    setError(null)
  }, [open, obs, defaultMachine, defaultColoris])

  const save = useMutation({
    mutationFn: () => {
      const body = JSON.stringify({
        IDmachine: machineId,
        IDcolori_ecru: coloriId,
        observation: texte.trim(),
      })
      return obs
        ? apiFetch(`/of-trm/observations-ref/${obs.id}`, { method: 'PUT', body })
        : apiFetch(`/of-trm/references/${refId}/observations-ref`, { method: 'POST', body })
    },
    onSuccess: () => { onSaved(); onClose() },
    onError: (e: Error & { status?: number }) =>
      setError(
        e.status === 403
          ? "Vous n'avez pas le droit de modifier les observations."
          : e.status === 400
            ? 'Le métier ou le coloris choisi ne convient pas à cette référence.'
            : "L'enregistrement a échoué.",
      ),
  })

  // The legacy dialog's subtitle, verbatim: « Ref 249 - Tout coloris sur
  // toutes les machines ». It is the only thing that says what the note will
  // apply to once saved.
  const coloriLabel = coloriId === 0
    ? 'Tout coloris'
    : (colorisQ.data?.find((c) => c.id === coloriId)?.reference ?? '…')
  const machineLabel = machineId === 0
    ? 'toutes les machines'
    : (machinesQ.data?.find((m) => m.id === machineId)?.nom ?? '…')

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg" onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-accent" />
            Observation
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Réf. {refLabel || '—'} — {coloriLabel} sur {machineLabel}
          </p>
        </DialogHeader>
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Métier</label>
              <PopoverSelect
                options={(machinesQ.data ?? []).map((m) => ({ id: m.id, primary: m.nom }))}
                value={machineId}
                onChange={setMachineId}
                emptyLabel="Toutes"
                size="sm"
                widthClass="w-full"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Coloris</label>
              <PopoverSelect
                options={(colorisQ.data ?? []).map((c) => ({ id: c.id, primary: c.reference }))}
                value={coloriId}
                onChange={setColoriId}
                emptyLabel="Tout coloris"
                size="sm"
                widthClass="w-full"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Observation</label>
            <textarea
              rows={5}
              autoFocus
              className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
              placeholder="Ce que le régleur doit savoir sur cette référence…"
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
            />
          </div>
        </div>
        {!!error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Annuler</Button>
          <Button onClick={() => save.mutate()} disabled={texte.trim() === '' || save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Valider
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── The list + its editor, the piece both screens embed ─

export function ObsRefEcruPanel({
  refId,
  refLabel,
  rows,
  canEdit,
  isLoading = false,
  defaultMachine = 0,
  defaultColoris = 0,
  emptyLabel = 'Aucun commentaire sur cette référence.',
  hint,
  onChanged,
}: {
  refId: number
  refLabel: string
  rows: ObsRefRow[]
  canEdit: boolean
  isLoading?: boolean
  defaultMachine?: number
  defaultColoris?: number
  emptyLabel?: string
  /** Footnote under the list — shown whether or not the list is empty. */
  hint?: string
  onChanged: () => void
}) {
  const [editing, setEditing] = useState<ObsRefRow | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<ObsRefRow | null>(null)

  const del = useMutation({
    mutationFn: (id: number) => apiFetch(`/of-trm/observations-ref/${id}`, { method: 'DELETE' }),
    onSuccess: () => { setPendingDelete(null); onChanged() },
  })

  return (
    <div className="space-y-2">
      {isLoading && <div className="h-14 bg-muted animate-pulse rounded-md" />}
      {!isLoading && rows.length === 0 && (
        <p className="text-sm text-muted-foreground italic">{emptyLabel}</p>
      )}
      {rows.map((o) => (
        <ObsCard
          key={o.id}
          obs={o}
          canEdit={canEdit}
          onEdit={() => { setEditing(o); setDialogOpen(true) }}
          onDelete={() => setPendingDelete(o)}
        />
      ))}
      {!isLoading && !!hint && (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      )}
      {canEdit && refId > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground hover:text-foreground"
          onClick={() => { setEditing(null); setDialogOpen(true) }}
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Ajouter un commentaire
        </Button>
      )}

      <ObsDialog
        open={dialogOpen}
        refId={refId}
        refLabel={refLabel}
        obs={editing}
        defaultMachine={defaultMachine}
        defaultColoris={defaultColoris}
        onClose={() => setDialogOpen(false)}
        onSaved={onChanged}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Supprimer cette observation ?"
        // The legacy's own confirmation, word for word.
        description="Voulez-vous vraiment supprimer cette observation ?"
        isPending={del.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => { if (pendingDelete) del.mutate(pendingDelete.id) }}
      />
    </div>
  )
}

// ── Adapter for the SHARED Tombé Métier › Références screen ─
//
// That file lives in ETM and knows nothing about obs_ref_ecru writes; it takes
// this component through `obsOfEditor` and renders it in place of its
// read-only list. Its rows come in the reference-detail payload, hence the
// shape translation — and they are the WHOLE reference, unfiltered, which is
// what `FI_Ref_TombéMetier` shows too.

interface ObsOfRowFromRefScreen {
  IDobs_ref_ecru: number
  IDmachine: number
  machine_nom: string | null
  IDcolori_ecru: number
  colori_reference: string | null
  observation: string | null
  date: string | null
}

export function ObsOfEditor({
  refId,
  refLabel,
  rows,
  isEditing,
  onChanged,
}: {
  refId: number
  refLabel: string
  rows: ObsOfRowFromRefScreen[]
  isEditing: boolean
  onChanged: () => void
}) {
  // Read the key here rather than take it as a prop: the shared screen passes
  // exactly `ObsOfEditorProps` and must not learn about TRM's permissions.
  // Writing needs BOTH the key and the screen's edit mode (§8 « Add button,
  // edit mode only ») — same rule as the OF fiche.
  const canEdit = useHasPermission('edit_of') && isEditing
  const mapped: ObsRefRow[] = rows.map((r) => {
    const m = r.IDmachine || 0
    const c = r.IDcolori_ecru || 0
    return {
      id: r.IDobs_ref_ecru,
      date: r.date,
      observation: r.observation ?? '',
      IDmachine: m,
      IDcolori_ecru: c,
      machine: m === 0 ? 'Toutes' : (r.machine_nom || `#${m}`),
      coloris: c === 0 ? 'Tout coloris' : (r.colori_reference || `#${c}`),
      cible_machine: m > 0,
      cible_coloris: c > 0,
    }
  })
  return (
    <ObsRefEcruPanel
      refId={refId}
      refLabel={refLabel}
      rows={mapped}
      canEdit={canEdit}
      emptyLabel="Aucune observation OF"
      onChanged={onChanged}
    />
  )
}

// ── The OF fiche's tab body ────────────────────────────
//
// Same panel, but scoped by the legacy predicate: this OF's reference,
// filtered to its métier and its coloris (0 = « toutes » on either axis). A new
// note written from here is pre-targeted at that métier and that coloris —
// which is where the régleur is standing when he writes it.

export function OfObservationsRegleur({
  ofId,
  refId,
  refLabel,
  machineId,
  coloriId,
  canEdit,
  onCount,
}: {
  ofId: number
  refId: number
  refLabel: string
  machineId: number
  coloriId: number
  canEdit: boolean
  /** Reports the row count up so the section header can show it (the aside
   *  CreateOfDialog's « Commentaires historiques » carries). */
  onCount?: (n: number | null) => void
}) {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery<ObsRefRow[]>({
    queryKey: ['of-trm-observations-ref', ofId],
    queryFn: () => apiFetch(`/of-trm/${ofId}/observations-ref`),
  })
  useEffect(() => { onCount?.(isLoading ? null : (data ?? []).length) }, [data, isLoading, onCount])
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['of-trm-observations-ref', ofId] })
    // The création dialog reads the same table through its own lookup.
    queryClient.invalidateQueries({ queryKey: ['of-trm-obs-ref'] })
  }
  return (
    <ObsRefEcruPanel
      refId={refId}
      refLabel={refLabel}
      rows={data ?? []}
      isLoading={isLoading}
      canEdit={canEdit}
      defaultMachine={machineId}
      defaultColoris={coloriId}
      emptyLabel="Aucun commentaire sur cette référence."
      // The dialog's own footnote, for the same reason: with no métier the
      // legacy predicate only lets the « Toutes » notes through, and an empty
      // list would otherwise read as « cette référence n'a rien ».
      hint={
        machineId > 0
          ? undefined
          : "Cet OF n'a pas de métier : seuls les commentaires valables sur toutes les machines apparaissent ici."
      }
      onChanged={refresh}
    />
  )
}

export { ObsDialog as ObsRefEcruDialog }
