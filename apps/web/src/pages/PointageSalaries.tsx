import { useState, useMemo, useCallback, useEffect, useRef, useDeferredValue, memo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users,
  Search,
  Loader2,
  AlertCircle,
  X,
  Plus,
  Pencil,
  Save,
  Trash2,
  MessageSquare,
  IdCard,
  Check,
  UserPlus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PopoverSelect, type PopoverSelectOption } from '@/components/ui/popover-select'
import { CardKV, MobileSortRow } from '@/components/stock/StockCardParts'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { UnsavedChangesDialog } from '@/components/shared/UnsavedChangesDialog'
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard'
import { useIsDesktop } from '@/hooks/useIsDesktop'
import { useHasPermission } from '@/contexts/PermissionsContext'
import { cn } from '@/lib/utils'
import {
  creerMessage,
  creerSalarie,
  fetchBonnetiers,
  fetchMessages,
  fetchSalariesAdmin,
  messageErreur,
  modifierMessage,
  modifierSalarie,
  supprimerMessage,
  supprimerSalarie,
  type MessageSalarie,
  type SaisieSalarie,
  type SalarieAdmin,
} from '@/lib/pointage-admin'
import { inputVersJour, jourDe, jourNum, jourVersInput } from '@/lib/pointage-heures'
import { DrawerCard, ErreurNote, INPUT_KV, KV, SortHeader, nomComplet, type SortState } from '@/components/pointage/parts'

// Pointage › Salariés — the people of the pointeuse and the messages it shows
// them: port of the WinDev Admin Pointage's FEN_Salariés / FEN_Nouveau_salarié
// / FEN_Messages / FEN_Message (plan ~/.claude/plans/admin-pointage.md § 7).
// Table-centric « Tableau » layout (§27) with the fiche and the messages in
// the drawer — 45 rows, 7 active.
//
// A salarié is never removed, only flagged (the legacy's Suppr key); its
// shifts stay and the « En poste » board still names it. The 3-character login
// is unique across EVERY row, deleted ones included (legacy check kept). The
// link to a bonnetier (`id_mps`) is what gives the tablet its photo and the TRS
// its presence journal. A message names ONE salarié (decision, 2026-09-21) and
// shows on the tablet until its end date, today + 7 by default.
// Reading needs view_pointage; every write hangs on edit_pointage.

type SortKey = 'nom' | 'prenom' | 'login' | 'ratio' | 'bonnetier' | 'etat'

const COLUMNS: { key: SortKey; label: string; width: string; align?: 'left' | 'right' }[] = [
  { key: 'nom', label: 'Nom', width: '22%' },
  { key: 'prenom', label: 'Prénom', width: '20%' },
  { key: 'login', label: 'Login', width: '10%' },
  { key: 'ratio', label: 'Ratio prod.', width: '12%' },
  { key: 'bonnetier', label: 'Bonnetier lié', width: '26%' },
  { key: 'etat', label: '', width: '10%' },
]

function compareRows(a: SalarieAdmin, b: SalarieAdmin, key: SortKey): number {
  switch (key) {
    case 'nom':
      return a.nom.localeCompare(b.nom, 'fr') || a.prenom.localeCompare(b.prenom, 'fr')
    case 'prenom':
      return a.prenom.localeCompare(b.prenom, 'fr') || a.nom.localeCompare(b.nom, 'fr')
    case 'login':
      return a.login.localeCompare(b.login)
    case 'ratio':
      return Number(a.useInRatio) - Number(b.useInRatio)
    case 'bonnetier':
      return (a.bonnetier ?? '').localeCompare(b.bonnetier ?? '', 'fr')
    case 'etat':
      return Number(a.supprime) - Number(b.supprime)
  }
}

const QK = ['pointage-admin'] as const

export function PointageSalaries() {
  const [searchQuery, setSearchQuery] = useState('')
  const [voirSupprimes, setVoirSupprimes] = useState(false)
  const [sort, setSort] = useState<SortState<SortKey>>({ key: 'nom', dir: 'asc' })
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const isDesktop = useIsDesktop()
  const canEdit = useHasPermission('edit_pointage')

  const { data: rows, isLoading, isError, error } = useQuery({ queryKey: [...QK, 'salaries'], queryFn: fetchSalariesAdmin })
  const { data: bonnetiers } = useQuery({ queryKey: [...QK, 'bonnetiers'], queryFn: fetchBonnetiers, enabled: canEdit })

  const deferredSearch = useDeferredValue(searchQuery)
  const filteredSorted = useMemo(() => {
    let out = (rows ?? []).filter((r) => voirSupprimes || !r.supprime)
    const terms = deferredSearch.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length > 0) {
      out = out.filter((r) => {
        const hay = `${r.nom} ${r.prenom} ${r.login} ${r.bonnetier ?? ''}`.toLowerCase()
        return terms.every((t) => hay.includes(t))
      })
    }
    return [...out].sort((a, b) => {
      const cmp = compareRows(a, b, sort.key)
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [rows, voirSupprimes, deferredSearch, sort])

  const handleSort = useCallback((key: SortKey) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }, [])

  const [drawerDirty, setDrawerDirty] = useState(false)
  const drawerSaveRef = useRef<() => Promise<void>>(async () => {})
  const drawerDiscardRef = useRef<() => void>(() => {})
  const guard = useUnsavedGuard({
    isDirty: drawerDirty,
    save: async () => { await drawerSaveRef.current() },
    onDiscard: () => drawerDiscardRef.current(),
  })
  const handleClose = useCallback(() => guard.guardAction(() => setSelectedId(null)), [guard.guardAction])
  const handleRowClick = useCallback(
    (id: number) => guard.guardAction(() => setSelectedId((prev) => (prev === id ? null : id))),
    [guard.guardAction],
  )

  const selected = useMemo(() => (rows ?? []).find((r) => r.id === selectedId) ?? null, [rows, selectedId])

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <div className="flex-shrink-0 flex flex-wrap items-center gap-3">
        <div className="relative order-1 flex-1 min-w-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher (nom, prénom, login, bonnetier…)"
            className="h-9 w-full pl-8 pr-3 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <label className="order-3 sm:order-2 w-full sm:w-auto flex items-center gap-2 text-sm cursor-pointer select-none flex-shrink-0">
          <input
            type="checkbox"
            checked={voirSupprimes}
            onChange={(e) => setVoirSupprimes(e.target.checked)}
            className="h-4 w-4 rounded border-input text-accent focus:ring-2 focus:ring-ring cursor-pointer"
          />
          <span>Afficher les supprimés</span>
        </label>
        {canEdit && (
          <Button size="sm" onClick={() => setCreateOpen(true)} className="order-2 sm:order-3 flex-shrink-0" title="Nouveau salarié">
            <Plus className="h-3.5 w-3.5 sm:mr-1" />
            <span className="hidden sm:inline">Nouveau salarié</span>
          </Button>
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col rounded-lg border border-border/60 bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-full text-destructive gap-2">
            <AlertCircle className="h-8 w-8" />
            <p className="text-sm">{(error as { status?: number })?.status === 403 ? 'Accès restreint : le droit « Consulter le pointage » est nécessaire.' : (error as Error)?.message || 'Erreur de chargement'}</p>
          </div>
        ) : filteredSorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <Users className="h-12 w-12 opacity-30" />
            <p className="text-sm">Aucun salarié</p>
          </div>
        ) : (
          <>
            {isDesktop && (
              <div className="hidden md:flex md:flex-col flex-1 min-h-0">
                <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                  <colgroup>
                    {COLUMNS.map((c) => (
                      <col key={c.key} style={{ width: c.width }} />
                    ))}
                  </colgroup>
                  <thead className="bg-zinc-200/60 border-b border-border/60">
                    <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                      {COLUMNS.map((c) => (
                        <SortHeader key={c.key} label={c.label} sortKey={c.key} sort={sort} onSort={handleSort} align={c.align} />
                      ))}
                    </tr>
                  </thead>
                </table>
                <div className="flex-1 min-h-0 overflow-auto scrollbar-transparent">
                  <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                    <colgroup>
                      {COLUMNS.map((c) => (
                        <col key={c.key} style={{ width: c.width }} />
                      ))}
                    </colgroup>
                    <tbody>
                      {filteredSorted.map((r) => (
                        <SalarieRow key={r.id} row={r} selected={r.id === selectedId} onRowClick={handleRowClick} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {!isDesktop && (
              <div className="md:hidden flex-1 min-h-0 flex flex-col">
                <MobileSortRow columns={COLUMNS.filter((c) => c.label)} sort={sort} onSortChange={setSort} />
                <div className="flex-1 min-h-0 overflow-y-auto scrollbar-transparent p-2 space-y-2 bg-zinc-100/80">
                  {filteredSorted.map((r) => (
                    <SalarieCard key={r.id} row={r} selected={r.id === selectedId} onRowClick={handleRowClick} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <SalarieDrawer
        row={selected}
        canEdit={canEdit}
        bonnetiers={bonnetiers ?? []}
        onClose={handleClose}
        onDirtyChange={setDrawerDirty}
        saveRef={drawerSaveRef}
        discardRef={drawerDiscardRef}
      />

      <SalarieDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        bonnetiers={bonnetiers ?? []}
        onCreated={(s) => setSelectedId(s.id)}
      />

      <UnsavedChangesDialog open={guard.showDialog} onAction={guard.handleAction} isSaving={guard.isSaving} />
    </div>
  )
}

// ── Cells ──────────────────────────────────────────────

function SupprimeBadge({ row }: { row: SalarieAdmin }) {
  if (!row.supprime) return null
  return (
    <Badge variant="outline" className="text-[10px] py-0 bg-zinc-500/15 text-zinc-700 border-zinc-500/30">
      Supprimé
    </Badge>
  )
}

const SalarieRow = memo(function SalarieRow({ row, selected, onRowClick }: { row: SalarieAdmin; selected: boolean; onRowClick: (id: number) => void }) {
  return (
    <tr
      data-stock-row
      onClick={() => onRowClick(row.id)}
      className={cn('border-b border-border/40 cursor-pointer transition-colors', selected ? 'bg-accent/10' : 'hover:bg-accent/5', row.supprime && 'text-muted-foreground')}
    >
      <td className="px-2 py-2 font-medium truncate">{row.nom || '—'}</td>
      <td className="px-2 py-2 truncate">{row.prenom || '—'}</td>
      <td className="px-2 py-2 font-mono text-xs">{row.login || '—'}</td>
      <td className="px-2 py-2">{row.useInRatio ? <Check className="h-4 w-4 text-emerald-700" /> : <span className="text-muted-foreground">—</span>}</td>
      <td className="px-2 py-2 truncate text-muted-foreground">{row.bonnetier ?? '—'}</td>
      <td className="px-2 py-2">
        <SupprimeBadge row={row} />
      </td>
    </tr>
  )
})

const SalarieCard = memo(function SalarieCard({ row, selected, onRowClick }: { row: SalarieAdmin; selected: boolean; onRowClick: (id: number) => void }) {
  return (
    <div
      data-stock-row
      onClick={() => onRowClick(row.id)}
      className={cn(
        'rounded-lg border p-3 cursor-pointer transition-colors shadow-sm',
        selected ? 'bg-accent/10 border-accent ring-1 ring-accent' : 'bg-white border-border/60 hover:border-accent/40',
      )}
    >
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium truncate flex-1 min-w-0">{nomComplet(row)}</p>
        <SupprimeBadge row={row} />
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2">
        <CardKV label="Login" value={row.login || '—'} mono />
        <CardKV label="Ratio prod." value={row.useInRatio ? 'Oui' : 'Non'} />
        <CardKV label="Bonnetier lié" value={row.bonnetier ?? '—'} />
      </div>
    </div>
  )
})

// ── Drawer ─────────────────────────────────────────────

type Draft = SaisieSalarie
const draftDe = (s: SalarieAdmin): Draft => ({ nom: s.nom, prenom: s.prenom, login: s.login, useInRatio: s.useInRatio, idMps: s.idMps })
const memeDraft = (a: Draft, b: Draft) =>
  a.nom === b.nom && a.prenom === b.prenom && a.login === b.login && a.useInRatio === b.useInRatio && a.idMps === b.idMps

function bonnetierOptions(bonnetiers: { id: number; nom: string; prenom: string; archive: boolean }[]): PopoverSelectOption[] {
  return bonnetiers.map((b) => ({ id: b.id, primary: [b.prenom, b.nom].filter(Boolean).join(' '), secondary: b.archive ? 'archivé' : undefined }))
}

interface DrawerProps {
  row: SalarieAdmin | null
  canEdit: boolean
  bonnetiers: { id: number; nom: string; prenom: string; archive: boolean }[]
  onClose: () => void
  onDirtyChange: (dirty: boolean) => void
  saveRef: React.MutableRefObject<() => Promise<void>>
  discardRef: React.MutableRefObject<() => void>
}

function SalarieDrawer({ row, canEdit, bonnetiers, onClose, onDirtyChange, saveRef, discardRef }: DrawerProps) {
  const queryClient = useQueryClient()
  const drawerRef = useRef<HTMLDivElement>(null)
  const [searchParams] = useSearchParams()
  const embed = searchParams.get('embed') === 'true'
  const id = row?.id ?? null
  const editable = canEdit && !!row && !row.supprime

  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const originalRef = useRef<Draft | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [messageDialog, setMessageDialog] = useState<{ open: boolean; message: MessageSalarie | null }>({ open: false, message: null })
  const [messageASupprimer, setMessageASupprimer] = useState<MessageSalarie | null>(null)

  useEffect(() => { setIsEditing(false); setErreur(null) }, [id])

  const messages = useQuery({
    queryKey: [...QK, 'messages', id],
    queryFn: () => fetchMessages(id!),
    enabled: id !== null,
  })

  const startEdit = useCallback(() => {
    if (!row) return
    const d = draftDe(row)
    originalRef.current = d
    setDraft(d)
    setErreur(null)
    setIsEditing(true)
  }, [row])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!row || !draft) return
      return modifierSalarie(row.id, draft)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...QK, 'salaries'] })
      setErreur(null)
      setIsEditing(false)
    },
    onError: (e) => setErreur(messageErreur(e)),
  })

  const deleteMutation = useMutation({
    mutationFn: () => supprimerSalarie(row!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...QK, 'salaries'] })
      setConfirmOpen(false)
      onClose()
    },
    onError: (e) => { setConfirmOpen(false); setErreur(messageErreur(e)) },
  })

  const deleteMessageMutation = useMutation({
    mutationFn: (m: MessageSalarie) => supprimerMessage(m.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...QK, 'messages', id] })
      setMessageASupprimer(null)
    },
    onError: (e) => { setMessageASupprimer(null); setErreur(messageErreur(e)) },
  })

  const isDirty = useMemo(() => !!(isEditing && draft && originalRef.current && !memeDraft(draft, originalRef.current)), [isEditing, draft])

  useEffect(() => { onDirtyChange(isDirty) }, [isDirty, onDirtyChange])
  useEffect(() => () => { onDirtyChange(false) }, [onDirtyChange])
  useEffect(() => { saveRef.current = async () => { await saveMutation.mutateAsync() } })
  useEffect(() => { discardRef.current = () => setIsEditing(false) })

  useEffect(() => {
    if (id === null) return
    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Node | null
      if (!target) return
      if (drawerRef.current?.contains(target)) return
      if ((target as Element).closest?.('[data-stock-row]')) return
      if ((target as Element).closest?.('[role="dialog"], [role="alertdialog"]')) return
      onClose()
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [id, onClose])

  const open = row !== null
  const options = useMemo(() => bonnetierOptions(bonnetiers), [bonnetiers])
  const input = (champ: 'nom' | 'prenom' | 'login', extra?: string) =>
    draft ? (
      <input
        type="text"
        value={draft[champ]}
        maxLength={champ === 'login' ? 3 : 50}
        onChange={(e) => setDraft((d) => (d ? { ...d, [champ]: champ === 'login' ? e.target.value.toUpperCase() : e.target.value } : d))}
        className={cn(INPUT_KV, 'w-44', extra)}
      />
    ) : null

  return (
    <>
      <div
        ref={drawerRef}
        className={cn(
          'fixed right-0 bottom-0 w-full max-w-[440px] bg-white border-l border-border/60 shadow-xl z-30 transition-transform duration-300 flex flex-col',
          embed ? 'top-0' : 'top-14',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className="flex-1 min-h-0 flex flex-col bg-zinc-100/80">
          <div className="flex-shrink-0 flex items-center gap-2.5 border-b-2 border-gold bg-primary px-4 py-2.5">
            <div className={cn('h-8 w-8 flex-shrink-0 rounded-lg flex items-center justify-center shadow-sm transition-colors', isEditing ? 'bg-white text-primary' : 'bg-gold text-gold-foreground')}>
              <IdCard className="h-[18px] w-[18px]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-heading font-bold tracking-tight truncate text-primary-foreground">{row ? nomComplet(row) : ''}</h2>
                {row && <SupprimeBadge row={row} />}
              </div>
              <p className="text-xs text-white/70 truncate">{row ? [row.login && `Login ${row.login}`, row.bonnetier && `Bonnetier ${row.bonnetier}`].filter(Boolean).join(' · ') : ''}</p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {editable && (isEditing ? (
                <>
                  <Button variant="ghost" size="sm" className="px-2 text-white/80 hover:bg-white/15 hover:text-white" onClick={() => setIsEditing(false)} title="Annuler">
                    <X className="h-3.5 w-3.5 sm:mr-1.5" />
                    <span className="hidden sm:inline">Annuler</span>
                  </Button>
                  <Button variant="gold" size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !isDirty} title="Enregistrer">
                    {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 sm:mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 sm:mr-1.5" />}
                    <span className="hidden sm:inline">Enregistrer</span>
                  </Button>
                </>
              ) : (
                <Button variant="gold" size="sm" onClick={startEdit} title="Modifier">
                  <Pencil className="h-3.5 w-3.5 sm:mr-1.5" />
                  <span className="hidden sm:inline">Modifier</span>
                </Button>
              ))}
              <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0 md:hidden text-white/80 hover:bg-white/15 hover:text-white" onClick={onClose} title="Fermer">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 scrollbar-transparent">
            {row && (
              <>
                <ErreurNote message={erreur} />

                <DrawerCard icon={<IdCard className="h-4 w-4 text-accent" />} title="Fiche" highlight={isEditing}>
                  <div className="space-y-1.5">
                    <KV label="Nom" value={isEditing ? input('nom') : row.nom || '—'} />
                    <KV label="Prénom" value={isEditing ? input('prenom') : row.prenom || '—'} />
                    <KV label="Login (3 caractères)" value={isEditing ? input('login', 'w-20 font-mono uppercase') : <span className="font-mono">{row.login || '—'}</span>} />
                    <KV
                      label="Compte dans le ratio de production"
                      value={
                        isEditing && draft ? (
                          <input
                            type="checkbox"
                            checked={draft.useInRatio}
                            onChange={(e) => setDraft((d) => (d ? { ...d, useInRatio: e.target.checked } : d))}
                            className="h-4 w-4 rounded border-input text-accent focus:ring-2 focus:ring-ring cursor-pointer"
                          />
                        ) : row.useInRatio ? 'Oui' : 'Non'
                      }
                    />
                    <KV
                      label="Bonnetier lié"
                      value={
                        isEditing && draft ? (
                          <div className="w-52 inline-block text-left">
                            <PopoverSelect options={options} value={draft.idMps} onChange={(v) => setDraft((d) => (d ? { ...d, idMps: v } : d))} emptyLabel="Aucun" size="sm" />
                          </div>
                        ) : row.bonnetier ?? '—'
                      }
                    />
                  </div>
                  {isEditing && (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Le bonnetier lié donne sa photo à la pointeuse et son journal de présence au TRS.
                    </p>
                  )}
                </DrawerCard>

                <DrawerCard
                  icon={<MessageSquare className="h-4 w-4 text-accent" />}
                  title="Messages sur la pointeuse"
                  highlight={isEditing}
                  action={
                    editable && !isEditing ? (
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setMessageDialog({ open: true, message: null })}>
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Nouveau
                      </Button>
                    ) : undefined
                  }
                >
                  {messages.isLoading ? (
                    <div className="flex justify-center py-3">
                      <Loader2 className="h-4 w-4 animate-spin text-accent" />
                    </div>
                  ) : (messages.data ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">Aucun message.</p>
                  ) : (
                    <ul className="space-y-2">
                      {(messages.data ?? []).map((m) => (
                        <li key={m.id} className={cn('rounded-md border border-border/60 bg-zinc-50 px-2.5 py-2', m.expire && 'opacity-60')}>
                          <div className="flex items-start gap-2">
                            <p className="flex-1 min-w-0 text-sm whitespace-pre-line break-words">{m.texte}</p>
                            {editable && !isEditing && (
                              <div className="flex items-center gap-0.5 flex-shrink-0">
                                <Button variant="ghost" size="icon" className="h-6 w-6" title="Modifier le message" onClick={() => setMessageDialog({ open: true, message: m })}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" title="Supprimer le message" onClick={() => setMessageASupprimer(m)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {m.expire ? 'Expiré le ' : 'Affiché jusqu’au '}
                            {jourNum(m.dateFin)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </DrawerCard>

                {row.supprime && (
                  <p className="text-xs text-muted-foreground px-1">Salarié supprimé de la pointeuse : ses postes restent consultables dans Horaires.</p>
                )}

                {editable && !isEditing && (
                  <div className="pt-1">
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setConfirmOpen(true)}>
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      Supprimer le salarié
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Supprimer le salarié"
        description={row ? `${nomComplet(row)} disparaît de la pointeuse. Ses postes déjà pointés sont conservés et son login reste réservé.` : undefined}
        isPending={deleteMutation.isPending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => { setIsEditing(false); deleteMutation.mutate() }}
      />

      <ConfirmDialog
        open={messageASupprimer !== null}
        title="Supprimer le message"
        description={messageASupprimer ? `« ${messageASupprimer.texte.slice(0, 80)}${messageASupprimer.texte.length > 80 ? '…' : ''} » ne sera plus affiché sur la pointeuse.` : undefined}
        isPending={deleteMessageMutation.isPending}
        onCancel={() => setMessageASupprimer(null)}
        onConfirm={() => { if (messageASupprimer) deleteMessageMutation.mutate(messageASupprimer) }}
      />

      {row && (
        <MessageDialog
          open={messageDialog.open}
          onOpenChange={(o) => setMessageDialog((s) => ({ ...s, open: o }))}
          salarie={row}
          message={messageDialog.message}
        />
      )}
    </>
  )
}

// ── Dialogs (§18.A) ────────────────────────────────────

function MessageDialog({
  open,
  onOpenChange,
  salarie,
  message,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  salarie: SalarieAdmin
  message: MessageSalarie | null
}) {
  const queryClient = useQueryClient()
  const [texte, setTexte] = useState('')
  const [dateFin, setDateFin] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setTexte(message?.texte ?? '')
    // the legacy defaulted the end date to today + 7
    setDateFin(message?.dateFin ?? jourDe(Date.now() + 7 * 86_400_000))
    setErreur(null)
  }, [open, message])

  const mutation = useMutation({
    mutationFn: () => (message ? modifierMessage(message.id, { texte, dateFin }) : creerMessage(salarie.id, { texte, dateFin })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...QK, 'messages', salarie.id] })
      onOpenChange(false)
    },
    onError: (e) => setErreur(messageErreur(e)),
  })

  const submit = () => {
    if (!texte.trim()) { setErreur('Le message est vide.'); return }
    if (!dateFin) { setErreur('La date de fin d’affichage est obligatoire.'); return }
    setErreur(null)
    mutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-accent" />
            {message ? 'Modifier le message' : 'Nouveau message'}
          </DialogTitle>
        </DialogHeader>
        <div className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">Affiché à {nomComplet(salarie)} sur la pointeuse jusqu’à la date de fin incluse.</p>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Message</label>
            <textarea
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
              rows={4}
              maxLength={4000}
              className="w-full px-2 py-1.5 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Date de fin d’affichage</label>
            <input
              type="date"
              value={jourVersInput(dateFin)}
              onChange={(e) => setDateFin(inputVersJour(e.target.value))}
              className="h-9 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
        {erreur && (
          <div className="mt-3 flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{erreur}</span>
          </div>
        )}
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SalarieDialog({
  open,
  onOpenChange,
  bonnetiers,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  bonnetiers: { id: number; nom: string; prenom: string; archive: boolean }[]
  onCreated: (s: SalarieAdmin) => void
}) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Draft>({ nom: '', prenom: '', login: '', useInRatio: true, idMps: 0 })
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    if (open) { setDraft({ nom: '', prenom: '', login: '', useInRatio: true, idMps: 0 }); setErreur(null) }
  }, [open])

  const options = useMemo(() => bonnetierOptions(bonnetiers), [bonnetiers])

  const mutation = useMutation({
    mutationFn: () => creerSalarie(draft),
    onSuccess: (s) => {
      queryClient.invalidateQueries({ queryKey: [...QK, 'salaries'] })
      onOpenChange(false)
      onCreated(s)
    },
    onError: (e) => setErreur(messageErreur(e)),
  })

  const submit = () => {
    if (!draft.nom.trim()) { setErreur('Le nom est obligatoire.'); return }
    if (!draft.prenom.trim()) { setErreur('Le prénom est obligatoire.'); return }
    if (!draft.login.trim()) { setErreur('Le login est obligatoire.'); return }
    setErreur(null)
    mutation.mutate()
  }

  const champ = 'h-9 w-full px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-accent" />
            Nouveau salarié
          </DialogTitle>
        </DialogHeader>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Nom</label>
            <input type="text" value={draft.nom} maxLength={50} onChange={(e) => setDraft((d) => ({ ...d, nom: e.target.value }))} className={champ} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Prénom</label>
            <input type="text" value={draft.prenom} maxLength={50} onChange={(e) => setDraft((d) => ({ ...d, prenom: e.target.value }))} className={champ} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Login (3 caractères)</label>
            <input type="text" value={draft.login} maxLength={3} onChange={(e) => setDraft((d) => ({ ...d, login: e.target.value.toUpperCase() }))} className={cn(champ, 'font-mono uppercase')} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Bonnetier lié</label>
            <PopoverSelect options={options} value={draft.idMps} onChange={(v) => setDraft((d) => ({ ...d, idMps: v }))} emptyLabel="Aucun" />
          </div>
          <label className="col-span-full flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={draft.useInRatio}
              onChange={(e) => setDraft((d) => ({ ...d, useInRatio: e.target.checked }))}
              className="h-4 w-4 rounded border-input text-accent focus:ring-2 focus:ring-ring cursor-pointer"
            />
            <span>Compte dans le ratio de production</span>
          </label>
        </div>
        {erreur && (
          <div className="mt-3 flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{erreur}</span>
          </div>
        )}
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
            Ajouter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
