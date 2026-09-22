// The ERP's side of /api/pointage-admin (ETM/apps/api/src/routes/pointage-admin.ts):
// the menu « Pointage », port of the WinDev Admin Pointage. Times travel as
// epoch ms (null = not stamped) and are typed back as « HH:MM » — the server
// places them on the day (legacy after-midnight rule) and checks their order.
import { apiFetch } from '@/lib/api'

export type ColonneHeure = 'debut' | 'debut_pause1' | 'fin_pause1' | 'debut_pause2' | 'fin_pause2' | 'fin'
export const COLONNES_HEURE: readonly ColonneHeure[] = ['debut', 'debut_pause1', 'fin_pause1', 'debut_pause2', 'fin_pause2', 'fin']

export interface SalarieRef {
  id: number
  nom: string
  prenom: string
  supprime: boolean
}

export interface SalarieAdmin extends SalarieRef {
  login: string
  /** `mps.bonnetier` link, 0 = none. */
  idMps: number
  photo: boolean
  /** Display name of the linked bonnetier, null when not linked. */
  bonnetier: string | null
}

export interface SaisieSalarie {
  nom: string
  prenom: string
  login: string
  idMps: number
}

export interface Bonnetier {
  id: number
  nom: string
  prenom: string
  archive: boolean
}

export interface MessageSalarie {
  id: number
  idSalarie: number
  texte: string
  /** `YYYYMMDD`. */
  dateFin: string
  expire: boolean
}

export type Issue = 'ecrit' | 'introuvable' | 'sans_lien' | 'echec'

export interface Horaire {
  id: number
  /** `YYYYMMDD` — the shift's day (a night shift keeps its evening). */
  jour: string
  salarie: SalarieRef
  debutMs: number | null
  debutPause1Ms: number | null
  finPause1Ms: number | null
  debutPause2Ms: number | null
  finPause2Ms: number | null
  finMs: number | null
  /** Finished pauses only. */
  pausesMin: number
  /** Gross end − start, pauses not deducted; null while open. */
  presenceMin: number | null
  ouverte: boolean
  nonFermee: boolean
  sync?: { lstPointage: Issue; mps: Issue }
}

/** « HH:MM » sets, null clears (never the start), absent keeps. */
export type SaisieHeures = Partial<Record<ColonneHeure, string | null>>

export const MS_PAR_COLONNE: Record<ColonneHeure, keyof Horaire> = {
  debut: 'debutMs',
  debut_pause1: 'debutPause1Ms',
  fin_pause1: 'finPause1Ms',
  debut_pause2: 'debutPause2Ms',
  fin_pause2: 'finPause2Ms',
  fin: 'finMs',
}

export const msDe = (h: Horaire, c: ColonneHeure): number | null => h[MS_PAR_COLONNE[c]] as number | null

// ── Salariés ──
export const fetchSalariesAdmin = () => apiFetch<SalarieAdmin[]>('/pointage-admin/salaries')
export const fetchBonnetiers = () => apiFetch<Bonnetier[]>('/pointage-admin/bonnetiers')
export const creerSalarie = (body: SaisieSalarie) =>
  apiFetch<SalarieAdmin>('/pointage-admin/salaries', { method: 'POST', body: JSON.stringify(body) })
export const modifierSalarie = (id: number, body: SaisieSalarie) =>
  apiFetch<SalarieAdmin>(`/pointage-admin/salaries/${id}`, { method: 'PUT', body: JSON.stringify(body) })
export const supprimerSalarie = (id: number) => apiFetch<void>(`/pointage-admin/salaries/${id}`, { method: 'DELETE' })

// ── Messages ──
export const fetchMessages = (idSalarie: number) => apiFetch<MessageSalarie[]>(`/pointage-admin/salaries/${idSalarie}/messages`)
export const creerMessage = (idSalarie: number, body: { texte: string; dateFin: string }) =>
  apiFetch<MessageSalarie>(`/pointage-admin/salaries/${idSalarie}/messages`, { method: 'POST', body: JSON.stringify(body) })
export const modifierMessage = (id: number, body: { texte: string; dateFin: string }) =>
  apiFetch<MessageSalarie>(`/pointage-admin/messages/${id}`, { method: 'PUT', body: JSON.stringify(body) })
export const supprimerMessage = (id: number) => apiFetch<void>(`/pointage-admin/messages/${id}`, { method: 'DELETE' })

// ── Horaires ──
export interface HorairesReponse {
  du: string
  au: string
  maintenantMs: number
  lignes: Horaire[]
}
export const fetchHoraires = (du: string, au: string, salarie: number) =>
  apiFetch<HorairesReponse>(`/pointage-admin/horaires?du=${du}&au=${au}${salarie > 0 ? `&salarie=${salarie}` : ''}`)
export const fetchEnPoste = () => apiFetch<{ jour: string; maintenantMs: number; lignes: Horaire[] }>('/pointage-admin/en-poste')
export const creerHoraire = (body: { idSalarie: number; jour: string; heures: SaisieHeures }) =>
  apiFetch<Horaire>('/pointage-admin/horaires', { method: 'POST', body: JSON.stringify(body) })
export const corrigerHoraire = (id: number, heures: SaisieHeures) =>
  apiFetch<Horaire>(`/pointage-admin/horaires/${id}`, { method: 'PATCH', body: JSON.stringify({ heures }) })
export const supprimerHoraire = (id: number) =>
  apiFetch<{ id: number; sync: { lstPointage: Issue } }>(`/pointage-admin/horaires/${id}`, { method: 'DELETE' })

/** The French message of a refused correction (400 saisie_invalide), else a generic one. */
export function messageErreur(e: unknown): string {
  const err = e as { status?: number; body?: { error?: string; message?: string } } | undefined
  if (err?.body?.message) return err.body.message
  if (err?.status === 403) return 'Vous n’avez pas le droit de corriger le pointage.'
  if (err?.status === 404) return 'Cet élément n’existe plus.'
  return 'Une erreur est survenue. Réessayez.'
}

// ── Semaines (Contrôles + Lissage) ──
export interface CelluleSemaine {
  numero: number
  /** Monday, `YYYYMMDD`. */
  lundi: string
  /** Validated total, null when the week has no lissage row. */
  cumulMin: number | null
  /** In the validation window and not validated — the legacy's red cell. */
  aValider: boolean
}
export interface BilanAnnee {
  semaine: number
  prevuMin: number
  realiseMin: number
  infos: { id: number; commentaire: string; min: number }[]
  totalMin: number
}
export interface SemainesReponse {
  annee: number
  semMin: number
  semMax: number
  nbSemaines: number
  semaines: CelluleSemaine[]
  bilan: BilanAnnee
}
export interface JourSemaine {
  libelle: string
  jour: string
  segments: { id: number; debutMs: number; finMs: number }[]
  cumulMin: number
  lisseMin: number
  type: string
}
export interface SemaineDetail {
  idSalarie: number
  annee: number
  numero: number
  lundi: string
  existe: boolean
  jours: JourSemaine[]
  cumulSemaineMin: number
}
export const TYPES_JOUR = ['M', 'A', 'N', 'J', 'E'] as const
export const LIBELLE_TYPE: Record<string, string> = {
  M: 'Matin (repas jour)',
  A: 'Après-midi (repas jour)',
  N: 'Nuit (repas nuit)',
  J: 'Journée (sans repas)',
  E: 'Journée bonnetier (repas jour)',
}
export const fetchSemaines = (salarie: number, annee: number) =>
  apiFetch<SemainesReponse>(`/pointage-admin/lissage/semaines?salarie=${salarie}&annee=${annee}`)
export const fetchSemaine = (salarie: number, annee: number, numero: number) =>
  apiFetch<SemaineDetail>(`/pointage-admin/lissage/semaine?salarie=${salarie}&annee=${annee}&numero=${numero}`)
export const validerSemaine = (body: { idSalarie: number; annee: number; numero: number; jours: { type: string; lisseMin: number }[] }) =>
  apiFetch<SemaineDetail>('/pointage-admin/lissage/semaine', { method: 'PUT', body: JSON.stringify(body) })

// ── Prévisionnel (+ Variables) ──
export interface PrevSemaine {
  numero: number
  lundi: string
  /** Planned minutes, null when the week has no row. */
  prevMin: number | null
  commentaire: string
}
/** A yearly adjustment as its EFFECT on the balance (+600 = ten hours in credit). */
export interface Variable {
  id: number
  commentaire: string
  soldeMin: number
}
export interface PrevisionnelReponse {
  idSalarie: number
  annee: number
  nbSemaines: number
  vide: boolean
  semaines: PrevSemaine[]
  variables: Variable[]
  bilan: { prevuMin: number; ajustementMin: number; objectifMin: number }
  sourcesRecopie: SalarieRef[]
}
export const fetchPrevisionnel = (salarie: number, annee: number) =>
  apiFetch<PrevisionnelReponse>(`/pointage-admin/previsionnel?salarie=${salarie}&annee=${annee}`)
export const definirPrevSemaine = (body: { idSalarie: number; annee: number; numero: number; prevMin: number; commentaire: string }) =>
  apiFetch<PrevisionnelReponse>('/pointage-admin/previsionnel/semaine', { method: 'PUT', body: JSON.stringify(body) })
export const initialiserPrevisionnel = (
  body: { idSalarie: number; annee: number; mode: 'heures'; prevMin: number } | { idSalarie: number; annee: number; mode: 'copie'; sourceId: number },
) => apiFetch<PrevisionnelReponse>('/pointage-admin/previsionnel/initialiser', { method: 'POST', body: JSON.stringify(body) })
export const creerVariable = (body: { idSalarie: number; annee: number; soldeMin: number; commentaire: string }) =>
  apiFetch<PrevisionnelReponse>('/pointage-admin/previsionnel/variables', { method: 'POST', body: JSON.stringify(body) })
export const modifierVariable = (id: number, body: { soldeMin: number; commentaire: string }) =>
  apiFetch<Variable>(`/pointage-admin/previsionnel/variables/${id}`, { method: 'PUT', body: JSON.stringify(body) })
export const supprimerVariable = (id: number) => apiFetch<void>(`/pointage-admin/previsionnel/variables/${id}`, { method: 'DELETE' })
