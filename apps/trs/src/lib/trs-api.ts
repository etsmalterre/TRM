// Wire types + fetcher for GET /api/trs/atelier. One place, so a payload
// change is a one-file edit. The server shape is `TrsMachine` in
// ETM/apps/api/src/routes/trs.ts — keep the two in step.
import { apiFetch } from './api'

export interface TrsOf {
  id: number
  reference: string
  coloris: string
  /** `ordre_fabrication.vitesse` — the recorder's running average, tr/min. */
  vitesse: number
  /** `ref_ecru.vitesse_cible`, tr/min; 0 when the reference has none. */
  vitesseCible: number
}

export interface TrsMachine {
  id: number
  /** `machine.emplacement` — the code painted on the floor (1A … 3K). */
  emplacement: string
  /** PLC state: 1 running, 0 stopped, null never recorded. */
  etat: 0 | 1 | null
  /** Epoch ms when that state began; null if unknown. */
  depuisMs: number | null
  /** Live measured speed, tr/min (`machine.vitesse`). */
  vitesse: number
  /** An OF window covers now. Off → the tile shows its label only. */
  enProduction: boolean
  of: TrsOf | null
  /** Shift TRS as a ratio (1 = 100 %); null when nothing to measure. */
  trs: number | null
  /** Mean « défaut » stops per piece over the last finished pieces of the
   *  active OF (the tablet's NombreArrets); null until one piece is finished. */
  arretsParPiece: number | null
  /** How many finished pieces that mean covers. */
  arretsPieces: number
  /** FI_TRS's shift count — not displayed. */
  arretsEquipe: number
  arretsParHeure: number
  tempsProdS: number
  tempsMarcheS: number
  deductibleS: number
}

export interface TrsAtelier {
  generatedAt: string
  equipe: { nom: 'Matin' | 'Après-Midi' | 'Nuit'; debut: string; fin: string }
  /** ISO of the newest transition in the parc — the recorder's only visible pulse. */
  dernierEvenement: string | null
  parc: {
    trs: number | null
    enMarche: number
    arret: number
    inactifs: number
  }
  machines: TrsMachine[]
}

export function fetchAtelier(): Promise<TrsAtelier> {
  return apiFetch<TrsAtelier>('/trs/atelier')
}
