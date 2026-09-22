import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarRange, Loader2, AlertCircle, X, Save, Target, Plus, Trash2, Wand2, SlidersHorizontal, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PopoverSelect, type PopoverSelectOption } from '@/components/ui/popover-select'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { UnsavedChangesDialog } from '@/components/shared/UnsavedChangesDialog'
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard'
import { useHasPermission } from '@/contexts/PermissionsContext'
import { cn } from '@/lib/utils'
import {
  creerVariable,
  definirPrevSemaine,
  fetchPrevisionnel,
  fetchSalariesAdmin,
  initialiserPrevisionnel,
  messageErreur,
  modifierVariable,
  supprimerVariable,
  type PrevSemaine,
  type PrevisionnelReponse,
  type Variable,
} from '@/lib/pointage-admin'
import { heuresMinutes, jourCourt, jourDe, minutesDepuisHM, minutesSignees, soldeSigne } from '@/lib/pointage-heures'
import { DrawerCard, ErreurNote, KV, nomComplet } from '@/components/pointage/parts'

// Pointage › Prévisionnel — port of the WinDev Admin Pointage's FEN_Prévisionnel
// (the year grid of planned hours), FEN_MAJ_prévisionnel (one week),
// FEN_Initialisation_prévisionnel (fill an empty year) and FEN_Variables (the
// yearly adjustments), plan ~/.claude/plans/admin-pointage.md § 9.5–9.6.
//
// Leticia's use (meeting of 2026-09-22): almost monthly. The year starts with
// the same total every week (or a copy of a colleague); then, week by week,
// she deducts a day of paid leave or a public holiday from that week's total
// and writes why. In January she carries last year's surplus over as a
// Variable. The balance everybody reads (tablet « Solde annuel », Semaines)
// is done − planned − adjustments, so a Variable is typed here as its EFFECT
// on that balance (+10:00 = ten hours in credit); the API stores the legacy's
// sign. Reading needs view_pointage, every write edit_pointage.

const QK = ['pointage-admin'] as const
const DEFAUT_HEBDO = '35:00'
const JOUR_MIN = 7 * 60

export function PointagePrevisionnel() {
  const canEdit = useHasPermission('edit_pointage')
  const aujourdhui = useMemo(() => jourDe(Date.now()), [])
  const anneeCourante = +aujourdhui.slice(0, 4)
  const [annee, setAnnee] = useState(anneeCourante)
  const [idSalarie, setIdSalarie] = useState(0)
  const [numero, setNumero] = useState<number | null>(null)
  const [initOpen, setInitOpen] = useState(false)
  const [variablesOpen, setVariablesOpen] = useState(false)

  const { data: salaries } = useQuery({ queryKey: [...QK, 'salaries'], queryFn: fetchSalariesAdmin })
  useEffect(() => {
    if (idSalarie === 0 && salaries?.length) setIdSalarie(salaries.find((s) => !s.supprime)?.id ?? salaries[0].id)
  }, [salaries, idSalarie])

  const salarieOptions = useMemo<PopoverSelectOption[]>(
    () =>
      [...(salaries ?? [])]
        .sort((a, b) => Number(a.supprime) - Number(b.supprime) || nomComplet(a).localeCompare(nomComplet(b), 'fr'))
        .map((s) => ({ id: s.id, primary: nomComplet(s), secondary: s.supprime ? 'ancien' : undefined })),
    [salaries],
  )
  // Next year is offered too: the prévisionnel is prepared before the year starts.
  const anneeOptions = useMemo<PopoverSelectOption[]>(
    () => Array.from({ length: anneeCourante + 1 - 2015 }, (_, i) => ({ id: anneeCourante + 1 - i, primary: String(anneeCourante + 1 - i) })),
    [anneeCourante],
  )

  const prev = useQuery({
    queryKey: [...QK, 'previsionnel', idSalarie, annee],
    queryFn: () => fetchPrevisionnel(idSalarie, annee),
    enabled: idSalarie > 0,
  })

  const [drawerDirty, setDrawerDirty] = useState(false)
  const drawerSaveRef = useRef<() => Promise<void>>(async () => {})
  const drawerDiscardRef = useRef<() => void>(() => {})
  const guard = useUnsavedGuard({
    isDirty: drawerDirty,
    save: async () => { await drawerSaveRef.current() },
    onDiscard: () => drawerDiscardRef.current(),
  })
  const handleClose = useCallback(() => guard.guardAction(() => setNumero(null)), [guard.guardAction])
  const handleCellClick = useCallback((n: number) => guard.guardAction(() => setNumero((p) => (p === n ? null : n))), [guard.guardAction])
  const changerSalarie = useCallback((id: number) => guard.guardAction(() => { setNumero(null); setIdSalarie(id) }), [guard.guardAction])
  const changerAnnee = useCallback((a: number) => guard.guardAction(() => { setNumero(null); setAnnee(a) }), [guard.guardAction])

  const salarie = salaries?.find((s) => s.id === idSalarie) ?? null
  const data = prev.data
  const semaine = data?.semaines.find((s) => s.numero === numero) ?? null

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <div className="flex-shrink-0 flex flex-wrap items-center gap-3">
        <div className="w-64 flex-shrink-0">
          <PopoverSelect options={salarieOptions} value={idSalarie} onChange={changerSalarie} emptyLabel="Choisir un salarié…" />
        </div>
        <div className="w-28 flex-shrink-0">
          <PopoverSelect options={anneeOptions} value={annee} onChange={changerAnnee} hideEmpty />
        </div>
        <div className="ml-auto flex items-center gap-2">
          {data && (
            <Button variant="outline" size="sm" onClick={() => setVariablesOpen(true)} title="Variables de l’année">
              <SlidersHorizontal className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Variables{data.variables.length ? ` (${data.variables.length})` : ''}</span>
            </Button>
          )}
          {canEdit && data?.vide && (
            <Button size="sm" onClick={() => setInitOpen(true)} title="Initialiser l’année">
              <Wand2 className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Initialiser l’année</span>
            </Button>
          )}
        </div>
      </div>

      {data && <BilanPrev data={data} />}

      <div className="flex-1 min-h-0 flex flex-col rounded-lg border border-border/60 bg-white shadow-sm overflow-hidden">
        {idSalarie === 0 || prev.isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        ) : prev.isError ? (
          <div className="flex flex-col items-center justify-center h-full text-destructive gap-2">
            <AlertCircle className="h-8 w-8" />
            <p className="text-sm">{(prev.error as { status?: number })?.status === 403 ? 'Accès restreint : le droit « Consulter le pointage » est nécessaire.' : messageErreur(prev.error)}</p>
          </div>
        ) : data ? (
          <>
            <div className="flex-shrink-0 flex items-center justify-between gap-3 border-b border-border/60 bg-zinc-200/60 px-4 py-2">
              <h2 className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Prévisionnel {data.annee}</h2>
              {data.vide && <p className="text-[11px] text-muted-foreground">Aucune semaine prévue cette année{canEdit ? ' — « Initialiser l’année » les crée toutes d’un coup.' : '.'}</p>}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-transparent p-3">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-1.5">
                {data.semaines.map((s) => (
                  <button
                    key={s.numero}
                    type="button"
                    data-stock-row
                    onClick={() => handleCellClick(s.numero)}
                    title={`Semaine ${s.numero} · du ${jourCourt(s.lundi)}${s.commentaire ? ` · ${s.commentaire}` : ''}`}
                    className={cn(
                      'rounded-md border px-2 py-1.5 text-left transition-colors',
                      s.prevMin === null ? 'border-border/40 bg-zinc-50 text-muted-foreground/60 hover:bg-zinc-100' : 'border-border/60 bg-white hover:bg-accent/5',
                      s.commentaire && 'border-l-4 border-l-accent/70',
                      s.numero === numero && 'ring-2 ring-accent',
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">S{s.numero}</span>
                      <span className="text-[10px] text-muted-foreground/70 tabular-nums">{jourCourt(s.lundi).slice(-5)}</span>
                    </div>
                    <div className="text-sm font-semibold tabular-nums">{s.prevMin === null ? '—' : heuresMinutes(s.prevMin)}</div>
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>

      <PrevDrawer
        idSalarie={idSalarie}
        salarieNom={salarie ? nomComplet(salarie) : ''}
        annee={annee}
        semaine={semaine}
        canEdit={canEdit}
        onClose={handleClose}
        onDirtyChange={setDrawerDirty}
        saveRef={drawerSaveRef}
        discardRef={drawerDiscardRef}
      />

      {data && salarie && (
        <InitDialog open={initOpen} onOpenChange={setInitOpen} data={data} salarieNom={nomComplet(salarie)} />
      )}
      {data && salarie && (
        <VariablesDialog open={variablesOpen} onOpenChange={setVariablesOpen} data={data} salarieNom={nomComplet(salarie)} canEdit={canEdit} />
      )}

      <UnsavedChangesDialog open={guard.showDialog} onAction={guard.handleAction} isSaving={guard.isSaving} />
    </div>
  )
}

// ── Balance strip — FEN_Prévisionnel's « Détail » ──────

function BilanPrev({ data }: { data: PrevisionnelReponse }) {
  const b = data.bilan
  return (
    <div className="flex-shrink-0 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-zinc-100/80 shadow-sm px-4 py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground"><Target className="h-4 w-4 text-accent" />Année {data.annee}</span>
        <span><span className="text-muted-foreground">Prévu sur l’année </span><span className="font-semibold tabular-nums">{heuresMinutes(b.prevuMin)}</span></span>
        {data.variables.map((v) => (
          <span key={v.id}><span className="text-muted-foreground">{v.commentaire || 'Ajustement'} </span><span className="font-semibold tabular-nums">{soldeSigne(v.soldeMin)}</span></span>
        ))}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-xs uppercase tracking-wide text-muted-foreground whitespace-nowrap">Objectif annuel</span>
        <span className="text-base font-bold tabular-nums whitespace-nowrap">{heuresMinutes(b.objectifMin)}</span>
      </div>
    </div>
  )
}

// ── Drawer — FEN_MAJ_prévisionnel ──────────────────────

interface DrawerProps {
  idSalarie: number
  salarieNom: string
  annee: number
  semaine: PrevSemaine | null
  canEdit: boolean
  onClose: () => void
  onDirtyChange: (dirty: boolean) => void
  saveRef: React.MutableRefObject<() => Promise<void>>
  discardRef: React.MutableRefObject<() => void>
}

function PrevDrawer({ idSalarie, salarieNom, annee, semaine, canEdit, onClose, onDirtyChange, saveRef, discardRef }: DrawerProps) {
  const queryClient = useQueryClient()
  const drawerRef = useRef<HTMLDivElement>(null)
  const [searchParams] = useSearchParams()
  const embed = searchParams.get('embed') === 'true'
  const open = semaine !== null

  const [heures, setHeures] = useState('')
  const [commentaire, setCommentaire] = useState('')
  const originalRef = useRef<{ heures: string; commentaire: string } | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    if (!semaine) { originalRef.current = null; return }
    const o = { heures: semaine.prevMin === null ? DEFAUT_HEBDO : heuresMinutes(semaine.prevMin), commentaire: semaine.commentaire }
    originalRef.current = o
    setHeures(o.heures)
    setCommentaire(o.commentaire)
    setErreur(null)
  }, [semaine])

  const isDirty = !!originalRef.current && open && (heures !== originalRef.current.heures || commentaire !== originalRef.current.commentaire)

  const mutation = useMutation({
    mutationFn: async () => {
      if (!semaine) return
      const prevMin = minutesDepuisHM(heures)
      if (prevMin === null) throw Object.assign(new Error('hm'), { body: { message: `Durée invalide : « ${heures} » (attendu HH:MM).` } })
      return definirPrevSemaine({ idSalarie, annee, numero: semaine.numero, prevMin, commentaire: commentaire.trim() })
    },
    onSuccess: (d) => {
      if (d) queryClient.setQueryData([...QK, 'previsionnel', idSalarie, annee], d)
      queryClient.invalidateQueries({ queryKey: [...QK, 'semaines'] })
      setErreur(null)
    },
    onError: (e) => setErreur(messageErreur(e)),
  })

  useEffect(() => { onDirtyChange(isDirty) }, [isDirty, onDirtyChange])
  useEffect(() => () => { onDirtyChange(false) }, [onDirtyChange])
  useEffect(() => { saveRef.current = async () => { await mutation.mutateAsync() } })
  useEffect(() => { discardRef.current = () => { if (originalRef.current) { setHeures(originalRef.current.heures); setCommentaire(originalRef.current.commentaire) } } })

  useEffect(() => {
    if (!open) return
    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Node | null
      if (!target) return
      if (drawerRef.current?.contains(target)) return
      if ((target as Element).closest?.('[data-stock-row]')) return
      if ((target as Element).closest?.('[role="dialog"], [role="alertdialog"], [role="listbox"]')) return
      onClose()
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [open, onClose])

  const deduire = (min: number) => {
    const actuel = minutesDepuisHM(heures) ?? 0
    setHeures(heuresMinutes(Math.max(0, actuel - min)))
  }

  return (
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
          <div className={cn('h-8 w-8 flex-shrink-0 rounded-lg flex items-center justify-center shadow-sm', isDirty ? 'bg-white text-primary' : 'bg-gold text-gold-foreground')}>
            <CalendarRange className="h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-heading font-bold tracking-tight truncate text-primary-foreground">Semaine {semaine?.numero ?? ''}</h2>
            <p className="text-xs text-white/70 truncate">{semaine ? `du ${jourCourt(semaine.lundi)} · ${salarieNom}` : salarieNom}</p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {canEdit && semaine && (
              <Button variant="gold" size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending || !isDirty || minutesDepuisHM(heures) === null} title="Enregistrer">
                {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 sm:mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 sm:mr-1.5" />}
                <span className="hidden sm:inline">Enregistrer</span>
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0 md:hidden text-white/80 hover:bg-white/15 hover:text-white" onClick={onClose} title="Fermer">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 space-y-3 scrollbar-transparent">
          {semaine && (
            <>
              <ErreurNote message={erreur} />
              <DrawerCard icon={<CalendarRange className="h-4 w-4 text-accent" />} title="Heures prévues" highlight={isDirty}>
                <div className="space-y-1.5">
                  <KV
                    label="Semaine"
                    mono
                    value={
                      canEdit ? (
                        <input
                          type="text"
                          inputMode="numeric"
                          value={heures}
                          onChange={(e) => setHeures(e.target.value)}
                          className={cn('h-7 w-20 px-2 text-sm rounded-md border bg-white focus:outline-none focus:ring-2 focus:ring-ring text-right tabular-nums', minutesDepuisHM(heures) === null ? 'border-red-500/60' : 'border-input')}
                        />
                      ) : semaine.prevMin === null ? '—' : heuresMinutes(semaine.prevMin)
                    }
                  />
                  {semaine.prevMin === null && <p className="text-[11px] text-muted-foreground">Aucun prévisionnel enregistré pour cette semaine.</p>}
                </div>
                {canEdit && (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground mr-1">Déduire :</span>
                    <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => deduire(JOUR_MIN)} title="Un jour de congé ou férié (7:00)">− 1 jour</Button>
                    <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => deduire(2 * JOUR_MIN)}>− 2 jours</Button>
                    <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setHeures('00:00')}>Semaine entière</Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setHeures(DEFAUT_HEBDO)}>{DEFAUT_HEBDO}</Button>
                  </div>
                )}
                <p className="mt-2 text-[11px] text-muted-foreground">Un jour de congé payé ou férié se déduit du total de la semaine (7:00 par jour) ; dites pourquoi dans le commentaire.</p>
              </DrawerCard>

              <DrawerCard icon={<MessageSquare className="h-4 w-4 text-accent" />} title="Commentaire" highlight={isDirty}>
                {canEdit ? (
                  <textarea
                    value={commentaire}
                    onChange={(e) => setCommentaire(e.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder="Ex. : 1 jour de congé, lundi férié…"
                    className="w-full px-2 py-1.5 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                ) : (
                  <p className="text-sm whitespace-pre-line">{semaine.commentaire || <span className="text-muted-foreground">—</span>}</p>
                )}
              </DrawerCard>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Init dialog — FEN_Initialisation_prévisionnel ──────

function InitDialog({ open, onOpenChange, data, salarieNom }: { open: boolean; onOpenChange: (o: boolean) => void; data: PrevisionnelReponse; salarieNom: string }) {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'heures' | 'copie'>('heures')
  const [heures, setHeures] = useState(DEFAUT_HEBDO)
  const [sourceId, setSourceId] = useState(0)
  const [erreur, setErreur] = useState<string | null>(null)
  useEffect(() => { if (open) { setMode('heures'); setHeures(DEFAUT_HEBDO); setSourceId(0); setErreur(null) } }, [open])

  const sources = useMemo<PopoverSelectOption[]>(() => data.sourcesRecopie.map((s) => ({ id: s.id, primary: nomComplet(s), secondary: s.supprime ? 'ancien' : undefined })), [data.sourcesRecopie])

  const mutation = useMutation({
    mutationFn: () => {
      if (mode === 'heures') {
        const prevMin = minutesDepuisHM(heures)
        if (prevMin === null) throw Object.assign(new Error('hm'), { body: { message: 'L’heure doit être au format HH:MM.' } })
        return initialiserPrevisionnel({ idSalarie: data.idSalarie, annee: data.annee, mode: 'heures', prevMin })
      }
      if (sourceId <= 0) throw Object.assign(new Error('src'), { body: { message: 'Vous devez sélectionner un salarié à recopier.' } })
      return initialiserPrevisionnel({ idSalarie: data.idSalarie, annee: data.annee, mode: 'copie', sourceId })
    },
    onSuccess: (d) => {
      queryClient.setQueryData([...QK, 'previsionnel', data.idSalarie, data.annee], d)
      queryClient.invalidateQueries({ queryKey: [...QK, 'semaines'] })
      onOpenChange(false)
    },
    onError: (e) => setErreur(messageErreur(e)),
  })

  const source = data.sourcesRecopie.find((s) => s.id === sourceId)
  const radio = 'h-4 w-4 border-input text-accent focus:ring-2 focus:ring-ring cursor-pointer'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-accent" />
            Initialiser le prévisionnel {data.annee}
          </DialogTitle>
        </DialogHeader>
        <div className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">Crée les {data.nbSemaines} semaines de {data.annee} pour {salarieNom}. Ensuite chaque semaine se corrige une par une.</p>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="radio" name="mode" className={cn(radio, 'mt-0.5')} checked={mode === 'heures'} onChange={() => setMode('heures')} />
            <span className="flex-1">
              Le même total chaque semaine
              <div className="mt-1.5">
                <input
                  type="text"
                  inputMode="numeric"
                  value={heures}
                  disabled={mode !== 'heures'}
                  onChange={(e) => setHeures(e.target.value)}
                  className={cn('h-9 w-24 px-2 text-sm rounded-md border bg-white focus:outline-none focus:ring-2 focus:ring-ring text-right tabular-nums disabled:opacity-50', minutesDepuisHM(heures) === null ? 'border-red-500/60' : 'border-input')}
                />
              </div>
            </span>
          </label>
          <label className={cn('flex items-start gap-2 text-sm', sources.length ? 'cursor-pointer' : 'opacity-50')}>
            <input type="radio" name="mode" className={cn(radio, 'mt-0.5')} checked={mode === 'copie'} disabled={!sources.length} onChange={() => setMode('copie')} />
            <span className="flex-1">
              Recopier le prévisionnel {data.annee} d’un autre salarié
              <div className="mt-1.5">
                <PopoverSelect options={sources} value={sourceId} onChange={setSourceId} emptyLabel={sources.length ? 'Choisir le salarié à recopier…' : 'Personne n’a de prévisionnel cette année'} disabled={mode !== 'copie' || !sources.length} />
              </div>
            </span>
          </label>
          <p className="text-xs text-muted-foreground">
            {mode === 'heures'
              ? `Toutes les semaines de ${data.annee} de ${salarieNom} passeront à ${minutesDepuisHM(heures) === null ? '…' : heuresMinutes(minutesDepuisHM(heures)!)}.`
              : `Toutes les semaines de ${data.annee} de ${source ? nomComplet(source) : '…'} seront recopiées pour ${salarieNom}.`}
          </p>
        </div>
        {erreur && (
          <div className="mt-3 flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{erreur}</span>
          </div>
        )}
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5 mr-1.5" />}
            Initialiser
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Variables dialog — FEN_Variables ───────────────────

function VariablesDialog({ open, onOpenChange, data, salarieNom, canEdit }: { open: boolean; onOpenChange: (o: boolean) => void; data: PrevisionnelReponse; salarieNom: string; canEdit: boolean }) {
  const queryClient = useQueryClient()
  const [nouvelle, setNouvelle] = useState<{ solde: string; commentaire: string } | null>(null)
  const [aSupprimer, setASupprimer] = useState<Variable | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  useEffect(() => { if (open) { setNouvelle(null); setErreur(null) } }, [open])

  const rafraichir = (d?: PrevisionnelReponse) => {
    if (d) queryClient.setQueryData([...QK, 'previsionnel', data.idSalarie, data.annee], d)
    else queryClient.invalidateQueries({ queryKey: [...QK, 'previsionnel', data.idSalarie, data.annee] })
    queryClient.invalidateQueries({ queryKey: [...QK, 'semaines'] })
  }
  const creer = useMutation({
    mutationFn: () => {
      const soldeMin = minutesSignees(nouvelle?.solde ?? '')
      if (soldeMin === null) throw Object.assign(new Error('hm'), { body: { message: 'Le format de la variable doit être (-)H:MM.' } })
      return creerVariable({ idSalarie: data.idSalarie, annee: data.annee, soldeMin, commentaire: (nouvelle?.commentaire ?? '').trim() })
    },
    onSuccess: (d) => { rafraichir(d); setNouvelle(null); setErreur(null) },
    onError: (e) => setErreur(messageErreur(e)),
  })
  const supprimer = useMutation({
    mutationFn: (v: Variable) => supprimerVariable(v.id),
    onSuccess: () => { rafraichir(); setASupprimer(null) },
    onError: (e) => { setASupprimer(null); setErreur(messageErreur(e)) },
  })

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg" onClose={() => onOpenChange(false)}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5 text-accent" />
              Variables {data.annee} · {salarieNom}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Une variable corrige le solde annuel sans toucher aux semaines : le report des heures en plus de l’année précédente, un accord particulier. Saisissez son effet sur le solde : <span className="font-mono">+10:00</span> ajoute dix heures de crédit, <span className="font-mono">-7:00</span> en retire sept.
            </p>
            {data.variables.length === 0 && !nouvelle && <p className="text-sm text-muted-foreground">Aucune variable cette année.</p>}
            <ul className="space-y-2">
              {data.variables.map((v) => (
                <VariableRow key={v.id} variable={v} canEdit={canEdit} onSaved={() => rafraichir()} onDelete={() => setASupprimer(v)} onError={setErreur} />
              ))}
            </ul>
            {canEdit && (nouvelle ? (
              <div className="rounded-md border border-l-4 border-l-accent/70 border-border/60 bg-accent/[0.03] p-2.5 flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={nouvelle.solde}
                  onChange={(e) => setNouvelle((n) => (n ? { ...n, solde: e.target.value } : n))}
                  placeholder="+10:00"
                  className={cn('h-8 w-24 px-2 text-sm rounded-md border bg-white focus:outline-none focus:ring-2 focus:ring-ring text-right tabular-nums', nouvelle.solde && minutesSignees(nouvelle.solde) === null ? 'border-red-500/60' : 'border-input')}
                />
                <input
                  type="text"
                  value={nouvelle.commentaire}
                  onChange={(e) => setNouvelle((n) => (n ? { ...n, commentaire: e.target.value } : n))}
                  placeholder="Report 2025…"
                  maxLength={500}
                  className="h-8 flex-1 min-w-[140px] px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <Button size="sm" className="h-8" onClick={() => creer.mutate()} disabled={creer.isPending}>
                  {creer.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                  Ajouter
                </Button>
                <Button variant="ghost" size="sm" className="h-8" onClick={() => setNouvelle(null)}>Annuler</Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setNouvelle({ solde: '', commentaire: '' })}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Nouvelle variable
              </Button>
            ))}
          </div>
          {erreur && (
            <div className="mt-3 flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{erreur}</span>
            </div>
          )}
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={aSupprimer !== null}
        title="Supprimer la variable"
        description={aSupprimer ? `« ${aSupprimer.commentaire || soldeSigne(aSupprimer.soldeMin)} » ne comptera plus dans le solde annuel.` : undefined}
        isPending={supprimer.isPending}
        onCancel={() => setASupprimer(null)}
        onConfirm={() => { if (aSupprimer) supprimer.mutate(aSupprimer) }}
      />
    </>
  )
}

function VariableRow({ variable, canEdit, onSaved, onDelete, onError }: { variable: Variable; canEdit: boolean; onSaved: () => void; onDelete: () => void; onError: (m: string | null) => void }) {
  const [solde, setSolde] = useState(soldeSigne(variable.soldeMin))
  const [commentaire, setCommentaire] = useState(variable.commentaire)
  useEffect(() => { setSolde(soldeSigne(variable.soldeMin)); setCommentaire(variable.commentaire) }, [variable])
  const dirty = solde !== soldeSigne(variable.soldeMin) || commentaire !== variable.commentaire
  const mutation = useMutation({
    mutationFn: () => {
      const soldeMin = minutesSignees(solde)
      if (soldeMin === null) throw Object.assign(new Error('hm'), { body: { message: 'Le format de la variable doit être (-)H:MM.' } })
      return modifierVariable(variable.id, { soldeMin, commentaire: commentaire.trim() })
    },
    onSuccess: () => { onError(null); onSaved() },
    onError: (e) => onError(messageErreur(e)),
  })
  if (!canEdit) {
    return (
      <li className="rounded-md border border-border/60 bg-zinc-50 px-2.5 py-2 flex items-center justify-between gap-3 text-sm">
        <span className="truncate">{variable.commentaire || <span className="text-muted-foreground">Sans commentaire</span>}</span>
        <span className="font-semibold tabular-nums">{soldeSigne(variable.soldeMin)}</span>
      </li>
    )
  }
  return (
    <li className={cn('rounded-md border border-border/60 bg-zinc-50 p-2.5 flex flex-wrap items-center gap-2', dirty && 'border-l-4 border-l-accent/70 bg-accent/[0.03]')}>
      <input
        type="text"
        inputMode="numeric"
        value={solde}
        onChange={(e) => setSolde(e.target.value)}
        className={cn('h-8 w-24 px-2 text-sm rounded-md border bg-white focus:outline-none focus:ring-2 focus:ring-ring text-right tabular-nums', minutesSignees(solde) === null ? 'border-red-500/60' : 'border-input')}
      />
      <input
        type="text"
        value={commentaire}
        onChange={(e) => setCommentaire(e.target.value)}
        maxLength={500}
        className="h-8 flex-1 min-w-[140px] px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {dirty && (
        <Button size="sm" className="h-8" onClick={() => mutation.mutate()} disabled={mutation.isPending || minutesSignees(solde) === null} title="Enregistrer">
          {mutation.isPending ? <Loader2 className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
        </Button>
      )}
      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={onDelete} title="Supprimer la variable">
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </li>
  )
}
