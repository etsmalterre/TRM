# Fournitures (aiguilles, platines)

> Dossier de fonctionnalité — LIVA #1263 (Nicolas Antonino, « suivi des garnitures »),
> construit le 2026-10-07 avec Vincent. Remplace le Google sheet de Nicolas « Stock aiguille »
> (Drive partagé Malterre Drive › TRM). **Première version, à itérer avec Nicolas.**

## Ce que c'est

Un menu **« Fournitures »** propre à TRM (`screen_fournitures`, **`seed: false`** — accordé
personne par personne) pour tout ce qui n'est pas du fil : Références · Stock · Gestion. Le
menu « Fils » reste celui d'ETM, intouché — c'est la raison d'un menu séparé (décision de
Vincent, 2026-10-07 : « Fil est une spécificité de notre usine, garder un lien propre avec ETM »).
Plus l'onglet **Aiguilles** du panneau de droite d'Atelier › Maintenance.

| Écran | Fichier | Rôle |
|---|---|---|
| Fournitures › Références | `pages/FournituresReferences.tsx` (Fiche) | catalogue typé, constructeurs acceptés, métiers, stock par constructeur, commandes par an ; `?id=` sélectionne |
| Fournitures › Stock | `pages/FournituresStock.tsx` (Tableau + tiroir) + `components/fournitures/StockMouvementDialogs.tsx` | **une ligne = référence × constructeur** (Nicolas, 2026-10-07 : tous les constructeurs acceptés ou déjà mouvementés, même à 0, + « Non précisé » tant qu'il porte du stock), « À commander » compté par référence, entrées, inventaires (pré-remplis sur le constructeur de la ligne), mouvements |
| Fournitures › Gestion | `pages/FournituresGestion.tsx` (Fiche) | fournisseurs par type (table TRM, pas `fournisseur` d'ETM) |
| Atelier › Maintenance, onglet Aiguilles | `components/maintenance/AiguillesTab.tsx` | références du métier par position, **« Changer le jeu »**, historique des jeux |

Partagé : `lib/fournitures.ts` (types, `useCatalogue` / `useSetCatalogue`, `etatStock`),
`components/fournitures/ConstructeurPicker.tsx`. API : `ETM/apps/api/src/routes/fournitures-trm.ts`
(`/api/fournitures-trm`), règles pures `lib/fournitures-trm.ts` (testées).

## Modèle (PostgreSQL, migration `0012_fournitures_trm`)

⚠️ **Préfixe `trm_fourniture_*`** : le legacy Confection a déjà `fourniture_confection`,
`fourniture_option`, **`fourniture_fournisseur`** — ne jamais nommer une table `fourniture_*`.

- `trm_fourniture_type` — Aiguille (`avec_position`), Platine (seedés). **Deux types seulement
  pour l'instant** (Vincent, 2026-10-07 — engrenages, courroies retirés) ; un nouveau type = une
  ligne dans cette table (aucun écran ne crée de type), les écrans suivent sans code.
- `trm_fourniture_article` — la référence, **partagée** par les métiers qui la prennent ;
  `position` cylindre / plateau ; unicité (type, référence) insensible à la casse.
- `trm_fourniture_constructeur` + `_article_constructeur` (acceptés). Monter ou recevoir un
  constructeur le rend accepté ; un constructeur monté ne peut pas être décoché.
- `trm_fourniture_article_metier` — métier × article : `quantite` (le jeu, **tapée par Nicolas
  une fois** — la première quantité d'un changement de jeu la remplit), constructeur monté,
  `date_montage`.
- `trm_fourniture_montage` (+ `_ligne`) — **un changement de jeu** : une ou plusieurs références
  remplacées d'un coup sur un métier.
- `trm_fourniture_mouvement` — **le stock est un registre signé** par article × constructeur
  (NULL = non ventilé) : `entree` (+), `sortie` (− , liée au montage), `inventaire` (± la
  correction). Stock = Σ quantite.
- `trm_fourniture_fournisseur` (+ `_type`).

## Règles

- ⚠️ **Un métier tourne avec TOUTES ses références à la fois** (longueurs cylindre / plateau
  × talons). « Monté » = le constructeur de chaque référence.
- ⚠️ **« Changer le jeu » sort le stock à l'enregistrement** (Nicolas) : pour chaque ligne,
  `repartirSortie` prend d'abord le stock du constructeur, puis le stock non ventilé, et le
  reste passe **en négatif** sur le constructeur — **jamais de refus** (les aiguilles sont sur
  la machine, c'est le registre qui a tort ; le négatif appelle un inventaire). Le dialogue
  l'annonce en ambre avant d'enregistrer. Coche « reporter sur Changement des aiguilles »
  (par défaut ; platines → `chg_platines`), jamais en arrière.
- Annuler un changement de jeu (mode édition, historique) rend le stock (ON DELETE CASCADE)
  mais ne rembobine pas le « monté ».
- Inventaire = on tape le **compté** d'un seau (constructeur ou non ventilé) ; le serveur écrit
  la correction (`correctionInventaire`), rien si déjà juste. Supprimer une entrée / un
  inventaire : oui ; un mouvement de montage : non (409, se corrige depuis le métier).
- Archiver une référence encore sur un métier : 409.
- Droits : **`edit_fournitures`** (catalogue, entrées, inventaires, fournisseurs) ;
  **`edit_maintenance`** (ce qui est sur un métier, le changement de jeu). Lectures ouvertes.

## Reprise du sheet — `scripts/seed-fournitures-trm.ts` (API)

Onglet « mise a jour du parc » (export 2026-10-07 ; l'onglet « Feuille1 » est l'ancienne
version 2017–2022, non reprise). Idempotent, dry run par défaut.
- 55 aiguilles + 1 platine (SNK 41.20 G12), 87 liens métier (blocs du sheet). « Rectiligne »
  n'est pas un métier : référence sans métier.
- **Position par règle** : dans un bloc à deux longueurs la plus courte = plateau, sinon
  cylindre. Vérifié contre `machine.double_fonture` : tous les blocs à deux longueurs sont des
  double fonture, les autres des simple — **sauf 1D** (double fonture, bloc 93.41 seul) : à
  faire vérifier par Nicolas.
- Constructeurs (colonne N, 1A seulement) : acceptés + montés sur 1A.
- Stock : une entrée par année de commande (2019–2025 datées du 31/12 « total commandé en … »,
  les deux colonnes 2026 à leur date), puis un **inventaire au 07/10/2026** qui ramène au
  « Quantité » du sheet (souvent très négatif : les montages passés n'étaient pas notés — la
  note le dit). Quantité absente → stock 0, « à recompter ».

## Déploiement

1. `mps-migrate.ts --write` (owner, migration 0012) **avant** l'API, puis `/etm_deploy`.
2. `seed-fournitures-trm.ts --write` sur le serveur.
3. `/trm_deploy`.
4. Accorder à la main le menu « Fournitures » et `edit_fournitures` (Nicolas, Mickaël…) —
   menu `seed: false`, donc **pas** de `seed-screen-access-trm.ts`.

## Pistes ouvertes (à voir avec Nicolas)

- Seuil de commande par référence (aujourd'hui « À commander » = stock < 1 jeu du plus gros métier).
- Platines sur les métiers (même mécanique, onglet à généraliser).
- Commandes fournisseur (aujourd'hui une entrée = réception, sans commande en attente).
