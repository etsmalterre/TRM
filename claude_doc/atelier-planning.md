# Atelier › Planning (`/atelier/planning`) — grille des bonnetiers + Tricobot

Port de `FI_Planning_Atelier.wdw` / `FEN_Desiderata.wdw` : une ligne par bonnetier actif (régleurs
exclus), dimanche → samedi, un créneau par jour. Écran `pages/AtelierPlanning.tsx`, API
`ETM/apps/api/src/routes/planning-atelier.ts` (lectures et écriture partagées dans
`lib/planning-bonnetier.ts` depuis LIVA #1296). Modèle de données : `CLAUDE.md` § « Atelier planning
data model ».

## Comment l'atelier fait son planning (enquête LIVA #1296, 2026-10-21)

Lu sur `planning_bonnetier` de juin 2025 à octobre 2026, plus ce que Vincent a dit :

- **Binômes** : les deux membres d'un binôme font la même équipe toute la semaine ; **les équipes
  tournent chaque semaine** (matin ↔ après-midi) ; **les binômes sont recomposés toutes les 4
  semaines** (vérifié S35–S38 {Angélique, Daunovan}{Anaïs, Marie} → S39–S42 {Angélique, Anaïs}
  {Daunovan, Marie}). Avec une nuit, ordre matin → nuit → après-midi (dit par Vincent, pas
  lisible proprement dans les données).
- **Horaires** en 2 équipes (7 h) décalés d'une heure dans le binôme : 05–12 / 06–13 et 13–20 /
  14–21 ; en 3×8 : 05–13, 13–21, 21–05. Lundi → vendredi, la nuit saisie sur son jour de début.
- **Les nuits viennent par blocs** de 4 à 6 semaines (sept.–oct. 2025, févr., avr.–mai, juin
  2026) puis disparaissent : **décision humaine** (charge), comme le passage 7 h / 8 h.
- **Desiderata** : ~100 lignes depuis 2024, presque toutes des rendez-vous (médecin…) en texte libre
  avec l'heure ; rarement une demande d'équipe.
- Le planning se fait le mercredi pour la semaine d'après la suivante (Vincent).

## Tricobot « Faire le planning » (LIVA #1296)

Décision Vincent 2026-10-21 : **l'agent ne tourne jamais seul** (pas de minuterie du mercredi) —
Isa clique « Faire le planning » sur une semaine vide et tape ses consignes (nuit, 8 h, absent…).

- **Bouton** (barre d'outils, mascotte) : seulement sur une semaine **sans aucun créneau** sur une
  ligne de la grille, à partir de la semaine en cours, et si l'agent « Planning atelier » est en
  service (Agents IA). L'API refuse aussi une semaine non vide (409 `semaine_deja_planifiee`) :
  Tricobot ne remplace jamais un planning.
- **Consignes pré-remplies** avec celles de la fois précédente (ce qui reste vrai se reporte).
- **Bandeau** au-dessus de la grille tant que la semaine n'est pas validée : équipes (calculées sur
  les créneaux écrits, jamais sur la prose du modèle), explication, points d'attention, compteur
  de créneaux modifiés (recalculé à chaque modification de la grille), bouton « Valider le planning ».
- **Valider** : rien n'a bougé → réussite directe ; sinon dialogue « Former Tricobot » listant les
  changements (calculés par l'API, `regles.ts ecarts`) + pourquoi obligatoire → échec avec
  `corrections`. Une semaine jamais validée = réussite (`confianceParDefaut`). Revalider remplace.
- Garde : le **menu Atelier** (`trmUserHasMenu('/atelier')`) sur les trois routes `/tricobot`.

### Ce que le modèle reçoit, et ce que le code décide

`lib/agents/planning-atelier/` (repo ETM) : `agent.ts` (prompt, écriture, retour), `regles.ts`
(pur, testé). Le modèle **comptait mal** le roulement sur l'historique brut (essais du 2026-10-21 :
binômes non recomposés, même équipe deux semaines, nuit inventée) ; le code lui donne donc les
**faits** (`faitsDuRoulement`) : régime de la dernière semaine, binômes en cours et depuis combien
de semaines, recomposition due ou non, **binômes jamais formés / les moins récents**, cycles
précédents. Le modèle écrit un `raisonnement` avant la grille (gardé sur le run, jamais montré à
l'atelier).

- ⚠️ **Sans consigne, le régime ne change pas** : une proposition qui change les équipes ou la
  durée des journées (`regimeDe`, lu sur l'horaire *habituel* de chacun — un jour atypique ne
  compte pas) repart une fois au modèle avec la raison, puis reste avec un point d'attention.
- `validerReponse` écarte (et liste dans le run) : bonnetier inconnu, jour hors semaine, heure hors
  quart d'heure, durée hors 4–10 h, deux créneaux le même jour. Rien d'utilisable → rien d'écrit.
- Coût ~0,01 € et 5–13 s par semaine (Mistral Medium) ; sous le timeout nginx de 60 s.
- Agent au catalogue avec `declenchement: { type: 'ecran' }` : le minuteur l'ignore, « Lancer
  maintenant » n'existe pas pour lui (409 côté API), l'écran Agents IA a son dialogue de run.
