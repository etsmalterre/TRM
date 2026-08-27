// Who is standing at this phone.
//
// §45.4 of the design system: identification is a GATE, not a field — ask
// before letting anyone key anything, keep the answer per device, and always
// show a photo beside the name, because at a shared station the photo is the
// only real check that the name on tonight's output is the right one.
//
// The legacy does exactly this with `SauveParamètre("IDBonnetier", …)`: pick
// your face once, and every later launch skips straight to the métier list.
// Tapping the avatar clears it, behind the legacy's own confirmation
// (« Confirmez-vous vouloir quitter votre poste » / « Pointage »).
//
// ⚠️ This is NOT authentication and must never be treated as such. It is the
// same trust model the workshop already runs on — you pick your own face. The
// privileged half (régleur) gets device enrolment and a real cookie; that work
// is separate and is why this context deliberately holds no token.
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

export interface Identite {
  id: number
  prenom: string
  nom: string
  /** True when picked from the régleur grid. Presentation only for now — the
   *  server grants nothing on the strength of it. */
  regleur: boolean
}

const STORAGE_KEY = 'atelier.identite'

interface Ctx {
  identite: Identite | null
  choisir: (i: Identite) => void
  quitter: () => void
}

const BonnetierContext = createContext<Ctx | null>(null)

function lire(): Identite | null {
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
      regleur: Boolean(p.regleur),
    }
  } catch {
    return null
  }
}

export function BonnetierProvider({ children }: { children: ReactNode }) {
  // Read synchronously on mount, never in an effect: a default of `null`
  // settled later would flash the picker at every launch on a phone that
  // already knows who is holding it.
  const [identite, setIdentite] = useState<Identite | null>(lire)

  const choisir = useCallback((i: Identite) => {
    setIdentite(i)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(i))
    } catch {
      // Private mode / storage disabled: the session still works, it just
      // asks again next launch. Never let this throw into a click handler.
    }
  }, [])

  const quitter = useCallback(() => {
    setIdentite(null)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* see above */
    }
  }, [])

  return (
    <BonnetierContext.Provider value={{ identite, choisir, quitter }}>
      {children}
    </BonnetierContext.Provider>
  )
}

export function useIdentite(): Ctx {
  const ctx = useContext(BonnetierContext)
  if (!ctx) throw new Error('useIdentite must be used inside <BonnetierProvider>')
  return ctx
}
