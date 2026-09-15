// The tablet's side of /api/pointage (ETM/apps/api/src/routes/pointage.ts).
// The server decides which buttons exist (the FEN_PointageSalarié table,
// lib/pointage-etat.ts there): this client displays `actions` as given and
// never derives one itself.
import { API_URL, apiFetch } from '@/lib/api'

export type Statut = 'hors_poste' | 'au_travail' | 'en_pause'

export type ActionPointage = 'debut_travail' | 'debut_pause' | 'fin_pause' | 'fin_travail' | 'fin_pause_fin_travail'

export interface SalarieRef {
  id: number
  nom: string
  prenom: string
  /** Linked to a bonnetier who has a photo on file. */
  photo: boolean
}

export interface SalarieGrille extends SalarieRef {
  statut: Statut
}

/** A `lst_horaire` line; times in epoch ms, null = not stamped. */
export interface Ligne {
  id: number
  jour: string
  debutMs: number | null
  debutPause1Ms: number | null
  finPause1Ms: number | null
  debutPause2Ms: number | null
  finPause2Ms: number | null
  finMs: number | null
}

/** A row of the « En poste » table (legacy TABLE_Pointage): an open line. */
export interface LigneEnPoste extends Ligne {
  salarie: SalarieRef
  /** Minutes of the pauses already finished (a running one does not count). */
  cumulPauseMin: number
  /** A shift left open too long — Admin Pointage has to close it. */
  nonFermee: boolean
}

export interface EnPoste {
  /** Today, `YYYYMMDD` (Paris). */
  jour: string
  maintenantMs: number
  lignes: LigneEnPoste[]
}

export interface ActionOfferte {
  action: ActionPointage
  libelle: string
}

export interface EtatSalarie {
  salarie: SalarieRef
  statut: Statut
  /** The open line the actions apply to (send its id back with the action). */
  ligne: Ligne | null
  /** A shift left open too long to continue — shown as a warning. */
  posteNonFerme: Ligne | null
  actions: ActionOfferte[]
  messages: { id: number; texte: string }[]
  /** Legacy « Semaine N : » (last week, worked minutes) and « Cumul » (annual
   *  balance in minutes); null = hidden, as the legacy does. */
  semaine: { annee: number; numero: number; semaineMin: number; cumulMin: number } | null
  /** Hours of « temps hors prod » today; null = nothing recorded yet. */
  horsProd: number | null
  maintenantMs: number
}

export interface ResultatPointage {
  action: ActionPointage
  instantMs: number
  ligneId: number
  lstPointage: 'ecrit' | 'introuvable' | 'sans_lien' | 'echec'
  mps: 'ecrit' | 'introuvable' | 'sans_lien' | 'echec'
}

export interface Appareil {
  id: number
  libelle: string
}

/** null = not enrolled (or revoked); anything else throws. */
export async function fetchAppareil(): Promise<Appareil | null> {
  try {
    return await apiFetch<Appareil>('/pointage/appareil/moi')
  } catch (e) {
    if ((e as { status?: number }).status === 401) return null
    throw e
  }
}

export const fetchEnrolementEnAttente = () =>
  apiFetch<{ enAttente: boolean }>('/pointage/appareil/enrolement-en-attente')

export const enrolerPointeuse = (code: string) =>
  apiFetch<Appareil>('/pointage/appareil/enroler', { method: 'POST', body: JSON.stringify({ code }) })

export const fetchSalaries = () => apiFetch<SalarieGrille[]>('/pointage/salaries')

export const fetchEnPoste = () => apiFetch<EnPoste>('/pointage/en-poste')

export const fetchEtat = (id: number) => apiFetch<EtatSalarie>(`/pointage/salaries/${id}/etat`)

export const pointer = (id: number, body: { action: ActionPointage; ligneId: number | null }) =>
  apiFetch<{ resultat: ResultatPointage; etat: EtatSalarie }>(`/pointage/salaries/${id}/pointage`, {
    method: 'POST',
    body: JSON.stringify(body),
  })

export const definirHorsProd = (id: number, duree: number) =>
  apiFetch<{ horsProd: number }>(`/pointage/salaries/${id}/hors-prod`, {
    method: 'PUT',
    body: JSON.stringify({ duree }),
  })

/** 2x the displayed size, so the face stays crisp on the tablet's DPR. */
export const photoUrl = (id: number, size: number) => `${API_URL}/pointage/salaries/${id}/photo?size=${size * 2}`
