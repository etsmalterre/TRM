// Atelier › Maintenance — the « Aiguilles » tab of the right panel (LIVA #1263,
// Nicolas + Vincent, 2026-10-07). The needles of the selected métier, read from
// the Fournitures catalogue (lib/fournitures.ts, /api/fournitures-trm).
//
// A métier runs ALL its references at once, grouped here by where they sit
// (cylindre / plateau). Each card: the constructeur mounted and since when, the
// quantity a montage takes on this métier (typed by Nicolas once, then
// pre-filled), and the stock left.
//
// « Changer le jeu » (edit_maintenance, view mode) is the set change: Nicolas
// ticks the references he replaces — one, or 2 on the plateau and 3 on the
// cylindre — picks for each the constructeur he puts on and the quantity, and
// the stock goes down right then (API repartirSortie: the constructeur's own
// stock, then the unsplit stock; never refused, a negative stock calls for a
// count). The last set changes are listed under the cards; one typed by
// mistake can be undone (its stock comes back).
//
// Edit mode: click a card = the quantity per montage on this métier (the
// reference itself is edited in Fournitures › Références), hover trash =
// remove it from the métier, « Ajouter une référence » at the bottom.
// Every write is immediate, never part of the fiche's Enregistrer.

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ExternalLink, History, Loader2, Pin, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SearchableCombobox } from '@/components/ui/popover-select'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { ConstructeurPicker, ConstructeurChip, choixValide } from '@/components/fournitures/ConstructeurPicker'
import { apiFetch } from '@/lib/api'
import { formatHfsqlDate, hfsqlDateToInput, inputDateToHfsql } from '@/lib/dates'
import { fmtNum } from '@/lib/format'
import {
  POSITION_LABEL,
  ageLabel,
  apiErrorMessage,
  todayHf,
  useCatalogue,
  useSetCatalogue,
  type Article,
  type ArticleMetier,
  type Catalogue,
  type ChoixConstructeur,
  type Position,
} from '@/lib/fournitures'
import { cn } from '@/lib/utils'

/** The tab shows the articles of this type. */
const TYPE_AIGUILLE = 'aiguille'

const editSectionClass = 'border-l-4 border-l-accent/70 bg-accent/[0.03]'
const inputClass =
  'w-full h-9 px-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring'

/** One card: an article as this métier holds it. */
interface Ligne {
  article: Article
  lien: ArticleMetier
  autres: string[]
}

interface Groupe {
  key: string
  titre: string
  lignes: Ligne[]
}

interface MontageHisto {
  id: number
  date: string | null
  commentaire: string | null
  saisiPar: string | null
  lignes: { reference: string; position: Position | null; constructeur: string | null; quantite: number }[]
}

function lignesDuMetier(cat: Catalogue | undefined, metierId: number): Ligne[] {
  const out: Ligne[] = []
  for (const article of cat?.articles ?? []) {
    if (article.type.toLowerCase() !== TYPE_AIGUILLE) continue
    const lien = article.metiers.find((m) => m.id === metierId)
    if (!lien) continue
    out.push({ article, lien, autres: article.metiers.filter((m) => m.id !== metierId).map((m) => m.emplacement) })
  }
  return out.sort(
    (a, b) =>
      a.lien.rang - b.lien.rang || a.article.reference.localeCompare(b.article.reference, 'fr', { numeric: true }),
  )
}

/** Cylindre, then plateau, then the references without a position. */
function grouper(lignes: Ligne[]): Groupe[] {
  const g = (key: string, titre: string, f: (l: Ligne) => boolean) => ({ key, titre, lignes: lignes.filter(f) })
  return [
    g('cylindre', 'Cylindre', (l) => l.article.position === 'cylindre'),
    g('plateau', 'Plateau', (l) => l.article.position === 'plateau'),
    g('sans', 'Position à préciser', (l) => l.article.position === null),
  ].filter((x) => x.lignes.length > 0)
}

/** Stock a take of `constructeur` can draw on: its own + the unsplit stock
 *  (the API's repartirSortie, negative buckets ignored). */
function disponible(article: Article, constructeurId: number | null): number {
  const seau = (id: number | null) =>
    Math.max(0, article.stockParConstructeur.find((s) => (s.constructeur?.id ?? null) === id)?.stock ?? 0)
  return constructeurId === null ? seau(null) : seau(constructeurId) + seau(null)
}

/** Number of needle references on a métier, for the tab label (same cached query). */
export function useNbAiguilles(metierId: number | null): number | null {
  const { data } = useCatalogue()
  return useMemo(() => (data && metierId !== null ? lignesDuMetier(data, metierId).length : null), [data, metierId])
}

// ══════════════════════════════════════════════════════
//  The tab
// ══════════════════════════════════════════════════════

type Sujet =
  | { kind: 'jeu'; preselection: number[] }
  | { kind: 'lien'; ligne: Ligne }
  | { kind: 'ajout' }
  | { kind: 'retrait'; ligne: Ligne }
  | { kind: 'annuler'; montage: MontageHisto }

export function AiguillesTab({
  metierId,
  metierLabel,
  isEditing,
  canEdit,
}: {
  metierId: number
  metierLabel: string
  isEditing: boolean
  canEdit: boolean
}) {
  const queryClient = useQueryClient()
  const setCatalogue = useSetCatalogue()
  const [sujet, setSujet] = useState<Sujet | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [toutLHistorique, setToutLHistorique] = useState(false)

  const { data, isLoading, isError } = useCatalogue()
  const lignes = useMemo(() => lignesDuMetier(data, metierId), [data, metierId])
  const groupes = useMemo(() => grouper(lignes), [lignes])
  const typeAiguille = data?.types.find((t) => t.nom.toLowerCase() === TYPE_AIGUILLE) ?? null

  const histoKey = ['fournitures-trm-montages', metierId]
  const histo = useQuery<{ montages: MontageHisto[] }>({
    queryKey: histoKey,
    queryFn: () => apiFetch(`/fournitures-trm/metiers/${metierId}/montages`),
  })

  const ouvrir = (s: Sujet) => {
    setErreur(null)
    setSujet(s)
  }
  const fermer = () => setSujet(null)
  const onWrite = (cat: Catalogue) => {
    setCatalogue(cat)
    setSujet(null)
  }
  const onFail = (fallback: string) => (e: unknown) => setErreur(apiErrorMessage(e, fallback))

  const jeuMut = useMutation({
    mutationFn: (body: {
      date: string
      commentaire: string | null
      reporterGarniture: boolean
      lignes: { idArticle: number; constructeur: ChoixConstructeur | null; quantite: number }[]
    }) => apiFetch<Catalogue>(`/fournitures-trm/metiers/${metierId}/montages`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (cat, body) => {
      onWrite(cat)
      queryClient.invalidateQueries({ queryKey: histoKey })
      // « Changement des aiguilles » may have moved with it.
      if (body.reporterGarniture) queryClient.invalidateQueries({ queryKey: ['maintenance-trm-metiers'] })
    },
    onError: onFail("L'enregistrement a échoué. Réessayez."),
  })

  const annulerMut = useMutation({
    mutationFn: (montageId: number) =>
      apiFetch<Catalogue>(`/fournitures-trm/metiers/${metierId}/montages/${montageId}`, { method: 'DELETE' }),
    onSuccess: (cat) => {
      onWrite(cat)
      queryClient.invalidateQueries({ queryKey: histoKey })
    },
    onError: onFail("L'annulation a échoué. Réessayez."),
  })

  const lienMut = useMutation({
    mutationFn: (p: { articleId: number; quantite: number | null }) =>
      apiFetch<Catalogue>(`/fournitures-trm/metiers/${metierId}/articles/${p.articleId}`, {
        method: 'PUT',
        body: JSON.stringify({ quantite: p.quantite }),
      }),
    onSuccess: onWrite,
    onError: onFail("L'enregistrement a échoué. Réessayez."),
  })

  const ajoutMut = useMutation({
    mutationFn: (body: { idArticle: number } | { reference: string; idType: number; position: Position | null }) =>
      apiFetch<Catalogue>(`/fournitures-trm/metiers/${metierId}/articles`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: onWrite,
    onError: onFail("L'ajout a échoué. Réessayez."),
  })

  const retraitMut = useMutation({
    mutationFn: (articleId: number) =>
      apiFetch<Catalogue>(`/fournitures-trm/metiers/${metierId}/articles/${articleId}`, { method: 'DELETE' }),
    onSuccess: onWrite,
    onError: onFail('Le retrait a échoué. Réessayez.'),
  })

  const editable = canEdit && isEditing
  const quick = canEdit && !isEditing
  const montages = histo.data?.montages ?? []
  const montagesVus = toutLHistorique ? montages : montages.slice(0, 3)

  return (
    <>
      {quick && lignes.length > 0 && (
        <Button size="sm" className="w-full" onClick={() => ouvrir({ kind: 'jeu', preselection: [] })}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Changer le jeu
        </Button>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement…
        </div>
      ) : isError ? (
        <p className="text-sm text-destructive py-2">Impossible de charger les aiguilles.</p>
      ) : lignes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Pin className="h-8 w-8 mb-2 opacity-40" />
          <p className="text-sm">Aucune référence d&apos;aiguille</p>
        </div>
      ) : (
        groupes.map((g) => (
          <div key={g.key} className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-1 pt-1">
              {g.titre} <span className="font-normal">· {g.lignes.length}</span>
            </p>
            {g.lignes.map((l) => (
              <CarteAiguille
                key={l.article.id}
                ligne={l}
                isEditing={isEditing}
                onOpen={
                  editable
                    ? () => ouvrir({ kind: 'lien', ligne: l })
                    : quick
                      ? () => ouvrir({ kind: 'jeu', preselection: [l.article.id] })
                      : undefined
                }
                onRetirer={editable ? () => ouvrir({ kind: 'retrait', ligne: l }) : undefined}
              />
            ))}
          </div>
        ))
      )}

      {editable && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground hover:text-foreground"
          onClick={() => ouvrir({ kind: 'ajout' })}
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Ajouter une référence
        </Button>
      )}

      {montages.length > 0 && (
        <div className="p-3 rounded-lg border bg-card shadow-sm space-y-2">
          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <History className="h-3.5 w-3.5" />
            Derniers changements de jeu
          </p>
          {montagesVus.map((m) => (
            <div key={m.id} className="group text-sm border-t border-border/60 pt-2 first-of-type:border-t-0 first-of-type:pt-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium tabular-nums">{m.date ? formatHfsqlDate(m.date) : '—'}</span>
                <span className="flex items-center gap-1">
                  {m.saisiPar && <span className="text-[11px] text-muted-foreground">{m.saisiPar}</span>}
                  {editable && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Annuler ce changement de jeu (le stock est rendu)"
                      onClick={() => ouvrir({ kind: 'annuler', montage: m })}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </span>
              </div>
              {m.lignes.map((l, i) => (
                <p key={i} className="text-xs text-muted-foreground">
                  {l.position ? `${POSITION_LABEL[l.position]} · ` : ''}
                  <span className="text-foreground tabular-nums">{l.reference}</span> × {fmtNum(l.quantite)}
                  {l.constructeur && ` · ${l.constructeur}`}
                </p>
              ))}
              {m.commentaire && <p className="text-[11px] text-muted-foreground italic">{m.commentaire}</p>}
            </div>
          ))}
          {montages.length > 3 && (
            <button
              type="button"
              className="text-xs text-accent hover:underline"
              onClick={() => setToutLHistorique((v) => !v)}
            >
              {toutLHistorique ? 'Voir moins' : `Voir les ${montages.length} changements`}
            </button>
          )}
        </div>
      )}

      {!isLoading && lignes.length > 0 && quick && (
        <p className="text-[11px] text-muted-foreground px-1">
          Cliquez une référence pour changer son jeu seul, ou « Changer le jeu » pour en remplacer plusieurs.
        </p>
      )}

      <JeuDialog
        open={sujet?.kind === 'jeu'}
        preselection={sujet?.kind === 'jeu' ? sujet.preselection : []}
        metierLabel={metierLabel}
        groupes={groupes}
        constructeurs={data?.constructeurs ?? []}
        saving={jeuMut.isPending}
        error={erreur}
        onClose={fermer}
        onSave={(body) => {
          setErreur(null)
          jeuMut.mutate(body)
        }}
      />

      <LienDialog
        ligne={sujet?.kind === 'lien' ? sujet.ligne : null}
        metierLabel={metierLabel}
        saving={lienMut.isPending}
        error={erreur}
        onClose={fermer}
        onSave={(quantite) => {
          if (sujet?.kind !== 'lien') return
          setErreur(null)
          lienMut.mutate({ articleId: sujet.ligne.article.id, quantite })
        }}
      />

      <AjoutDialog
        open={sujet?.kind === 'ajout'}
        metierId={metierId}
        metierLabel={metierLabel}
        articles={(data?.articles ?? []).filter((a) => a.type.toLowerCase() === TYPE_AIGUILLE)}
        idType={typeAiguille?.id ?? null}
        saving={ajoutMut.isPending}
        error={erreur}
        onClose={fermer}
        onSave={(body) => {
          setErreur(null)
          ajoutMut.mutate(body)
        }}
      />

      <ConfirmDialog
        open={sujet?.kind === 'retrait'}
        title="Retirer la référence"
        description={
          sujet?.kind === 'retrait'
            ? `Retirer « ${sujet.ligne.article.reference} » du métier ${metierLabel} ? La référence, son stock et l'historique des jeux restent${
                sujet.ligne.autres.length ? ` ; elle reste aussi sur ${sujet.ligne.autres.join(', ')}` : ''
              }.`
            : undefined
        }
        confirmLabel="Retirer"
        isPending={retraitMut.isPending}
        error={erreur}
        onCancel={fermer}
        onConfirm={() => {
          if (sujet?.kind === 'retrait') retraitMut.mutate(sujet.ligne.article.id)
        }}
      />

      <ConfirmDialog
        open={sujet?.kind === 'annuler'}
        title="Annuler le changement de jeu"
        description={
          sujet?.kind === 'annuler'
            ? `Annuler le changement de jeu du ${sujet.montage.date ? formatHfsqlDate(sujet.montage.date) : '—'} ? Les quantités reviennent en stock. Le constructeur affiché comme monté n'est pas rembobiné : refaites un changement de jeu si besoin.`
            : undefined
        }
        confirmLabel="Annuler le changement"
        isPending={annulerMut.isPending}
        error={erreur}
        onCancel={fermer}
        onConfirm={() => {
          if (sujet?.kind === 'annuler') annulerMut.mutate(sujet.montage.id)
        }}
      />
    </>
  )
}

/** §8.1 sidebar item card — one reference of the métier. */
function CarteAiguille({
  ligne,
  isEditing,
  onOpen,
  onRetirer,
}: {
  ligne: Ligne
  isEditing: boolean
  onOpen?: () => void
  onRetirer?: () => void
}) {
  const { article, lien, autres } = ligne
  const age = ageLabel(lien.dateMontage)
  const insuffisant = lien.quantite !== null && article.stock < lien.quantite
  return (
    <div
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (onOpen && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onOpen()
        }
      }}
      className={cn(
        'group p-3 rounded-lg border bg-card shadow-sm transition-colors',
        onOpen && 'cursor-pointer hover:border-accent/40',
        isEditing && editSectionClass,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium tabular-nums min-w-0 truncate">{article.reference}</p>
        <div className="flex items-center gap-1 flex-shrink-0">
          {lien.monte ? (
            <Badge variant="secondary" className="text-[11px]">
              {lien.monte.nom}
            </Badge>
          ) : (
            <span className="text-[11px] text-muted-foreground italic">Constructeur ?</span>
          )}
          {onRetirer && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
              title="Retirer du métier"
              onClick={(e) => {
                e.stopPropagation()
                onRetirer()
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-0.5">
        {lien.dateMontage ? (
          <>
            Monté le {formatHfsqlDate(lien.dateMontage)}
            {age && ` · ${age}`}
          </>
        ) : (
          'Date de montage inconnue'
        )}
      </p>
      <p className="text-xs mt-0.5 flex items-center gap-1.5 flex-wrap">
        {lien.quantite !== null ? (
          <span className="text-muted-foreground">Jeu de {fmtNum(lien.quantite)}</span>
        ) : (
          <span className="text-amber-700">Quantité par jeu à saisir</span>
        )}
        <span className="text-muted-foreground">·</span>
        <span
          className={cn(
            'tabular-nums',
            article.stock <= 0 ? 'text-destructive font-medium' : insuffisant ? 'text-amber-700 font-medium' : 'text-muted-foreground',
          )}
        >
          Stock {fmtNum(article.stock)}
        </span>
      </p>
      {article.commentaire && (
        <p className="text-[11px] text-amber-700 mt-1 line-clamp-2" title={article.commentaire}>
          {article.commentaire}
        </p>
      )}
      {autres.length > 0 && (
        <p className="text-[11px] text-muted-foreground mt-0.5 truncate" title={`Aussi sur ${autres.join(', ')}`}>
          Aussi sur {autres.join(' · ')}
        </p>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════
//  « Changer le jeu » — the set change
// ══════════════════════════════════════════════════════

interface LigneJeu {
  coche: boolean
  constructeur: ChoixConstructeur | null
  quantite: string
}

function JeuDialog({
  open,
  preselection,
  metierLabel,
  groupes,
  constructeurs,
  saving,
  error,
  onClose,
  onSave,
}: {
  open: boolean
  preselection: number[]
  metierLabel: string
  groupes: Groupe[]
  constructeurs: Catalogue['constructeurs']
  saving: boolean
  error: string | null
  onClose: () => void
  onSave: (body: {
    date: string
    commentaire: string | null
    reporterGarniture: boolean
    lignes: { idArticle: number; constructeur: ChoixConstructeur | null; quantite: number }[]
  }) => void
}) {
  const [date, setDate] = useState(todayHf())
  const [commentaire, setCommentaire] = useState('')
  const [reporter, setReporter] = useState(true)
  const [jeu, setJeu] = useState<Record<number, LigneJeu>>({})

  const toutes = useMemo(() => groupes.flatMap((g) => g.lignes), [groupes])

  useEffect(() => {
    if (!open) return
    setDate(todayHf())
    setCommentaire('')
    setReporter(true)
    setJeu(
      Object.fromEntries(
        toutes.map((l) => [
          l.article.id,
          {
            coche: preselection.includes(l.article.id),
            // Default: the constructeur mounted now (a like-for-like change).
            constructeur: l.lien.monte ? { id: l.lien.monte.id } : null,
            quantite: l.lien.quantite !== null ? String(l.lien.quantite) : '',
          },
        ]),
      ),
    )
    // Reset when the dialog opens, not on every catalogue refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const set = (id: number, patch: Partial<LigneJeu>) =>
    setJeu((cur) => ({ ...cur, [id]: { ...cur[id], ...patch } }))

  const cochees = toutes.filter((l) => jeu[l.article.id]?.coche)
  const lignesValides = cochees.map((l) => {
    const s = jeu[l.article.id]
    const q = Number(s.quantite)
    const nouveauVide = s.constructeur !== null && 'nom' in s.constructeur && !s.constructeur.nom.trim()
    return { l, s, q, ok: Number.isInteger(q) && q > 0 && !nouveauVide }
  })
  const valide =
    cochees.length > 0 && lignesValides.every((x) => x.ok) && /^\d{8}$/.test(date) && date <= todayHf()

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl" onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-accent" />
            Changer le jeu — métier {metierLabel}
          </DialogTitle>
        </DialogHeader>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!valide || saving) return
            onSave({
              date,
              commentaire: commentaire.trim() || null,
              reporterGarniture: reporter,
              lignes: lignesValides.map(({ l, s, q }) => ({
                idArticle: l.article.id,
                constructeur: choixValide(s.constructeur),
                quantite: q,
              })),
            })
          }}
        >
          <p className="text-sm text-muted-foreground">
            Cochez les références remplacées. Les quantités sortent du stock à l&apos;enregistrement.
          </p>

          <div className="max-h-[50vh] overflow-y-auto scrollbar-transparent space-y-3 pr-1">
            {groupes.map((g) => (
              <div key={g.key} className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.titre}</p>
                {g.lignes.map((l) => {
                  const s = jeu[l.article.id]
                  if (!s) return null
                  const cId = s.constructeur && 'id' in s.constructeur ? s.constructeur.id : null
                  const dispo = disponible(l.article, cId)
                  const q = Number(s.quantite)
                  const manque = s.coche && q > 0 && q > dispo
                  return (
                    <div
                      key={l.article.id}
                      className={cn(
                        'rounded-lg border p-3 transition-colors',
                        s.coche ? 'border-accent/60 bg-accent/[0.04]' : 'border-border bg-background',
                      )}
                    >
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox checked={s.coche} onCheckedChange={(v) => set(l.article.id, { coche: v })} />
                        <span className="text-sm font-medium tabular-nums">{l.article.reference}</span>
                        <span className="ml-auto text-[11px] text-muted-foreground">
                          {l.lien.monte ? `monté : ${l.lien.monte.nom}` : 'constructeur inconnu'} · stock{' '}
                          {fmtNum(l.article.stock)}
                        </span>
                      </label>
                      {s.coche && (
                        <div className="mt-3 pl-6 space-y-2">
                          <div className="space-y-1">
                            <p className="text-[11px] font-medium text-muted-foreground">Constructeur posé</p>
                            <ConstructeurPicker
                              constructeurs={constructeurs}
                              acceptes={l.article.constructeurs.map((c) => c.id)}
                              value={s.constructeur}
                              onChange={(v) => set(l.article.id, { constructeur: v })}
                              allowNone
                            />
                          </div>
                          <div className="flex items-end gap-3 flex-wrap">
                            <div className="space-y-1">
                              <label className="text-[11px] font-medium text-muted-foreground">Quantité</label>
                              <input
                                type="number"
                                min={1}
                                value={s.quantite}
                                onChange={(e) => set(l.article.id, { quantite: e.target.value })}
                                placeholder={l.lien.quantite === null ? 'à saisir' : undefined}
                                className={cn(inputClass, 'w-32 tabular-nums')}
                              />
                            </div>
                            <p className={cn('text-xs pb-2', manque ? 'text-amber-700' : 'text-muted-foreground')}>
                              {manque ? (
                                <span className="inline-flex items-center gap-1">
                                  <AlertTriangle className="h-3.5 w-3.5" />
                                  Disponible {fmtNum(dispo)} : le stock passera à {fmtNum(dispo - q)} — un inventaire
                                  le corrigera.
                                </span>
                              ) : (
                                `Disponible ${fmtNum(dispo)}`
                              )}
                            </p>
                          </div>
                          {l.lien.quantite === null && (
                            <p className="text-[11px] text-muted-foreground">
                              Cette quantité deviendra celle du jeu de ce métier.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[10rem_minmax(0,1fr)] gap-3 pt-3 border-t border-border/60">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Date</label>
              <input
                type="date"
                value={hfsqlDateToInput(date)}
                max={hfsqlDateToInput(todayHf())}
                onChange={(e) => setDate(inputDateToHfsql(e.target.value))}
                className={inputClass}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Commentaire</label>
              <input
                type="text"
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
                placeholder="Facultatif"
                maxLength={1000}
                className={inputClass}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={reporter} onCheckedChange={setReporter} />
            Reporter la date sur « Changement des aiguilles » (garniture)
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="mt-4 gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Annuler
            </Button>
            <Button type="submit" disabled={!valide || saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Enregistrer{cochees.length > 0 ? ` (${cochees.length})` : ''}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ══════════════════════════════════════════════════════
//  Edit mode — the quantity per montage on this métier
// ══════════════════════════════════════════════════════

function LienDialog({
  ligne,
  metierLabel,
  saving,
  error,
  onClose,
  onSave,
}: {
  ligne: Ligne | null
  metierLabel: string
  saving: boolean
  error: string | null
  onClose: () => void
  onSave: (quantite: number | null) => void
}) {
  const [quantite, setQuantite] = useState('')
  useEffect(() => {
    if (ligne) setQuantite(ligne.lien.quantite !== null ? String(ligne.lien.quantite) : '')
    // Reset per card opened, not per refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ligne?.article.id])
  const q = quantite.trim() === '' ? null : Number(quantite)
  const valide = q === null || (Number.isInteger(q) && q > 0)

  return (
    <Dialog open={ligne !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pin className="h-5 w-5 text-accent" />
            {ligne?.article.reference}
          </DialogTitle>
        </DialogHeader>
        {ligne && (
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (valide && !saving) onSave(q)
            }}
          >
            <p className="text-sm text-muted-foreground">
              Métier {metierLabel}
              {ligne.article.position && ` · ${POSITION_LABEL[ligne.article.position]}`}
            </p>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Quantité par jeu sur ce métier</label>
              <input
                type="number"
                min={1}
                autoFocus
                value={quantite}
                onChange={(e) => setQuantite(e.target.value)}
                placeholder="Nombre d'aiguilles"
                className={cn(inputClass, 'tabular-nums')}
              />
              <p className="text-[11px] text-muted-foreground">Pré-remplie à chaque changement de jeu.</p>
            </div>
            <Link
              to={`/fournitures/references?id=${ligne.article.id}`}
              className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Modifier la référence dans Fournitures › Références
            </Link>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter className="mt-4 gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                Annuler
              </Button>
              <Button type="submit" disabled={!valide || saving}>
                {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                Enregistrer
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ══════════════════════════════════════════════════════
//  Edit mode — add a reference to the métier
// ══════════════════════════════════════════════════════

function AjoutDialog({
  open,
  metierId,
  metierLabel,
  articles,
  idType,
  saving,
  error,
  onClose,
  onSave,
}: {
  open: boolean
  metierId: number
  metierLabel: string
  articles: Article[]
  idType: number | null
  saving: boolean
  error: string | null
  onClose: () => void
  onSave: (body: { idArticle: number } | { reference: string; idType: number; position: Position | null }) => void
}) {
  const [articleId, setArticleId] = useState(0)
  const [nouvelle, setNouvelle] = useState('')
  const [position, setPosition] = useState<Position | null>(null)

  useEffect(() => {
    if (!open) return
    setArticleId(0)
    setNouvelle('')
    setPosition(null)
  }, [open])

  const disponibles = useMemo(() => articles.filter((a) => !a.metiers.some((m) => m.id === metierId)), [articles, metierId])
  const valide = articleId > 0 || (nouvelle.trim() !== '' && idType !== null)

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-accent" />
            Ajouter une référence
          </DialogTitle>
        </DialogHeader>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!valide || saving) return
            onSave(
              articleId > 0 ? { idArticle: articleId } : { reference: nouvelle.trim(), idType: idType!, position },
            )
          }}
        >
          <p className="text-sm text-muted-foreground">Métier {metierLabel}</p>
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Référence existante</label>
            <SearchableCombobox
              options={disponibles}
              value={articleId}
              onChange={(id) => {
                setArticleId(id)
                if (id > 0) setNouvelle('')
              }}
              getId={(a) => a.id}
              getPrimary={(a) => a.reference}
              getSecondary={(a) =>
                [a.position ? POSITION_LABEL[a.position] : null, a.metiers.map((m) => m.emplacement).join(' ') || 'sur aucun métier']
                  .filter(Boolean)
                  .join(' · ')
              }
              placeholder="Rechercher une référence…"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Ou une nouvelle référence</label>
            <input
              type="text"
              value={nouvelle}
              onChange={(e) => {
                setNouvelle(e.target.value)
                if (e.target.value.trim()) setArticleId(0)
              }}
              placeholder="Vo LS 83.41 G003"
              maxLength={100}
              className={inputClass}
            />
          </div>
          {nouvelle.trim() !== '' && (
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground">Position</p>
              <div className="flex gap-2">
                {(['cylindre', 'plateau'] as const).map((p) => (
                  <ConstructeurChip
                    key={p}
                    label={POSITION_LABEL[p]}
                    active={position === p}
                    onClick={() => setPosition(position === p ? null : p)}
                  />
                ))}
              </div>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="mt-4 gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Annuler
            </Button>
            <Button type="submit" disabled={!valide || saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Ajouter
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
