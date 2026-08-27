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

export const fetchBonnetiers = (regleur = false) =>
  apiFetch<Bonnetier[]>(`/atelier/bonnetiers?regleur=${regleur ? 1 : 0}`)

export const fetchMachines = () => apiFetch<Machine[]>('/atelier/machines')

export const fetchOf = (id: number) => apiFetch<OfContexte>(`/atelier/of/${id}`)

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
