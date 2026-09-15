// Who is standing at this phone — and whose phone it is.
//
// Two layers, two trust models:
//
// 1. THE PHONE (`appareil`) — an enrolled device, resolved by the server from
//    its own cookie (`GET /atelier/appareils/moi`, lib/appareils-atelier.ts on
//    the API). This is the real identity: the cookie is a secret the server
//    issued once against a code typed in Paramètres › Utilisateurs, and the
//    server refuses every write from a phone it does not know. A RÉGLEUR's
//    phone carries a fixed identity (`appareil.bonnetier`): the app opens as
//    him, with the régleur screens, and there is no face grid and no
//    « Quitter » — the legacy did the same by matching the ANDROID_ID.
//
// 2. THE PERSON (`identite`) on a shared phone — §45.4 of the design system:
//    identification is a GATE, not a field. Pick your face once, kept per
//    device, always shown as a photo beside the name. The legacy does exactly
//    this with `SauveParamètre("IDBonnetier", …)`. ⚠️ This is NOT
//    authentication: it is the workshop's trust model, and the grid only ever
//    offers non-régleurs — the server enforces the same rule on every write.
//
// The phone's answer is mirrored in localStorage so a cold launch on a
// dropped connection still opens on the right screens; the poll
// (POLL_MS, main.tsx) picks up a revocation within seconds.
import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchAppareil, type Appareil } from '@/lib/atelier-api'

export interface Identite {
  id: number
  prenom: string
  nom: string
  /** True only for a fixed identity (an enrolled régleur's phone). A face
   *  picked on the shared grid is never a régleur. */
  regleur: boolean
}

const STORAGE_KEY = 'atelier.identite'
const APPAREIL_KEY = 'atelier.appareil'
export const APPAREIL_QUERY_KEY = ['atelier', 'appareil'] as const

interface Ctx {
  identite: Identite | null
  /** undefined = not known yet (first launch, waiting on the server);
   *  null = not enrolled (or revoked). */
  appareil: Appareil | null | undefined
  /** The identity comes from the phone itself: no picking, no leaving. */
  fixe: boolean
  choisir: (i: Identite) => void
  quitter: () => void
}

const BonnetierContext = createContext<Ctx | null>(null)

function lireIdentite(): Identite | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as Partial<Identite>
    // Defensive: a half-written or older-shape entry must not wedge the app on
    // a screen that can no longer be left.
    if (typeof p?.id !== 'number' || p.id <= 0) return null
    return {
      id: p.id,
      prenom: String(p.prenom ?? ''),
      nom: String(p.nom ?? ''),
      // A régleur no longer comes from the grid; an entry written by the
      // pre-enrolment build (the dev switch) is demoted, never trusted.
      regleur: false,
    }
  } catch {
    return null
  }
}

/** The last answer the server gave about this phone, or undefined when it
 *  has never answered (a genuinely new phone). */
function lireAppareil(): Appareil | null | undefined {
  try {
    const raw = localStorage.getItem(APPAREIL_KEY)
    if (raw === null) return undefined
    if (raw === 'null') return null
    const p = JSON.parse(raw) as Partial<Appareil>
    if (typeof p?.id !== 'number') return undefined
    return {
      id: p.id,
      libelle: String(p.libelle ?? ''),
      IDutilisateur: Number(p.IDutilisateur ?? 0),
      bonnetier: p.bonnetier ?? null,
    }
  } catch {
    return undefined
  }
}

function ecrireAppareil(a: Appareil | null): void {
  try {
    localStorage.setItem(APPAREIL_KEY, JSON.stringify(a))
  } catch {
    /* private mode / storage disabled — the server is asked again next launch */
  }
}

export function BonnetierProvider({ children }: { children: ReactNode }) {
  // Read synchronously on mount, never in an effect: a default of `null`
  // settled later would flash the picker at every launch on a phone that
  // already knows who is holding it.
  const [choisie, setChoisie] = useState<Identite | null>(lireIdentite)
  const [cache, setCache] = useState<Appareil | null | undefined>(lireAppareil)

  // The phone asks the server who it is, and keeps asking on the app's poll:
  // a revoked phone drops back to the grid within seconds, and `vuLe` on the
  // server stays honest. A network error keeps the last answer.
  const query = useQuery({
    queryKey: APPAREIL_QUERY_KEY,
    queryFn: fetchAppareil,
  })
  const data = query.data
  useEffect(() => {
    if (data === undefined) return
    setCache(data)
    ecrireAppareil(data)
  }, [data])

  // While the server has never answered (a new phone, first launch) the
  // answer is unknown; once it has, or if it cannot be reached, fall back to
  // the mirror — and to « not enrolled » when there is no mirror at all,
  // so an offline first launch still shows the grid rather than a splash.
  const appareil: Appareil | null | undefined =
    data !== undefined ? data : query.isError ? (cache ?? null) : cache

  const fixe = !!appareil?.bonnetier
  const identite = useMemo<Identite | null>(() => {
    const b = appareil?.bonnetier
    if (b) return { id: b.IDbonnetier, prenom: b.prenom, nom: b.nom, regleur: true }
    return choisie
  }, [appareil, choisie])

  const choisir = useCallback((i: Identite) => {
    const safe = { ...i, regleur: false }
    setChoisie(safe)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(safe))
    } catch {
      // Private mode / storage disabled: the session still works, it just
      // asks again next launch. Never let this throw into a click handler.
    }
  }, [])

  const quitter = useCallback(() => {
    setChoisie(null)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* see above */
    }
  }, [])

  return (
    <BonnetierContext.Provider value={{ identite, appareil, fixe, choisir, quitter }}>
      {children}
    </BonnetierContext.Provider>
  )
}

export function useIdentite(): Ctx {
  const ctx = useContext(BonnetierContext)
  if (!ctx) throw new Error('useIdentite must be used inside <BonnetierProvider>')
  return ctx
}

/** After a successful enrolment: make the provider re-read the phone now
 *  rather than at the next poll tick. */
export function useRafraichirAppareil(): () => Promise<void> {
  const qc = useQueryClient()
  return useCallback(async () => {
    await qc.invalidateQueries({ queryKey: APPAREIL_QUERY_KEY })
  }, [qc])
}
