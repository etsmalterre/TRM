// Fournitures › Stock (LIVA #1263) — the two stock writes of the screen:
//  - « Entrée de stock »: an order received (article, constructeur or « Non
//    précisé », quantity, date, supplier, comment);
//  - « Inventaire »: a count of one bucket (one constructeur, or the stock not
//    split by constructeur). The user types what they COUNTED; the API writes
//    the correction (counted − current), and nothing when it was already right.
// Both POST /fournitures-trm/mouvements and answer with the fresh catalogue.

import { useEffect, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ClipboardCheck, Loader2, PackagePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PopoverSelect, SearchableCombobox } from '@/components/ui/popover-select'
import { ConstructeurPicker, choixValide } from '@/components/fournitures/ConstructeurPicker'
import { apiFetch } from '@/lib/api'
import { hfsqlDateToInput, inputDateToHfsql } from '@/lib/dates'
import { fmtNum } from '@/lib/format'
import {
  apiErrorMessage,
  todayHf,
  type Article,
  type Catalogue,
  type ChoixConstructeur,
} from '@/lib/fournitures'
import { cn } from '@/lib/utils'

const inputClass =
  'w-full h-9 px-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring'

type MouvementResponse = Partial<Catalogue> & { ecrit?: boolean }

/** Secondary line of an article in the picker: « Aiguille · 2A 2B ». */
function articleSecondary(a: Article): string {
  return [a.type, a.metiers.map((m) => m.emplacement).join(' ')].filter(Boolean).join(' · ')
}

// ══════════════════════════════════════════════════════
//  Entrée de stock
// ══════════════════════════════════════════════════════

export function EntreeStockDialog({
  open,
  onOpenChange,
  catalogue,
  articleId,
  idConstructeur = null,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  catalogue: Catalogue | undefined
  /** Fixed article (opened from the drawer); null = pick it in the dialog. */
  articleId: number | null
  /** Constructeur pre-selected (the stock line the drawer was opened on). */
  idConstructeur?: number | null
  /** Called with the API answer, the article and the constructeur id (null =
   *  non précisé or a new one) the entry was for. */
  onDone: (res: MouvementResponse, idArticle: number, idConstructeur: number | null) => void
}) {
  const [idArticle, setIdArticle] = useState(0)
  const [constructeur, setConstructeur] = useState<ChoixConstructeur | null>(null)
  const [quantite, setQuantite] = useState('')
  const [date, setDate] = useState(todayHf())
  const [idFournisseur, setIdFournisseur] = useState(0)
  const [commentaire, setCommentaire] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setIdArticle(articleId ?? 0)
    setConstructeur(articleId !== null && idConstructeur !== null ? { id: idConstructeur } : null)
    setQuantite('')
    setDate(todayHf())
    setIdFournisseur(0)
    setCommentaire('')
    setError(null)
  }, [open, articleId, idConstructeur])

  const articles = catalogue?.articles ?? []
  const article = articles.find((a) => a.id === idArticle) ?? null

  // The article's suppliers first (those declared for its type), then the rest.
  const fournisseurOptions = useMemo(() => {
    const list = catalogue?.fournisseurs ?? []
    const duType = (f: { types: number[] }) => (article ? f.types.includes(article.idType) : false)
    return [...list]
      .sort((a, b) => Number(duType(b)) - Number(duType(a)) || a.nom.localeCompare(b.nom, 'fr'))
      .map((f) => ({ id: f.id, primary: f.nom, secondary: article && !duType(f) ? 'autre type' : undefined }))
  }, [catalogue, article])

  const qte = Number(quantite)
  const choix = constructeur === null ? null : choixValide(constructeur)
  const constructeurOk = constructeur === null || choix !== null
  const valide =
    idArticle > 0 && Number.isInteger(qte) && qte > 0 && constructeurOk && /^\d{8}$/.test(date) && date <= todayHf()

  const mut = useMutation({
    mutationFn: () =>
      apiFetch<MouvementResponse>('/fournitures-trm/mouvements', {
        method: 'POST',
        body: JSON.stringify({
          idArticle,
          type: 'entree',
          constructeur: choix,
          quantite: qte,
          date,
          idFournisseur: idFournisseur > 0 ? idFournisseur : null,
          commentaire: commentaire.trim() || null,
        }),
      }),
    onSuccess: (res) => {
      // A constructeur typed by name was just created: find its id by name.
      const idC =
        choix === null
          ? null
          : 'id' in choix
            ? choix.id
            : (res.constructeurs?.find((c) => c.nom.toLowerCase() === choix.nom.trim().toLowerCase())?.id ?? null)
      onDone(res, idArticle, idC)
      onOpenChange(false)
    },
    onError: (e) => setError(apiErrorMessage(e, "L'enregistrement a échoué. Réessayez.")),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto" onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5 text-accent" />
            Entrée de stock
          </DialogTitle>
        </DialogHeader>

        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (valide && !mut.isPending) mut.mutate()
          }}
        >
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Référence</label>
            {articleId !== null && article ? (
              <p className="text-sm">
                <span className="font-medium tabular-nums">{article.reference}</span>
                <span className="text-muted-foreground"> · {article.type}</span>
              </p>
            ) : (
              <SearchableCombobox<Article>
                options={articles}
                value={idArticle}
                onChange={(id) => {
                  setIdArticle(id)
                  setConstructeur(null)
                }}
                getId={(a) => a.id}
                getPrimary={(a) => a.reference}
                getSecondary={articleSecondary}
                placeholder="Rechercher une référence…"
              />
            )}
          </div>

          {article && (
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground">Constructeur</p>
              <ConstructeurPicker
                constructeurs={catalogue?.constructeurs ?? []}
                acceptes={article.constructeurs.map((c) => c.id)}
                value={constructeur}
                onChange={setConstructeur}
                allowNone
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Quantité reçue</label>
              <input
                type="number"
                min={1}
                step={1}
                value={quantite}
                onChange={(e) => setQuantite(e.target.value)}
                className={cn(inputClass, 'tabular-nums')}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Date de réception</label>
              <input
                type="date"
                value={hfsqlDateToInput(date)}
                max={hfsqlDateToInput(todayHf())}
                onChange={(e) => setDate(inputDateToHfsql(e.target.value))}
                className={inputClass}
              />
            </div>
            <div className="space-y-1 col-span-full">
              <label className="text-[11px] font-medium text-muted-foreground">Fournisseur</label>
              <PopoverSelect
                options={fournisseurOptions}
                value={idFournisseur}
                onChange={setIdFournisseur}
                emptyLabel="— non précisé —"
              />
            </div>
            <div className="space-y-1 col-span-full">
              <label className="text-[11px] font-medium text-muted-foreground">Commentaire</label>
              <input
                type="text"
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
                placeholder="N° de commande, bon de livraison… (facultatif)"
                maxLength={1000}
                className={inputClass}
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="mt-4 gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
              Annuler
            </Button>
            <Button type="submit" disabled={!valide || mut.isPending}>
              {mut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ══════════════════════════════════════════════════════
//  Inventaire
// ══════════════════════════════════════════════════════

export function InventaireDialog({
  open,
  onOpenChange,
  catalogue,
  article,
  idConstructeur = null,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  catalogue: Catalogue | undefined
  article: Article | null
  /** Bucket pre-selected (the stock line the drawer was opened on). */
  idConstructeur?: number | null
  onDone: (res: MouvementResponse) => void
}) {
  const [constructeur, setConstructeur] = useState<ChoixConstructeur | null>(null)
  const [compte, setCompte] = useState('')
  const [date, setDate] = useState(todayHf())
  const [commentaire, setCommentaire] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setConstructeur(idConstructeur !== null ? { id: idConstructeur } : null)
    setCompte('')
    setDate(todayHf())
    setCommentaire('')
    setError(null)
    setInfo(null)
  }, [open, article?.id, idConstructeur])

  const choix = constructeur === null ? null : choixValide(constructeur)
  // Current stock of the chosen bucket (a new constructeur has none yet).
  const actuel = useMemo(() => {
    if (!article) return 0
    if (constructeur !== null && 'nom' in constructeur) return 0
    const id = constructeur === null ? null : constructeur.id
    return article.stockParConstructeur.find((s) => (s.constructeur?.id ?? null) === id)?.stock ?? 0
  }, [article, constructeur])

  const n = Number(compte)
  const compteOk = compte.trim() !== '' && Number.isInteger(n) && n >= 0
  const correction = compteOk ? n - actuel : null
  const valide =
    !!article && compteOk && (constructeur === null || choix !== null) && /^\d{8}$/.test(date) && date <= todayHf()

  const mut = useMutation({
    mutationFn: () =>
      apiFetch<MouvementResponse>('/fournitures-trm/mouvements', {
        method: 'POST',
        body: JSON.stringify({
          idArticle: article!.id,
          type: 'inventaire',
          constructeur: choix,
          quantite: n,
          date,
          commentaire: commentaire.trim() || null,
        }),
      }),
    onSuccess: (res) => {
      onDone(res)
      if (res?.ecrit === false) {
        setInfo('Rien à corriger : le stock était déjà juste.')
        return
      }
      onOpenChange(false)
    },
    onError: (e) => setError(apiErrorMessage(e, "L'enregistrement a échoué. Réessayez.")),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto" onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-accent" />
            Inventaire
          </DialogTitle>
        </DialogHeader>

        {article && (
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (valide && !mut.isPending) {
                setError(null)
                setInfo(null)
                mut.mutate()
              }
            }}
          >
            <p className="text-sm">
              <span className="font-medium tabular-nums">{article.reference}</span>
              <span className="text-muted-foreground"> · {article.type}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Saisissez la quantité comptée : la correction du stock est calculée et enregistrée comme un mouvement
              d&apos;inventaire.
            </p>

            <div className="space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground">Constructeur compté</p>
              <ConstructeurPicker
                constructeurs={catalogue?.constructeurs ?? []}
                acceptes={article.constructeurs.map((c) => c.id)}
                value={constructeur}
                onChange={(v) => {
                  setConstructeur(v)
                  setInfo(null)
                }}
                allowNone
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">Quantité comptée</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  autoFocus
                  value={compte}
                  onChange={(e) => {
                    setCompte(e.target.value)
                    setInfo(null)
                  }}
                  className={cn(inputClass, 'tabular-nums')}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">Date du comptage</label>
                <input
                  type="date"
                  value={hfsqlDateToInput(date)}
                  max={hfsqlDateToInput(todayHf())}
                  onChange={(e) => setDate(inputDateToHfsql(e.target.value))}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="rounded-md border border-border/60 bg-zinc-100/80 px-3 py-2 text-sm space-y-0.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-muted-foreground">Stock enregistré</span>
                <span className={cn('tabular-nums', actuel < 0 && 'text-destructive font-medium')}>{fmtNum(actuel)}</span>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-muted-foreground">Correction</span>
                <span
                  className={cn(
                    'tabular-nums font-medium',
                    correction !== null && correction > 0 && 'text-green-700',
                    correction !== null && correction < 0 && 'text-destructive',
                  )}
                >
                  {correction === null ? '—' : `${correction > 0 ? '+' : ''}${fmtNum(correction)}`}
                </span>
              </div>
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

            {info && <p className="text-sm text-green-700">{info}</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter className="mt-4 gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
                {info ? 'Fermer' : 'Annuler'}
              </Button>
              <Button type="submit" disabled={!valide || mut.isPending}>
                {mut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                Enregistrer
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
