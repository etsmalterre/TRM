// Which actions the poste offers, given the state of the OF.
//
// This is the heart of the bonnetier screen and it lives here, not inline in
// the component, because it is pure logic recovered from the legacy and it
// deserves a test (actions.test.ts) rather than a visual check.
//
// Legacy source: FEN_Action_Machine, "Initialisation de COMBO_Action",
// recovered from the generated Java. The WLanguage survives as comments, but
// WinDev's generator only emits a comment for the FIRST line of each branch,
// so the `sinon` keywords are missing from the extract. Reconstructed shape:
//
//   si pas DateValide(demarrage_prod) alors      // OF pas encore lancé
//       Ajoute("Lancement OF")
//   sinon
//       si nettoyage_efectué < ordre_fabrication.Nettoyage alors
//           Ajoute("Nettoyage")
//       SI reqProd.total + 1 >= nb_pieces et finir_fil = faux ALORS
//           Ajoute("Terminer OF")
//       SINON
//           Ajoute("Fin de pièce")
//       si finir_fil = vrai alors
//           Ajoute("Dernière pièce")
//       Ajoute("Défaut")
//       <COMPILE SI Configuration="Appli_Regleur">
//           Ajoute("Relancer OF")
//
// The régleur's extra slot is an interrupt/resume PAIR, keyed on whether the
// OF is currently stopped. CONFIRMED 2026-08-27 against the CURRENT WinDev
// compile cache (`MPS.cpl/<user>/00000005/FEN_Action_Machine.*.wcw`, built
// 25/08/2026), whose COMBO_Action literals read in order:
//
//   Lancement OF · Nettoyage · Terminer OF · Fin de pièce · Dernière pièce ·
//   Défaut · Interrompre OF · Relancer OF
//
// Both halves are compiled in and chosen at runtime. The March Java showed
// only « Relancer OF », which is why this started as an inference; the other
// build config (00000003) still differs by exactly that one literal.
//
// ⚠️ THE LABEL IS NOT THE EVENT STRING. The combo says « Interrompre OF » and
// « Relancer OF »; BTN_Valider writes « Interruption OF » and « Reprise OF »
// into `evenement_piece.evenement`. Same trap on « Fin de pièce », which
// writes « Fin du tricotage ». The event strings are what years of history are
// keyed on — see EVENEMENT_POUR below, and never derive one from the other.

export type ActionAtelier =
  | 'Lancement OF'
  | 'Nettoyage'
  | 'Terminer OF'
  | 'Fin de pièce'
  | 'Dernière pièce'
  | 'Défaut'
  | 'Interrompre OF'
  | 'Relancer OF'

export interface EtatOf {
  demarre: boolean
  interrompu: boolean
  finir_fil: boolean
  produites: number
  nb_pieces: number
  nb_nettoyages_faits: number
  nb_nettoyages_requis: number
}

export function actionsDisponibles(of: EtatOf, estRegleur: boolean): ActionAtelier[] {
  // An OF that has never started offers exactly one thing. The legacy also
  // hides the info button here — there is no piece yet, so no procedure to read.
  if (!of.demarre) return ['Lancement OF']

  const actions: ActionAtelier[] = []

  if (of.nb_nettoyages_faits < of.nb_nettoyages_requis) actions.push('Nettoyage')

  // `produites + 1` is the piece currently on the machine: finishing it is
  // what would complete the order. A "finir le fil" OF never offers Terminer —
  // it runs until the yarn is gone, which is why its target carries a tilde.
  if (of.produites + 1 >= of.nb_pieces && !of.finir_fil) actions.push('Terminer OF')
  else actions.push('Fin de pièce')

  if (of.finir_fil) actions.push('Dernière pièce')

  actions.push('Défaut')

  // The ONE role difference in the whole legacy app — a single compile-guarded
  // combo entry. Worth remembering when the régleur's extra powers get
  // designed: the shop floor's own idea of the difference is very small.
  if (estRegleur) actions.push(of.interrompu ? 'Relancer OF' : 'Interrompre OF')

  return actions
}
