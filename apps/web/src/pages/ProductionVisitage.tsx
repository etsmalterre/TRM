// Production › Visitage — port of the legacy FI_Visitage.wdw (Tricotage
// Malterre mode). API: /api/visitage-trm (ETM shared API — the data rules,
// their evidence and the flagged approximations live in that route file).
//
// Layout: "Poste" — a full-screen workshop station, not one of the three
// master-detail patterns. User decision 2026-08-26, and registered as a named
// layout in mps_designer so the next atelier screen inherits a documented
// pattern instead of a one-off. Five stacked bands, only the roll band
// scrolls:
//
//   1. Barre poste     métier · état · visiteur
//   2. Entête OF       n° · réf/coloris/contexture · poids pièce · ouvert au large
//   3. Contexte        jauge OF · jauge commande · consigne
//   4. Pièce + rouleaux  sélecteur · couper · Σ · Valider · les cartes
//   5. Historique      les rouleaux déjà passés sur ce métier
//
// Target is a desk PC with keyboard + mouse (user decision): standard h-9
// controls, Tab/Entrée flow, Ctrl+Entrée to validate. No touch sizing.
//
// Deliberate deltas vs the legacy, each with its reason:
//  - The métier list also shows métiers holding a stray piece with no active
//    OF, and the piece selector surfaces pieces stranded on a terminé OF. The
//    legacy only ever offers the queue-head OF's pieces, which is how 56
//    finished pieces went un-visited in five months (probe-visitage-trm.ts §5).
//  - The visiteur is remembered per browser (localStorage). The station is
//    physically one person's; the legacy makes them re-pick every time. The
//    "Vous devez vous identifier" guard stays.
//  - NO weight judgement at the station. A piece routinely comes off over or
//    under poids_piece; that drift belongs to the régleur, who watches it from
//    the "Poids des pièces" dashboard widget (user, 2026-08-26). An early
//    version flagged out-of-band weights amber and showed Σ against the target
//    — it was an alarm on normal variation, at the wrong post. The only guard
//    left is poids > 0.
//  - The "Pièce à visiter" banner is forçable. Its cadence half is a recovered
//    approximation measured at 71,8 % (vs 57,4 % for "always visit"), so the
//    visiteuse gets the last word rather than an approximate rule writing a
//    false history.
//  - A bottom strip lists the rolls already passed today on this métier — the
//    legacy gives no way to check a piece has not already been weighed.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, Check, ChevronLeft, ChevronRight, Loader2, Plus, Printer, RefreshCw, Scale, Scissors, UserCheck, X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { PopoverSelect, type PopoverSelectOption } from '@/components/ui/popover-select'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { TmRollIcon } from '@/components/icons/TmRollIcon'
import { useHasPermission } from '@/contexts/PermissionsContext'
import { apiFetch, API_URL } from '@/lib/api'
import { fmtNum } from '@/lib/format'
import { printPdf } from '@/lib/print'
import { cn } from '@/lib/utils'

// ── API payload types ──────────────────────────────────

interface MetierRow {
  id: number
  emplacement: string
  nom: string
  of_id: number | null
  actif: boolean
  pieces_en_attente: number
  pieces_orphelines: number
  pieces_anciennes: number
}

interface VisiteurRow { id: number; nom: string; prenom: string; label: string; regleur: number }

/** One entry of the FEN_Ajout_Défaut picker. `unite` decides the quantity
 *  field's suffix — the legacy carries exactly two masks, `9 999 cm`
 *  (taille_cm) and `x9 999` (nombre). */
interface TypeDefautDef { type: string; unite: 'cm' | 'nb' }

interface DefautRow {
  id: number
  type_defaut: string
  description: string | null
  taille_cm: number
  nombre: number
  unite: 'cm' | 'nb'
  recupere: number
  origine: 'bonnetier' | 'visitage'
  spotteur_nom: string
  date_ms: number | null
}

interface AutrePiece {
  id: number
  numero: number
  label: string
  of_id: number
  of_label: string
  orpheline: boolean
}

interface PostePayload {
  metier: { id: number; emplacement: string; nom: string }
  of: {
    id: number
    est_tete_de_file: boolean
    est_termine: number
    quantite: number
    poids_piece: number
    ouvert_visiteuse: number
    consigne: string | null
    ref_reference: string
    ref_designation: string
    contexture: string
    coloris_label: string
    realise: number
    pct: number | null
    commande: { numero: number; client_nom: string; quantite: number; realise: number; pct: number | null } | null
  } | null
  piece: {
    id: number
    numero: number
    label: string
    of_id: number
    orpheline: boolean
    defauts: DefautRow[]
  } | null
  autres_pieces: AutrePiece[]
  numeros: { premier_choix: number; second_choix: number } | null
  a_visiter: boolean
  a_visiter_raison: 'ouvert_visiteuse' | 'debut_of' | 'cadence' | null
  approx: boolean
}

/** What POST /valider hands back — the rolls it created, which is exactly the
 *  list of labels the Dymo has to spool. */
interface ValiderResponse {
  of_id: number
  evenement: string
  rouleaux: { id: number; numero: string; num_piece_OF: number; second_choix: number; poids: number }[]
}

/** The last print job this poste fired, kept until the next validation so a
 *  label that did not come out of the Dymo can be re-sent without hunting for
 *  the roll again. `ok` is false when printPdf had to fall back to a tab. */
interface LastLabels { ids: number[]; ok: boolean }

interface HistoriqueRow {
  id: number
  numero: string
  poids: number
  second_choix: number
  visiteur: string
  date_saisie_ms: number | null
  nb_defauts: number
}

// ── Local draft state (client-side until Valider lands) ──

interface DefautDraft extends DefautRow { _key: string }
interface RouleauDraft {
  _key: string
  poids: string
  second_choix: boolean
  observations: string
  defauts: DefautDraft[]
}

let keySeq = 0
const nextKey = () => `k${++keySeq}`

function heure(ms: number | null): string {
  if (ms === null) return ''
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const VISITEUR_STORAGE_KEY = 'trm.visitage.visiteur'

/** How long the "défaut supprimé — Annuler" strip stays up. A misclick is
 *  noticed immediately, so the window only has to cover the glance-and-react;
 *  past that the strip is just a band eating room in the card. */
const UNDO_MS = 3500

export function ProductionVisitage() {
  const [metierId, setMetierId] = useState(0)
  const [pieceId, setPieceId] = useState(0)
  const [visiteurId, setVisiteurId] = useState(0)
  const [forceVisitage, setForceVisitage] = useState<boolean | null>(null)
  const [rouleaux, setRouleaux] = useState<RouleauDraft[]>([])
  const loadedPieceRef = useRef(0)

  // The station belongs to one person — remember them (§ deltas).
  useEffect(() => {
    try {
      const stored = Number(localStorage.getItem(VISITEUR_STORAGE_KEY) ?? '0')
      if (stored > 0) setVisiteurId(stored)
    } catch { /* private mode — the picker just starts empty */ }
  }, [])
  useEffect(() => {
    try {
      if (visiteurId > 0) localStorage.setItem(VISITEUR_STORAGE_KEY, String(visiteurId))
    } catch { /* ignore */ }
  }, [visiteurId])

  const metiers = useQuery<MetierRow[]>({
    queryKey: ['trm-visitage', 'metiers'],
    queryFn: () => apiFetch('/visitage-trm/lookups/metiers'),
  })
  const visiteurs = useQuery<VisiteurRow[]>({
    queryKey: ['trm-visitage', 'visiteurs'],
    queryFn: () => apiFetch('/visitage-trm/lookups/visiteurs'),
  })
  const typesDefaut = useQuery<TypeDefautDef[]>({
    queryKey: ['trm-visitage', 'types-defaut'],
    queryFn: () => apiFetch('/visitage-trm/lookups/types-defaut'),
    staleTime: Infinity, // a hard-coded catalogue — it cannot change at runtime
  })

  // The list only holds métiers with a piece waiting, so the first one is
  // always real work. Prefer one whose piece sits on the OF in production over
  // one that only holds a stray.
  useEffect(() => {
    if (metierId !== 0 || !metiers.data?.length) return
    const withWork = metiers.data.find((m) => m.pieces_en_attente > 0)
    setMetierId((withWork ?? metiers.data[0]).id)
  }, [metiers.data, metierId])

  // Métier and pièce are part of the key, so switching either lands on a cache
  // entry that has never been fetched. Without keepPreviousData that reads as
  // isLoading and the whole poste is replaced by the spinner — the screen went
  // white on every pick from the pièce dropdown. Holding the previous payload
  // keeps bands 2→5 on screen and turns the swap into a redraw; isFetching
  // already spins the Rafraîchir button, which is the only cue needed for a
  // sub-second fetch. Nothing can be keyed into the wrong context in the
  // meantime: the roll drafts are re-seeded from piece.id, so they only reset
  // once the new pièce has actually landed.
  const poste = useQuery<PostePayload>({
    queryKey: ['trm-visitage', 'poste', metierId, pieceId],
    queryFn: () => apiFetch(`/visitage-trm/poste?metier=${metierId}${pieceId ? `&piece=${pieceId}` : ''}`),
    enabled: metierId > 0,
    placeholderData: keepPreviousData,
  })

  // A stale tab, a piece another poste got to first, or a stray that just aged
  // past ORPHAN_MAX_AGE_DAYS: the API answers 409 piece_indisponible. Fall back
  // to whatever the métier offers now — without this, keepPreviousData would
  // leave the previous pièce on screen with no sign it is no longer loadable.
  useEffect(() => {
    if (poste.isError && pieceId !== 0) setPieceId(0)
  }, [poste.isError, pieceId])

  const historique = useQuery<HistoriqueRow[]>({
    queryKey: ['trm-visitage', 'historique', metierId],
    queryFn: () => apiFetch(`/visitage-trm/historique?metier=${metierId}&jours=1`),
    enabled: metierId > 0,
    // Same reason, plus one of its own: an empty entry would flash the honest
    // but wrong "aucun rouleau passé" during every métier change.
    placeholderData: keepPreviousData,
  })

  const data = poste.data
  const of = data?.of ?? null
  const piece = data?.piece ?? null

  // A new piece resets the drafts: one roll, carrying every defect the
  // bonnetier declared at the terminal. The visiteuse then arbitrates them.
  useEffect(() => {
    if (!piece) { setRouleaux([]); loadedPieceRef.current = 0; return }
    if (loadedPieceRef.current === piece.id) return
    loadedPieceRef.current = piece.id
    setForceVisitage(null)
    setRouleaux([{
      _key: nextKey(),
      poids: '',
      second_choix: false,
      observations: '',
      defauts: piece.defauts.map((d) => ({ ...d, _key: nextKey() })),
    }])
  }, [piece])

  const aVisiter = forceVisitage ?? data?.a_visiter ?? false

  // Preview numbers follow the choix toggles: the two sequences are
  // independent, so each card takes the next free number of ITS sequence.
  const numeros = useMemo(() => {
    const base = data?.numeros
    if (!base || !of) return []
    let first = base.premier_choix
    let second = base.second_choix
    return rouleaux.map((r) => (r.second_choix ? `${of.id}/${second++}` : `${of.id}/${first++}`))
  }, [rouleaux, data?.numeros, of])

  const totalPoids = useMemo(
    () => rouleaux.reduce((s, r) => s + (parseFloat(r.poids.replace(',', '.')) || 0), 0),
    [rouleaux],
  )

  const setRoll = useCallback((key: string, patch: Partial<RouleauDraft>) => {
    setRouleaux((prev) => prev.map((r) => (r._key === key ? { ...r, ...patch } : r)))
  }, [])

  const couper = useCallback(() => {
    setRouleaux((prev) => [...prev, { _key: nextKey(), poids: '', second_choix: false, observations: '', defauts: [] }])
  }, [])

  const retirer = useCallback((key: string) => {
    setRouleaux((prev) => {
      if (prev.length <= 1) return prev
      const idx = prev.findIndex((r) => r._key === key)
      // Only the last card is removable (see canRemove), so this is a pop.
      if (idx < 0 || idx !== prev.length - 1) return prev
      // Its defects fall back onto the previous card rather than vanishing —
      // they were declared on the piece and must stay attributed to a roll.
      const orphaned = prev[idx].defauts
      const next = prev.filter((r) => r._key !== key)
      const target = Math.max(0, idx - 1)
      next[target] = { ...next[target], defauts: [...next[target].defauts, ...orphaned] }
      return next
    })
  }, [])

  /** Move a defect one card left or right — the legacy's blue arrow. This is
   *  what makes a cut usable: the defect must end up on the roll that actually
   *  carries it (240 terminal-declared defects sit on a non-first roll). */
  const deplacer = useCallback((rollKey: string, defKey: string, dir: -1 | 1) => {
    setRouleaux((prev) => {
      const from = prev.findIndex((r) => r._key === rollKey)
      const to = from + dir
      if (from < 0 || to < 0 || to >= prev.length) return prev
      const def = prev[from].defauts.find((d) => d._key === defKey)
      if (!def) return prev
      return prev.map((r, i) => {
        if (i === from) return { ...r, defauts: r.defauts.filter((d) => d._key !== defKey) }
        if (i === to) return { ...r, defauts: [...r.defauts, def] }
        return r
      })
    })
  }, [])

  // The bonnetier keys an approximation at the terminal — 999 is what he enters
  // for "plus de 3 m" — and measuring it properly is the visiteuse's job. So the
  // quantity is editable on every pill, hers and his alike. Writes the column the
  // type's unit uses and leaves the other alone (the legacy's own SELECT on this
  // window reads type_defaut, taille_cm and nombre, and nothing else).
  const modifierQte = useCallback((rollKey: string, defKey: string, qte: number) => {
    setRouleaux((prev) => prev.map((r) => (r._key !== rollKey ? r : {
      ...r,
      defauts: r.defauts.map((d) => (d._key !== defKey ? d
        : d.unite === 'cm' ? { ...d, taille_cm: qte } : { ...d, nombre: qte })),
    })))
  }, [])

  const toggleRecupere = useCallback((rollKey: string, defKey: string) => {
    setRouleaux((prev) => prev.map((r) => (r._key !== rollKey ? r : {
      ...r,
      defauts: r.defauts.map((d) => (d._key === defKey ? { ...d, recupere: d.recupere ? 0 : 1 } : d)),
    })))
  }, [])

  const visiteur = (visiteurs.data ?? []).find((v) => v.id === visiteurId) ?? null
  // Nothing on this poste is usable before the visiteuse says who she is: her
  // name is stamped on every roll (stock_ecru.visiteur) and her id signs every
  // defect she adds (defaut_qualite.IDSpotteur). The legacy only checks at
  // Valider — too late, after a full piece has been keyed in.
  const identified = visiteurId > 0

  // ── Ajout / suppression d'un défaut ───────────────────
  // Port of FEN_Ajout_Défaut: a type picker and one quantity field whose unit
  // follows the type (the legacy carries exactly two masks, `9 999 cm` and
  // `x9 999`). The catalogue and the per-type unit come from the API.
  const [addTarget, setAddTarget] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ rollKey: string; def: DefautDraft } | null>(null)

  const ajouterDefaut = useCallback((rollKey: string, type: string, unite: 'cm' | 'nb', qte: number) => {
    setRouleaux((prev) => prev.map((r) => (r._key !== rollKey ? r : {
      ...r,
      defauts: [...r.defauts, {
        _key: nextKey(),
        id: 0, // not persisted yet — created by Valider
        type_defaut: type,
        // Left NULL on purpose: that is what the legacy has written for every
        // visitage-entered defect since 2023.
        description: null,
        taille_cm: unite === 'cm' ? qte : 0,
        nombre: unite === 'nb' ? qte : 0,
        unite,
        recupere: 0,
        origine: 'visitage',
        spotteur_nom: visiteur?.label ?? '',
        date_ms: Date.now(),
      }],
    })))
  }, [visiteur])

  // A deleted defect stays recoverable for a few seconds. The ✕ sits next to
  // the move arrows — the most-used control on a cut — so a misclick has to
  // cost a click to undo, not a lost record.
  const [undoDefaut, setUndoDefaut] = useState<{ rollKey: string; def: DefautDraft; index: number } | null>(null)
  useEffect(() => {
    if (!undoDefaut) return
    const t = setTimeout(() => setUndoDefaut(null), UNDO_MS)
    return () => clearTimeout(t)
  }, [undoDefaut])

  // Both of these read current state up front and then issue plain updates.
  // Never nest a setState inside another's updater: React may invoke an updater
  // twice (StrictMode, and any re-render it decides to replay), which would
  // fire the side effect twice.
  const supprimerDefaut = useCallback((rollKey: string, defKey: string) => {
    const roll = rouleaux.find((r) => r._key === rollKey)
    const index = roll ? roll.defauts.findIndex((d) => d._key === defKey) : -1
    if (roll && index >= 0) setUndoDefaut({ rollKey, def: roll.defauts[index], index })
    setRouleaux((prev) => prev.map((r) => (r._key !== rollKey ? r : {
      ...r, defauts: r.defauts.filter((d) => d._key !== defKey),
    })))
  }, [rouleaux])

  const annulerSuppression = useCallback(() => {
    const u = undoDefaut
    if (!u) return
    setRouleaux((prev) => prev.map((r) => {
      if (r._key !== u.rollKey) return r
      const next = [...r.defauts]
      next.splice(Math.min(u.index, next.length), 0, u.def)
      return { ...r, defauts: next }
    }))
    setUndoDefaut(null)
  }, [undoDefaut])

  /** A defect the visiteuse just typed goes without a prompt — it is her own
   *  and undoing it costs one click. One the bonnetier declared at the terminal
   *  is a real record being discarded, so it keeps the legacy's confirmation
   *  ("Voulez-vous vraiment supprimer ce défaut ?"). */
  const demanderSuppression = useCallback((rollKey: string, d: DefautDraft) => {
    if (d.origine === 'visitage') supprimerDefaut(rollKey, d._key)
    else setConfirmDelete({ rollKey, def: d })
  }, [supprimerDefaut])

  // ── Valider ───────────────────────────────────────────
  const queryClient = useQueryClient()
  const canSaisir = useHasPermission('saisie_visitage')

  const poidsOk = rouleaux.length > 0 && rouleaux.every((r) => (parseFloat(r.poids.replace(',', '.')) || 0) > 0)
  const canValider = identified && !!piece && poidsOk && canSaisir

  const [lastLabels, setLastLabels] = useState<LastLabels | null>(null)

  /** Fire the Dymo for a set of rolls and remember whether it took. */
  const imprimerEtiquettes = useCallback((ids: number[]) => {
    if (ids.length === 0) return
    setLastLabels({ ids, ok: true })
    void printPdf(`${API_URL}/visitage-trm/etiquettes?ids=${ids.join(',')}`).then((ok) => {
      setLastLabels((prev) => (prev && prev.ids === ids ? { ...prev, ok } : prev))
    })
  }, [])

  const valider = useMutation<ValiderResponse>({
    mutationFn: () => apiFetch('/visitage-trm/valider', {
      method: 'POST',
      body: JSON.stringify({
        IDpiece_production: piece?.id ?? 0,
        IDbonnetier: visiteurId,
        visitage_complet: aVisiter,
        rouleaux: rouleaux.map((r) => ({
          poids: parseFloat(r.poids.replace(',', '.')) || 0,
          second_choix: r.second_choix ? 1 : 0,
          observations: r.observations,
          defauts: r.defauts.map((d) => ({
            id: d.id,
            type_defaut: d.type_defaut,
            taille_cm: d.taille_cm,
            nombre: d.nombre,
            recupere: d.recupere ? 1 : 0,
          })),
        })),
      }),
    }),
    onSuccess: (data) => {
      // One label per roll the cut produced, in one job — the legacy printed
      // the same tag from ImprimeEtiquetteTM at this exact moment.
      imprimerEtiquettes((data?.rouleaux ?? []).map((r) => r.id).filter((id) => id > 0))
      // The piece is consumed; force a fresh poste so the next one loads with
      // its own defects and the numbering moves on.
      loadedPieceRef.current = 0
      setPieceId(0)
      setRouleaux([])
      void queryClient.invalidateQueries({ queryKey: ['trm-visitage'] })
    },
  })

  // Ctrl+Entrée validates from anywhere on the poste — the hands are on the
  // keyboard between two weighings.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && canValider && !valider.isPending) {
        e.preventDefault()
        valider.mutate()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canValider, valider])

  // Just the métier. The list only holds métiers that have work, so a
  // "1 pièce à visiter" caption on every row said nothing that picking the
  // row would not immediately show.
  const metierOptions: PopoverSelectOption[] = useMemo(
    () => (metiers.data ?? []).map((m) => ({ id: m.id, primary: m.emplacement })),
    [metiers.data],
  )

  // « isolée » = the piece belongs to another OF than the one in production on
  // this métier (its own OF was terminé, or overtaken in the queue). The API
  // only offers those for a week, so the tag needs no age: anything listed here
  // is still actionable, and the OF it belongs to is on the second line.
  const pieceOptions: PopoverSelectOption[] = useMemo(() => {
    const out: PopoverSelectOption[] = []
    if (piece) out.push({ id: piece.id, primary: piece.label, secondary: piece.orpheline ? 'isolée' : undefined })
    for (const p of data?.autres_pieces ?? []) {
      out.push({
        id: p.id,
        primary: p.label,
        secondary: p.orpheline ? 'isolée' : undefined,
        description: p.orpheline ? p.of_label : undefined,
      })
    }
    return out
  }, [piece, data?.autres_pieces])


  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      {/* ── Bande 1 · barre poste ───────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-3 rounded-lg bg-zinc-200/50 px-3 py-2">
        <span className="text-sm font-medium text-muted-foreground">Métier</span>
        <PopoverSelect
          options={metierOptions}
          value={metierId}
          onChange={(id) => { setMetierId(id); setPieceId(0) }}
          hideEmpty
          size="sm"
          /* Nothing picked yet is a real state here — the worklist can come
             back empty, and there is a frame before the auto-select lands.
             The default « — aucun — » truncated to « — a… » in a 78px trigger,
             which read as a broken control. So the empty state gets its own
             word AND its own width; a chosen métier goes straight back to the
             two-character trigger the toolbar is designed around. */
          emptyLabel={metierOptions.length === 0 ? 'Aucun' : 'Choisir'}
          widthClass={metierId === 0 ? 'w-[100px]' : 'w-[78px]'}
        />
        <Button
          variant="outline" size="icon" className="h-9 w-9" title="Rafraîchir"
          onClick={() => { void poste.refetch(); void metiers.refetch(); void historique.refetch() }}
        >
          <RefreshCw className={cn('h-4 w-4', poste.isFetching && 'animate-spin')} />
        </Button>

        {/* ⚠️⚠️ TEMPORAIRE — banc d'essai de l'étiqueteuse. ⚠️⚠️
            La seule machine qui peut exercer le vrai Dymo est le poste de
            production, donc ces deux boutons impriment des étiquettes
            d'exemple (`?demo=N`) sans créer le moindre rouleau. Le bloc est
            volontairement d'un seul tenant et signalé en pointillés ambre :
            À SUPPRIMER une fois le rendu validé sur le poste. */}
        <div className="flex items-center gap-1 rounded-md border border-dashed border-amber-500/60 bg-amber-500/10 px-2 py-1 flex-shrink-0">
          <span className="text-[11px] font-medium text-amber-800">Test Dymo</span>
          {[1, 3].map((n) => (
            <Button
              key={n}
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              title={`Imprimer ${n} étiquette${n > 1 ? 's' : ''} d'exemple`}
              onClick={() => { void printPdf(`${API_URL}/visitage-trm/etiquettes?demo=${n}`) }}
            >
              <Printer className="h-3.5 w-3.5 mr-1" />{n}
            </Button>
          ))}
        </div>

        <div className="flex-1 flex items-center justify-center gap-2 min-w-0">
          {of && aVisiter ? (
            <>
              <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0" />
              <span className="text-lg font-heading font-bold text-destructive truncate">Pièce à visiter</span>
            </>
          ) : of ? (
            <span className="text-sm text-muted-foreground">Pesée simple</span>
          ) : null}
          {!!of && (
            <button
              type="button"
              onClick={() => setForceVisitage(!aVisiter)}
              title={aVisiter ? 'Marquer comme simple pesée' : 'Marquer comme visitage complet'}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground flex-shrink-0"
            >
              changer
            </button>
          )}
        </div>

        {/* Identification. Required to work (legacy: "Vous devez vous
            identifier") — and since every roll this poste creates is stamped
            with this person's name in stock_ecru.visiteur, the photo is the
            check that it is really them. */}
        <span className={cn(
          'text-sm font-medium flex-shrink-0',
          identified ? 'text-muted-foreground' : 'text-amber-700',
        )}>
          {identified ? 'Visiteur' : 'Identifiez-vous'}
        </span>
        <VisiteurGate
          visiteurs={visiteurs.data ?? []}
          value={visiteurId}
          onChange={setVisiteurId}
          loading={visiteurs.isLoading}
        />
      </div>

      {/* The picker is a worklist now, so an empty one means the whole workshop
          is up to date — say that, rather than leaving a bare screen. */}
      {!metiers.isLoading && (metiers.data?.length ?? 0) === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <div className="h-14 w-14 mx-auto rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <Check className="h-7 w-7 text-emerald-700" />
            </div>
            <p className="text-base font-medium">Aucune pièce à visiter</p>
            <p className="text-sm text-muted-foreground">Tous les métiers sont à jour.</p>
          </div>
        </div>
      ) : poste.isLoading || metiers.isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      ) : poste.isError && pieceId === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <AlertTriangle className="h-8 w-8 mx-auto text-destructive" />
            <p className="text-sm text-muted-foreground">Le poste n&apos;a pas pu être chargé.</p>
            <Button variant="outline" size="sm" onClick={() => void poste.refetch()}>Réessayer</Button>
          </div>
        </div>
      ) : !of ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <TmRollIcon className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Pas d&apos;OF affecté à ce métier</p>
          </div>
        </div>
      ) : (
        <>
          {/* ── Bande 2 · entête OF ─────────────────────── */}
          <div className="flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="icon-box-gold h-11 w-11 flex-shrink-0">
                <TmRollIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <h1 className="text-2xl font-heading font-bold tracking-tight">OF n° {of.id}</h1>
                  <span className="text-lg text-muted-foreground truncate">
                    {of.ref_reference}{of.coloris_label ? ` · ${of.coloris_label}` : ''}
                  </span>
                </div>
                <div className="flex gap-1.5 mt-1 flex-wrap">
                  {!!of.contexture && <Badge variant="outline" className="text-xs">{of.contexture}</Badge>}
                  <Badge variant="outline" className="text-xs">Pièces de {fmtNum(of.poids_piece, 0)} Kg</Badge>
                  {of.ouvert_visiteuse === 1 && (
                    <Badge variant="outline" className="text-xs bg-amber-500/15 text-amber-800 border-amber-500/30">
                      <Scissors className="h-3 w-3 mr-1" />Ouvrir au large
                    </Badge>
                  )}
                  {!of.est_tete_de_file && (
                    <Badge variant="outline" className="text-xs bg-red-500/15 text-red-800 border-red-500/30">
                      {of.est_termine ? 'OF terminé' : 'Hors file'} — pièce isolée
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="h-1 w-24 mt-3 rounded-full bg-gradient-to-r from-accent via-accent to-accent/30" />
          </div>

          {/* ── Bande 3 · contexte ──────────────────────── */}
          <div className={cn('flex-shrink-0 grid gap-3', of.consigne ? 'md:grid-cols-3' : 'md:grid-cols-2')}>
            <JaugeCard titre="OF en cours" realise={of.realise} total={of.quantite} pct={of.pct} />
            {of.commande && (
              <JaugeCard
                titre="Commande liée"
                sousTitre={`${of.commande.client_nom} · n° ${of.commande.numero}`}
                realise={of.commande.realise}
                total={of.commande.quantite}
                pct={of.commande.pct}
              />
            )}
            {!!of.consigne && (
              <Card className="p-3 flex items-start gap-2.5 border-destructive/30 bg-destructive/5">
                <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold uppercase tracking-wide text-destructive">Consigne</div>
                  <p className="text-sm mt-0.5 whitespace-pre-wrap">{of.consigne}</p>
                </div>
              </Card>
            )}
          </div>

          {/* ── Bande 4 · pièce + rouleaux ──────────────── */}
          <div className="flex-1 min-h-0 flex flex-col gap-2">
            <div className="flex-shrink-0 flex items-center gap-3">
              {/* Boxed to exactly one card's width (w-72), so Couper's right
                  edge lines up with the right edge of the first roll card
                  below. The dropdown flexes to take whatever the label and the
                  button leave — the alignment then survives a label or button
                  change instead of depending on a hand-tuned pixel width. */}
              <div className="w-72 flex-shrink-0 flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground flex-shrink-0">Pièce</span>
                <div className="flex-1 min-w-0">
                  <PopoverSelect
                    options={pieceOptions}
                    /* The pick, then the loaded piece — in that order. The
                       payload lags by one fetch (keepPreviousData), so reading
                       the trigger off it alone would leave the dropdown showing
                       the previous pièce until the fetch landed. pieceId is 0
                       until the visiteuse picks one herself. */
                    value={pieceId || piece?.id || 0}
                    onChange={(id) => setPieceId(id)}
                    hideEmpty
                    size="sm"
                    widthClass="w-full"
                    emptyLabel="— aucune pièce en attente —"
                  />
                </div>
                <Button variant="gold" size="sm" className="flex-shrink-0" onClick={couper} disabled={!piece || !identified} title="Couper la pièce en un rouleau de plus (Ctrl+K)">
                  <Scissors className="h-3.5 w-3.5 mr-1.5" />Couper
                </Button>
              </div>

              <div className="flex-1" />

              {/* Validation errors have to be readable at the station: a
                  silent failure here means a piece the visiteuse believes is
                  in stock and is not. apiFetch only surfaces the status code,
                  so the status IS the message. */}
              {valider.isError && (
                <span className="text-sm font-medium text-destructive flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  {(() => {
                    const s = (valider.error as { status?: number })?.status
                    if (s === 401) return 'Session expirée — reconnectez-vous'
                    if (s === 403) return 'Droit « Saisir le visitage » manquant'
                    if (s === 409) return 'Pièce déjà visitée ailleurs — rafraîchissez'
                    if (s === 400) return 'Saisie invalide'
                    return 'Échec — vérifiez le stock avant de recommencer'
                  })()}
                </span>
              )}

              {/* What the Dymo was asked to do, kept until the next
                  validation. A label that jammed or never came out is the
                  commonest station incident, and the roll is already in stock
                  by then — so the way back to it has to stay on screen rather
                  than in the historique band. */}
              {lastLabels && !valider.isError && (
                <span className="text-sm flex items-center gap-1.5 text-muted-foreground">
                  <Printer className="h-4 w-4 flex-shrink-0" />
                  {lastLabels.ok
                    ? `${lastLabels.ids.length} étiquette${lastLabels.ids.length > 1 ? 's' : ''} envoyée${lastLabels.ids.length > 1 ? 's' : ''}`
                    : 'Étiquettes ouvertes dans un onglet'}
                  <button
                    type="button"
                    onClick={() => imprimerEtiquettes(lastLabels.ids)}
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    Réimprimer
                  </button>
                </span>
              )}

              {/* Total of the cut only, and only when there IS a cut — never
                  compared to poids_piece. A piece legitimately comes off the
                  métier over or under its target; that drift is the régleur's
                  business, watched from the tableau de bord, not something to
                  flag at the weighing station. */}
              {rouleaux.length > 1 && (
                <span className="text-sm tabular-nums text-muted-foreground">
                  Σ {fmtNum(totalPoids, 2)} Kg
                </span>
              )}
              <Button
                variant="gold"
                size="sm"
                disabled={!canValider || valider.isPending}
                onClick={() => valider.mutate()}
                title={
                  !canSaisir ? 'Droit « Saisir le visitage » requis'
                    : !identified ? 'Identifiez-vous d\'abord'
                    : !piece ? 'Aucune pièce à visiter'
                    : !poidsOk ? 'Chaque rouleau doit avoir un poids'
                    : 'Valider la pièce (Ctrl+Entrée)'
                }
              >
                {valider.isPending
                  ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  : <Check className="h-3.5 w-3.5 mr-1.5" />}
                Valider
              </Button>
            </div>

            {!identified ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-3 max-w-sm">
                  <div className="h-14 w-14 mx-auto rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
                    <UserCheck className="h-7 w-7 text-amber-700" />
                  </div>
                  <p className="text-base font-medium">Identifiez-vous pour visiter</p>
                  <p className="text-sm text-muted-foreground">
                    Chaque rouleau créé porte votre nom, et chaque défaut que vous relevez
                    votre signature. Choisissez votre nom en haut à droite — il sera retenu
                    sur ce poste.
                  </p>
                </div>
              </div>
            ) : !piece ? (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                Aucune pièce en attente de visitage sur ce métier.
              </div>
            ) : (
              /* The roll band owns every pixel left between the context row and
                 the history strip: the cards stretch to the bottom so a long
                 defect list has room instead of pushing the layout. Scroll is
                 horizontal here (one card per roll) and vertical inside each
                 card's defect list. */
              <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden scrollbar-transparent">
                <div className="flex gap-3 h-full items-stretch pb-2">
                  {rouleaux.map((r, i) => (
                    <RouleauCard
                      key={r._key}
                      draft={r}
                      numero={numeros[i] ?? ''}
                      /* Only the last card can be removed — the legacy shows
                         the ✕ on the rightmost roll alone. The cards are a
                         stack you pop from the end: dropping one in the middle
                         would renumber every roll after it. */
                      canRemove={rouleaux.length > 1 && i === rouleaux.length - 1}
                      hasLeft={i > 0}
                      hasRight={i < rouleaux.length - 1}
                      onChange={(patch) => setRoll(r._key, patch)}
                      onRemove={() => retirer(r._key)}
                      onMoveDefaut={(defKey, dir) => deplacer(r._key, defKey, dir)}
                      onToggleRecupere={(defKey) => toggleRecupere(r._key, defKey)}
                      onChangeQte={(defKey, qte) => modifierQte(r._key, defKey, qte)}
                      onAddDefaut={() => setAddTarget(r._key)}
                      onDeleteDefaut={(d) => demanderSuppression(r._key, d)}
                      undo={undoDefaut?.rollKey === r._key ? undoDefaut.def : null}
                      onUndo={annulerSuppression}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Bande 5 · historique du jour ────────────── */}
          <div className="flex-shrink-0 border-t border-border/60 pt-2">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-transparent">
              <span className="text-xs font-medium text-muted-foreground flex-shrink-0">
                Aujourd&apos;hui sur {data?.metier.emplacement} :
              </span>
              {(historique.data ?? []).length === 0 ? (
                <span className="text-xs text-muted-foreground italic">aucun rouleau passé</span>
              ) : (
                (historique.data ?? []).map((h) => (
                  <span
                    key={h.id}
                    title={`${h.visiteur} · ${heure(h.date_saisie_ms)}${h.nb_defauts ? ` · ${h.nb_defauts} défaut(s)` : ''}`}
                    className={cn(
                      'flex-shrink-0 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs tabular-nums',
                      h.second_choix
                        ? 'bg-red-500/10 text-red-800 border-red-500/30'
                        : 'bg-white border-border',
                    )}
                  >
                    <span className="font-medium">{h.numero}</span>
                    <span className="text-muted-foreground">{fmtNum(h.poids, 2)} Kg</span>
                  </span>
                ))
              )}
            </div>
          </div>
        </>
      )}

      <AjoutDefautDialog
        open={addTarget !== null}
        types={typesDefaut.data ?? []}
        onCancel={() => setAddTarget(null)}
        onConfirm={(type, unite, qte) => {
          if (addTarget) ajouterDefaut(addTarget, type, unite, qte)
          setAddTarget(null)
        }}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Voulez-vous vraiment supprimer ce défaut ?"
        description={confirmDelete
          ? `« ${confirmDelete.def.description || confirmDelete.def.type_defaut} » a été relevé par ${confirmDelete.def.spotteur_nom || 'le bonnetier'} pendant le tricotage. S'il a été rattrapé, préférez le marquer « récupéré » — la trace reste.`
          : undefined}
        onConfirm={() => {
          if (confirmDelete) supprimerDefaut(confirmDelete.rollKey, confirmDelete.def._key)
          setConfirmDelete(null)
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}

// ── Ajout d'un défaut (port de FEN_Ajout_Défaut) ───────

/** The legacy dialog is two controls: COMBO_Défaut and SAI_Quantité, the
 *  latter masked `9 999 cm` or `x9 999` depending on the type. Same here — the
 *  suffix follows the picked type, so there is never a unit to choose. */
function AjoutDefautDialog({ open, types, onCancel, onConfirm }: {
  open: boolean
  types: TypeDefautDef[]
  onCancel: () => void
  onConfirm: (type: string, unite: 'cm' | 'nb', qte: number) => void
}) {
  const [typeIdx, setTypeIdx] = useState(1)
  const [qte, setQte] = useState('')

  useEffect(() => {
    if (open) { setTypeIdx(1); setQte('') }
  }, [open])

  // PopoverSelect is id-keyed; the catalogue is an ordered list, so the 1-based
  // index is the id.
  // No unit on the option rows: the quantity field's own label right below
  // switches between "Longueur … cm" and "Nombre … ×" as soon as a type is
  // picked, so repeating it on the trigger only adds noise.
  const options: PopoverSelectOption[] = types.map((t, i) => ({ id: i + 1, primary: t.type }))
  const selected = types[typeIdx - 1] ?? null
  const valeur = Math.round(parseFloat(qte.replace(',', '.')) || 0)
  const valide = selected !== null && valeur > 0

  const submit = () => { if (valide && selected) onConfirm(selected.type, selected.unite, valeur) }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajouter un défaut</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <Label>Type de défaut</Label>
            <PopoverSelect options={options} value={typeIdx} onChange={setTypeIdx} hideEmpty />
          </div>
          <div className="space-y-1.5">
            <Label>{selected?.unite === 'cm' ? 'Longueur' : 'Nombre'}</Label>
            <div className="flex items-center gap-2">
              <input
                autoFocus
                type="text"
                inputMode="numeric"
                value={qte}
                onChange={(e) => setQte(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
                placeholder="0"
                className="h-9 flex-1 px-2 text-sm text-right tabular-nums rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <span className="text-sm text-muted-foreground w-8">
                {selected?.unite === 'cm' ? 'cm' : '×'}
              </span>
            </div>
          </div>
        </div>
        {/* DialogFooter carries no spacing of its own — the house convention is
            an explicit mt-4 at every call site (AtelierPlanning, ClientsCommandes). */}
        <DialogFooter className="mt-4">
          <Button variant="outline" size="sm" onClick={onCancel}>Annuler</Button>
          <Button variant="gold" size="sm" onClick={submit} disabled={!valide}>
            <Check className="h-3.5 w-3.5 mr-1.5" />Ajouter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Visiteur photo ─────────────────────────────────────

/** The visiteuse's portrait, 56 px and crisp.
 *
 *  Served by **`/prime-trm/bonnetiers/:id/photo?size=`**, not of-trm's raw-blob
 *  route: the stored originals are 750–1300 px JPEGs weighing up to 554 KB, and
 *  letting the browser downscale one of those to an avatar is exactly what made
 *  them look muddy (prime-trm's own comment says so). That route sharp-resizes
 *  with the EXIF rotation applied, cover-crops to a square and caches — 8,5 KB
 *  at size=168 instead of 355 KB. Requested at 3× the rendered box so it stays
 *  sharp on a hi-DPI screen.
 *
 *  Falls back to initials on any non-200 (several bonnetiers have no photo). */
/** Identification at the poste — the face IS the control.
 *
 *  §45.4 makes identification a gate and the photo the check that the name on
 *  tonight's output belongs to the person standing there. The combobox beside
 *  it asked the visiteuse to read and type a name she already recognises by
 *  face, so the face became the trigger and the field went away (user,
 *  2026-08-27).
 *
 *  The popover lists FACES, not rows of text: at a workshop desk you pick the
 *  person you can see. That is also why this is local rather than a
 *  `PopoverSelect` — that primitive is a shared ETM mirror with no custom
 *  trigger and no avatar in its rows, and bending it for one station screen
 *  would ripple through every dropdown in both apps.
 */
function VisiteurGate({ visiteurs, value, onChange, loading }: {
  visiteurs: VisiteurRow[]
  value: number
  onChange: (id: number) => void
  loading: boolean
}) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ right: number; top: number } | null>(null)

  const reposition = useCallback(() => {
    const el = btnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    // Anchored to the button's RIGHT edge: this sits at the far end of the
    // toolbar, so a left-anchored popover would hang off the viewport.
    setPos({ right: Math.max(8, window.innerWidth - r.right), top: r.bottom + 6 })
  }, [])

  useEffect(() => {
    if (!open) return
    reposition()
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open, reposition])

  const selected = visiteurs.find((v) => v.id === value)
  const identified = value > 0

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={identified ? `${selected?.label ?? ''} — cliquer pour changer` : 'Choisir le visiteur'}
        // The white pill is the RESTING state, not a hover reveal (user decision,
        // 2026-08-27): on the zinc toolbar it is what makes the identity read as a
        // badge worn by the station rather than a label floating in the strip.
        // Hover therefore has to say something else — it lifts (shadow) and its
        // hairline turns gold, the app's interactive accent.
        className={cn(
          'flex items-center gap-2.5 rounded-full pl-3.5 pr-1 py-1 flex-shrink-0',
          'transition-all focus:outline-none focus:ring-2 focus:ring-ring',
          identified
            ? 'bg-white shadow-sm ring-1 ring-black/5 hover:shadow-md hover:ring-accent/60'
            : 'bg-amber-500/10 shadow-sm ring-2 ring-amber-500/60 hover:bg-amber-500/20 hover:shadow-md',
        )}
      >
        <span className={cn(
          'text-sm font-medium whitespace-nowrap',
          identified ? 'text-foreground' : 'text-amber-700',
        )}>
          {identified ? selected?.label ?? '—' : 'Qui visite ?'}
        </span>
        <VisiteurPhoto id={value} nom={selected?.label ?? ''} />
      </button>

      {open && pos && createPortal(
        <div
          ref={popRef}
          style={{ position: 'fixed', right: pos.right, top: pos.top }}
          className="z-[100] w-[320px] max-h-[70vh] overflow-y-auto scrollbar-transparent rounded-lg border bg-white shadow-lg p-1.5"
        >
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-accent" />
            </div>
          ) : visiteurs.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground text-center">Aucun visiteur</p>
          ) : (
            visiteurs.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => { onChange(v.id); setOpen(false) }}
                className={cn(
                  'w-full flex items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors',
                  v.id === value ? 'bg-accent/15' : 'hover:bg-accent/10',
                )}
              >
                <VisiteurPhoto id={v.id} nom={v.label} size={40} />
                <span className="text-sm font-medium truncate">{v.label}</span>
                {v.id === value && <Check className="h-4 w-4 ml-auto flex-shrink-0 text-accent-blue" />}
              </button>
            ))
          )}
        </div>,
        document.body,
      )}
    </>
  )
}

function VisiteurPhoto({ id, nom, size = 56 }: { id: number; nom: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [id])

  const initials = nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

  const box = { width: size, height: size }

  if (id <= 0) {
    return (
      <div
        style={box}
        className="rounded-full border-2 border-dashed border-amber-500/50 bg-amber-500/5 flex-shrink-0"
      />
    )
  }
  if (failed) {
    return (
      <div
        style={{ ...box, fontSize: Math.round(size * 0.29) }}
        className="rounded-full border-2 border-accent/40 bg-primary text-primary-foreground flex items-center justify-center font-semibold flex-shrink-0"
      >
        {initials || '?'}
      </div>
    )
  }
  return (
    <img
      src={`${API_URL}/prime-trm/bonnetiers/${id}/photo?size=${size * 3}`}
      alt={nom}
      style={box}
      className="rounded-full object-cover border-2 border-accent/40 flex-shrink-0"
      onError={() => setFailed(true)}
    />
  )
}

// ── Jauge card ─────────────────────────────────────────

function JaugeCard({ titre, sousTitre, realise, total, pct }: {
  titre: string; sousTitre?: string; realise: number; total: number; pct: number | null
}) {
  const width = Math.min(100, Math.max(0, pct ?? 0))
  return (
    <Card className="p-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titre}</div>
          {!!sousTitre && <div className="text-xs text-muted-foreground truncate">{sousTitre}</div>}
        </div>
        <span className="text-sm font-semibold tabular-nums flex-shrink-0">{pct ?? '—'} %</span>
      </div>
      <div className="mt-2 h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn('h-full rounded-full', (pct ?? 0) >= 100 ? 'bg-emerald-500' : 'bg-accent-blue')}
          style={{ width: `${width}%` }}
        />
      </div>
      <div className="mt-1.5 text-sm tabular-nums">
        <span className="font-medium">{fmtNum(realise, 2)}</span>
        <span className="text-muted-foreground"> / {fmtNum(total, 2)} Kg</span>
      </div>
    </Card>
  )
}

// ── Roll card ──────────────────────────────────────────

function RouleauCard({
  draft, numero, canRemove, hasLeft, hasRight,
  onChange, onRemove, onMoveDefaut, onToggleRecupere, onChangeQte, onAddDefaut, onDeleteDefaut, undo, onUndo,
}: {
  draft: RouleauDraft
  numero: string
  canRemove: boolean
  hasLeft: boolean
  hasRight: boolean
  onChange: (patch: Partial<RouleauDraft>) => void
  onRemove: () => void
  onMoveDefaut: (defKey: string, dir: -1 | 1) => void
  onToggleRecupere: (defKey: string) => void
  onChangeQte: (defKey: string, qte: number) => void
  onAddDefaut: () => void
  onDeleteDefaut: (d: DefautDraft) => void
  undo: DefautDraft | null
  onUndo: () => void
}) {
  return (
    <div className={cn(
      // The tint carries the choix, matching the legacy's colour-coded cards —
      // restrained, because here the colour discriminates rather than decorates.
      'w-72 flex-shrink-0 h-full min-h-0 rounded-lg border shadow-sm flex flex-col',
      draft.second_choix ? 'border-red-500/40 bg-red-500/5' : 'border-emerald-500/40 bg-emerald-500/5',
    )}>
      {/* header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60">
        <TmRollIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <span className="text-sm font-semibold tabular-nums truncate">{numero}</span>
        <div className="flex-1" />
        {canRemove && (
          <button type="button" onClick={onRemove} title="Retirer ce rouleau"
            className="text-destructive hover:bg-destructive/10 rounded p-0.5">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* poids + choix */}
      <div className="px-3 py-2 flex items-center gap-2">
        <Scale className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <input
          type="text"
          inputMode="decimal"
          value={draft.poids}
          onChange={(e) => onChange({ poids: e.target.value })}
          placeholder="0,00"
          className="h-9 w-24 px-2 text-sm text-right tabular-nums rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <span className="text-sm text-muted-foreground">Kg</span>
        <div className="flex-1" />
        <button
          type="button"
          role="switch"
          aria-checked={!draft.second_choix}
          onClick={() => onChange({ second_choix: !draft.second_choix })}
          title={draft.second_choix ? 'Déclassé — cliquer pour repasser en 1er choix' : '1er choix — cliquer pour déclasser'}
          className={cn(
            'h-9 px-2.5 inline-flex items-center gap-1.5 rounded-md border text-xs font-medium transition-colors',
            draft.second_choix
              ? 'bg-red-500/15 text-red-800 border-red-500/30 hover:bg-red-500/25'
              : 'bg-emerald-500/15 text-emerald-800 border-emerald-500/30 hover:bg-emerald-500/25',
          )}
        >
          {draft.second_choix ? <X className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
          {draft.second_choix ? '2nd choix' : '1er choix'}
        </button>
      </div>
      {/* observations */}
      <div className="px-3 pb-2">
        <textarea
          value={draft.observations}
          onChange={(e) => onChange({ observations: e.target.value })}
          placeholder="Observations"
          rows={2}
          className="w-full px-2 py-1.5 text-sm rounded-md border border-input bg-white resize-none focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* défauts — scrolls inside the card so a piece with a dozen findings
          never pushes the "Ajouter" button out of reach */}
      <div className="px-2 flex-1 min-h-0 overflow-y-auto scrollbar-transparent space-y-1">
        {draft.defauts.length === 0 && (
          <p className="text-xs text-muted-foreground italic">Aucun défaut</p>
        )}
        {draft.defauts.map((d) => (
          <DefautPill
            key={d._key}
            defaut={d}
            hasLeft={hasLeft}
            hasRight={hasRight}
            onMove={(dir) => onMoveDefaut(d._key, dir)}
            onToggleRecupere={() => onToggleRecupere(d._key)}
            onChangeQte={(qte) => onChangeQte(d._key, qte)}
            onDelete={() => onDeleteDefaut(d)}
          />
        ))}
      </div>

      {/* pied de carte — l'ajout reste toujours visible */}
      <div className="px-3 py-2 border-t border-border/60 space-y-1.5">
        {undo && (
          <div className="flex items-center gap-2 rounded-md bg-zinc-800 px-2 py-1.5 text-xs text-white">
            <span className="truncate">« {undo.type_defaut} » supprimé</span>
            <div className="flex-1" />
            <button type="button" onClick={onUndo} className="font-semibold underline underline-offset-2 hover:text-accent flex-shrink-0">
              Annuler
            </button>
          </div>
        )}
        {/* Red, not the app's gold: this button only ever produces defect pills,
            which are red — a gold hover made the one control that adds a fault
            read like any other "+". Dashed and tinted rather than solid, because
            it is an add affordance, not a commit. */}
        <button
          type="button"
          onClick={onAddDefaut}
          className="w-full h-8 inline-flex items-center justify-center gap-1.5 rounded-md border border-dashed border-red-500/40 bg-red-500/5 text-xs font-medium text-red-800/80 hover:border-red-500/70 hover:bg-red-500/15 hover:text-red-800 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />Ajouter un défaut
        </button>
      </div>
    </div>
  )
}

function DefautPill({ defaut, hasLeft, hasRight, onMove, onToggleRecupere, onChangeQte, onDelete }: {
  defaut: DefautDraft
  hasLeft: boolean
  hasRight: boolean
  onMove: (dir: -1 | 1) => void
  onToggleRecupere: () => void
  onChangeQte: (qte: number) => void
  onDelete: () => void
}) {
  const recupere = defaut.recupere === 1

  // The move arrows live OUTSIDE the pill, pinned to the card's edges, and the
  // ✕ stays inside it. Moving a defect is the most-used gesture while
  // arbitrating a cut; deleting one destroys a production record. Side by side
  // at 14 px they were a coin toss — flanking the row puts the width of the
  // pill between them. The slots are always rendered (invisible when there is
  // no neighbouring roll) so the pills stay aligned down the card.
  return (
    <div className="flex items-center gap-1">
      <MoveSlot dir={-1} enabled={hasLeft} onMove={onMove} />

      <div className={cn(
        'flex-1 min-w-0 flex items-center gap-1 rounded-md border pl-2 pr-1 py-1 text-xs',
        recupere
          ? 'bg-emerald-500/10 text-emerald-800 border-emerald-500/30'
          : 'bg-red-500/10 text-red-800 border-red-500/30',
      )}>
        <span className="font-medium truncate" title={defaut.description ?? defaut.type_defaut}>
          {defaut.type_defaut}
        </span>
        <div className="flex-1" />
        <QteField defaut={defaut} onChange={onChangeQte} />

        {defaut.origine === 'bonnetier' && (
          <button
            type="button"
            onClick={onToggleRecupere}
            title={recupere
              ? `Récupéré — cliquer pour annuler (déclaré par ${defaut.spotteur_nom || 'le bonnetier'})`
              : `Marquer récupéré (déclaré par ${defaut.spotteur_nom || 'le bonnetier'})`}
            className="flex-shrink-0 h-6 w-6 inline-flex items-center justify-center rounded hover:bg-black/10"
          >
            <Check className={cn('h-3.5 w-3.5', recupere ? 'opacity-100' : 'opacity-40')} />
          </button>
        )}
        <button type="button" onClick={onDelete} title="Supprimer ce défaut"
          className="flex-shrink-0 h-6 w-6 inline-flex items-center justify-center rounded opacity-40 hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <MoveSlot dir={1} enabled={hasRight} onMove={onMove} />
    </div>
  )
}

/** The defect's quantity, editable in place — the legacy's bound column, with
 *  its two masks (`9 999 cm` on taille_cm, `x9 999` on nombre).
 *
 *  It is kept as a string while it has focus so the field can be emptied and
 *  retyped; a controlled number would fight the operator on the first
 *  backspace. Blur commits, and an empty field commits 0 rather than leaving
 *  the draft holding NaN.
 */
function QteField({ defaut, onChange }: { defaut: DefautDraft; onChange: (qte: number) => void }) {
  const cm = defaut.unite === 'cm'
  const value = cm ? defaut.taille_cm : defaut.nombre
  const [text, setText] = useState<string | null>(null)

  const commit = (raw: string) => {
    const n = Math.min(9999, Math.max(0, Math.round(Number(raw.replace(/[^d]/g, '')) || 0)))
    setText(null)
    if (n !== value) onChange(n)
  }

  return (
    <span className="flex items-center gap-0.5 flex-shrink-0 tabular-nums">
      {!cm && <span className="opacity-60">×</span>}
      <input
        type="text"
        inputMode="numeric"
        value={text ?? String(value)}
        onChange={(e) => setText(e.target.value.replace(/[^d]/g, '').slice(0, 4))}
        onFocus={(e) => { setText(String(value)); e.target.select() }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur() }
          if (e.key === 'Escape') { setText(null); (e.target as HTMLInputElement).blur() }
        }}
        title={cm ? "Longueur en cm — corriger l'estimation du bonnetier" : "Nombre — corriger l'estimation du bonnetier"}
        className="w-11 h-6 px-1 rounded border border-black/15 bg-white text-right text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {cm && <span className="opacity-60">cm</span>}
    </span>
  )
}

/** One of the two arrows flanking a defect row. Always occupies its width so
 *  the pills line up whether or not the roll has a neighbour on that side. */
function MoveSlot({ dir, enabled, onMove }: { dir: -1 | 1; enabled: boolean; onMove: (dir: -1 | 1) => void }) {
  const Icon = dir === -1 ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={() => onMove(dir)}
      title={dir === -1 ? 'Déplacer sur le rouleau précédent' : 'Déplacer sur le rouleau suivant'}
      className="flex-shrink-0 h-8 w-6 inline-flex items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent/15 hover:text-accent disabled:opacity-0 disabled:pointer-events-none"
    >
      <Icon className="h-5 w-5" />
    </button>
  )
}
