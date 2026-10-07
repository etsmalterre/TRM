// Fournitures (LIVA #1263) — what the three Fournitures screens and the
// Aiguilles tab of Atelier › Maintenance share: the API payload types, the one
// catalogue query, and small helpers. API: /api/fournitures-trm (MPS API,
// routes/fournitures-trm.ts).

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

// ── Payload types ──────────────────────────────────────

export interface FournitureType {
  id: number
  nom: string
  /** The article sits on the cylindre or the plateau (aiguilles). */
  avecPosition: boolean
}

export interface Constructeur {
  id: number
  nom: string
}

export type Position = 'cylindre' | 'plateau'

export interface ArticleMetier {
  id: number
  emplacement: string
  rang: number
  /** Quantity a montage of this reference takes on this métier (null = not typed yet). */
  quantite: number | null
  monte: Constructeur | null
  dateMontage: string | null
}

/** One stock line: an article × a constructeur. The API lists every accepted
 *  constructeur and every one that ever moved (even at 0), plus « non
 *  précisé » while it holds something. */
export interface SeauStock {
  /** null = stock not split by constructeur. */
  constructeur: Constructeur | null
  stock: number
  /** Entries received per calendar year for this constructeur. */
  commandesParAnnee: Record<string, number>
  dernierMouvement: string | null
}

export interface Article {
  id: number
  idType: number
  type: string
  reference: string
  position: Position | null
  commentaire: string | null
  archive: boolean
  /** Constructeurs accepted for this reference. */
  constructeurs: Constructeur[]
  /** Métiers that take it. */
  metiers: ArticleMetier[]
  stock: number
  stockParConstructeur: SeauStock[]
  /** Orders received per calendar year ('2025' → 750). */
  commandesParAnnee: Record<string, number>
  dernierMouvement: string | null
}

export interface FournisseurRef {
  id: number
  nom: string
  types: number[]
}

export interface Catalogue {
  types: FournitureType[]
  constructeurs: Constructeur[]
  fournisseurs: FournisseurRef[]
  articles: Article[]
}

export interface Mouvement {
  id: number
  type: 'entree' | 'sortie' | 'inventaire'
  libelle: string
  quantite: number
  date: string | null
  constructeur: string | null
  fournisseur: string | null
  metier: string | null
  montage: number | null
  commentaire: string | null
  saisiPar: string | null
}

/** An existing constructeur, or a new one typed by name (created by the API). */
export type ChoixConstructeur = { id: number } | { nom: string }

// ── Query ──────────────────────────────────────────────

export const CATALOGUE_KEY = ['fournitures-trm-catalogue'] as const

/** The whole catalogue (~60 articles) — one query for every screen. Every
 *  write answers with a fresh catalogue: put it in the cache with
 *  `useSetCatalogue()` rather than refetching. */
export function useCatalogue(avecArchives = false) {
  return useQuery<Catalogue>({
    queryKey: avecArchives ? [...CATALOGUE_KEY, 'archives'] : CATALOGUE_KEY,
    queryFn: () => apiFetch(`/fournitures-trm/catalogue${avecArchives ? '?archives=1' : ''}`),
  })
}

/** Writes answer with the catalogue: store it, and drop the archived variant
 *  and the per-article movement lists so they refetch. */
export function useSetCatalogue() {
  const queryClient = useQueryClient()
  return (cat: Partial<Catalogue> | undefined) => {
    if (cat && Array.isArray(cat.articles)) {
      queryClient.setQueryData(CATALOGUE_KEY, {
        types: cat.types ?? [],
        constructeurs: cat.constructeurs ?? [],
        fournisseurs: cat.fournisseurs ?? [],
        articles: cat.articles,
      })
    } else {
      queryClient.invalidateQueries({ queryKey: CATALOGUE_KEY, exact: true })
    }
    queryClient.invalidateQueries({ queryKey: [...CATALOGUE_KEY, 'archives'] })
    queryClient.invalidateQueries({ queryKey: ['fournitures-trm-mouvements'] })
    queryClient.invalidateQueries({ queryKey: ['fournitures-trm-fournisseurs'] })
  }
}

// ── Helpers ────────────────────────────────────────────

export const POSITION_LABEL: Record<Position, string> = { cylindre: 'Cylindre', plateau: 'Plateau' }

export function todayHf(): string {
  const d = new Date()
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
}

/** « il y a 3 mois » from an HFSQL date — derived, never stored. */
export function ageLabel(hf: string | null): string | null {
  if (!hf || !/^\d{8}$/.test(hf)) return null
  const now = new Date()
  let months = (now.getFullYear() - Number(hf.slice(0, 4))) * 12 + (now.getMonth() + 1 - Number(hf.slice(4, 6)))
  if (now.getDate() < Number(hf.slice(6, 8))) months -= 1
  if (months < 0) return null
  if (months === 0) return 'ce mois-ci'
  if (months < 24) return `il y a ${months} mois`
  return `il y a ${Math.floor(months / 12)} ans`
}

/** The API's French message on a refused write, else the fallback. */
export function apiErrorMessage(e: unknown, fallback: string): string {
  const body = (e as { body?: { message?: string } } | null)?.body
  return body?.message ?? fallback
}

/** Stock colour: red when negative or empty, amber below one montage of the
 *  biggest quantity a métier takes, neutral otherwise. */
export function etatStock(a: Pick<Article, 'stock' | 'metiers'>): 'vide' | 'bas' | 'ok' {
  if (a.stock <= 0) return 'vide'
  const besoin = Math.max(0, ...a.metiers.map((m) => m.quantite ?? 0))
  return besoin > 0 && a.stock < besoin ? 'bas' : 'ok'
}
