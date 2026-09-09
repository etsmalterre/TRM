// Wire types + fetchers for /api/atelier. One place, so a payload change is a
// one-file edit and the screens never hand-roll a fetch (CLAUDE.md § React
// rules: always through the shared apiFetch, which sets credentials).
import { apiFetch } from './api'

export interface Bonnetier {
  IDbonnetier: number
  prenom: string
  nom: string
  regleur: number
}

export interface MachineOf {
  IDordre_fabrication: number
  reference: string
  coloris: string
  nb_pieces: number
  produites: number
  finir_fil: boolean
  poids_piece: number
  a_consigne: boolean
  demarre: boolean
  interrompu: boolean
}

/** The régleur build's tile decorations (legacy FEN_Choix_Metier, Appli_Regleur):
 *  present only when the list was fetched with `regleur=1`, and only on a
 *  métier that has an OF. `pct_defaut` is zeroed by the server when there is
 *  no alert, exactly as the legacy tile does. */
export interface MachineRegleur {
  etat: 'reglage' | 'pause' | 'marche'
  alerte: boolean
  /** Second-choice weight ratio over the recent rolls of the article (0–1). */
  pct_defaut: number
  /** Unexplained stops per hour over the last 24 h (or since the OF started). */
  freq_arret: number
  /** A `ref_ecru_machine` sheet exists for this reference on this métier —
   *  the legacy refuses to open the réglage screen otherwise. */
  eligible: boolean
}

export interface Machine {
  IDmachine: number
  /** `machine.emplacement` — the code painted on the workshop floor. */
  label: string
  nom: string
  emplacement: string
  /** The legacy's « Machines Actives » list: an OF that still owes pieces, or
   *  one running until the yarn is gone. */
  actif: boolean
  of: MachineOf | null
  regleur: MachineRegleur | null
}

export interface ReglageRepere {
  tour: number
  lfa_precedente: string
  lfa: string
  repere: string
}

/** The setup sheet a régleur reads before « Lancer OF » (legacy FEN_Reglage_Machine). */
export interface ReglageMachine {
  IDordre_fabrication: number
  IDmachine: number
  machine: string
  reference: string
  coloris: string
  demarre: boolean
  termine: boolean
  eligible: boolean
  consigne: string
  reperes: ReglageRepere[]
  reglages: {
    hauteur_pl: string
    abattage: string
    nb_chutes: number
    compteur: number | null
    ecarteur: number
    poids_piece: number
    maille_ouverture: boolean
    tombe_metier: string
    ouvert_visiteuse: boolean
  }
  fils: string[]
}

export interface MessageOf {
  id: number
  observation: string
  IDbonnetier: number
  prenom: string
  date_ms: number | null
}

export interface DerniereAction {
  evenement: string
  detail: string
  date_ms: number | null
  IDbonnetier: number
}

export interface OfContexte {
  IDordre_fabrication: number
  IDmachine: number
  machine: string
  reference: string
  coloris: string
  nb_pieces: number
  produites: number
  finir_fil: boolean
  poids_piece: number
  consigne: string
  demarre: boolean
  interrompu: boolean
  nb_nettoyages_requis: number
  nb_nettoyages_faits: number
  nb_messages: number
  auto_activation: boolean
  piece_en_cours: {
    numero_affiche: number
    IDpiece_production: number
    numero: number
    terminee: boolean
  }
  compteur: number | null
  derniere_action: DerniereAction | null
}

export interface TypeDefaut {
  type: string
  unite: 'cm' | 'nb'
}
export interface TailleDefaut {
  label: string
  taille_cm: number
}
export interface LookupsDefauts {
  types: TypeDefaut[]
  tailles: TailleDefaut[]
}

export interface SaisiePayload {
  action: string
  IDbonnetier: number
  appareil?: string
  defaut?: { type: string; taille?: number }
}

export interface SaisieResultat {
  ok: true
  /** What actually landed, in order. The commit path has no transaction, so a
   *  partial failure has to be reportable rather than a bare 500. */
  ecrits: string[]
  contexte: OfContexte
}

export const fetchBonnetiers = (regleur = false) =>
  apiFetch<Bonnetier[]>(`/atelier/bonnetiers?regleur=${regleur ? 1 : 0}`)

/** The defect vocabulary is served, not duplicated here: it is the legacy
 *  window's own combo content and the API validates against the same list. */
export const fetchLookupsDefauts = () => apiFetch<LookupsDefauts>('/atelier/lookups/defauts')

export const posterEvenement = (ofId: number, body: SaisiePayload) =>
  apiFetch<SaisieResultat>(`/atelier/of/${ofId}/evenement`, {
    method: 'POST',
    body: JSON.stringify(body),
  })

/** `regleur=1` asks for the régleur tile decorations (state, alert, stop
 *  frequency, eligibility) — bounded extra reads the bonnetier list skips. */
export const fetchMachines = (regleur = false) =>
  apiFetch<Machine[]>(`/atelier/machines${regleur ? '?regleur=1' : ''}`)

export const fetchOf = (id: number) => apiFetch<OfContexte>(`/atelier/of/${id}`)

export const fetchReglage = (ofId: number) => apiFetch<ReglageMachine>(`/atelier/of/${ofId}/reglage`)

export const fetchMessages = (ofId: number) => apiFetch<MessageOf[]>(`/atelier/of/${ofId}/messages`)

export const posterMessage = (ofId: number, body: { IDbonnetier: number; observation: string }) =>
  apiFetch<{ id: number }>(`/atelier/of/${ofId}/messages`, {
    method: 'POST',
    body: JSON.stringify(body),
  })

export const supprimerMessage = (ofId: number, msgId: number, IDbonnetier: number) =>
  apiFetch<void>(`/atelier/of/${ofId}/messages/${msgId}`, {
    method: 'DELETE',
    body: JSON.stringify({ IDbonnetier }),
  })

/** Régleur-only on the server (the named bonnetier must carry `regleur = 1`). */
export const ecrireConsigne = (ofId: number, body: { IDbonnetier: number; consigne: string }) =>
  apiFetch<{ ok: true; consigne: string }>(`/atelier/of/${ofId}/consigne`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })

/** Progression label, in the legacy's exact wording.
 *
 *  LIB_Progression (FEN_Action_Machine, and the same code copy-pasted into
 *  FEN_Consigne / FEN_Fils_OF / FEN_Information):
 *    si finir_fil alors  "<total> / ~<nb_pieces> (Finir le fil)"
 *    sinon               "<total> / <nb_pieces> pièces"
 *
 *  The tilde is load-bearing: on a "finir le fil" OF the target is an estimate,
 *  and the count routinely passes it (3C is at 148 of 134). */
export function progression(of: { produites: number; nb_pieces: number; finir_fil: boolean }): string {
  return of.finir_fil
    ? `${of.produites} / ~${of.nb_pieces} (Finir le fil)`
    : `${of.produites} / ${of.nb_pieces} pièces`
}
