# Atelier › Maintenance

> Dossier de fonctionnalité, sorti de `CLAUDE.md` le 2026-09-02 (le fichier dépassait la limite de 150 k caractères). Contenu repris tel quel ; `CLAUDE.md` n'en garde que le résumé et les pièges majeurs. **Le mettre à jour ici**, pas dans `CLAUDE.md`.

## Atelier › Maintenance (`/atelier/maintenance`) — port de `FI_Maintenance.wdw`

Layout Fiche (§4–§9). Écran `apps/web/src/pages/AtelierMaintenance.tsx` + la jauge
`components/maintenance/MaintenanceGauge.tsx` ; API
`ETM/apps/api/src/routes/maintenance-trm.ts` (monté `/api/maintenance-trm`).

**Récupération du legacy** : `FI_Maintenance.wdw` est PCS-compressé et — contrairement à
`FI_Prime` — n'a **pas** de jumeau Java Android. Le dossier vient du **cache de compilation
WinDev**, `MPS.cpl/<user>/00000000/FI_Maintenance.4C33DFB6.wdw.{wcw,wbw}` : les littéraux
chaîne, les identifiants de champ et le SQL embarqué y survivent, **les littéraux entiers
non**. C'est la même piste que le widget « Poids des pièces » — la première à ouvrir pour
tout futur portage TRM.

- **Pas de `IDsociete`** sur `machine` ni `operation_maintenance` : les métiers *sont*
  Tricotage Malterre, comme `ordre_fabrication`. Rien à scoper.
- **Champ « Description » = `machine.commentaire`, PAS `machine.nom`** (2E : `nom` = '2E',
  `commentaire` = 'Terrot'). Ne jamais « corriger » vers `nom`.
- **Garniture** = 6 couples date + commentaire, dans l'ordre du formulaire legacy :
  `nett_platines` · `nett_cylindre` · `nett_plateau` · `chg_aiguilles` · `chg_platines` ·
  `pulsonique`, avec leurs `comm_*`. ⚠️ Deux fautes de frappe sont les **vrais** noms de
  colonnes : **`observation_maintenace`** (commentaire du rouloir) et **`comm_pulsonque`**.
- ⚠️ **`machine` porte trois colonnes accentuées** — `connecté`, `archivé`, `diamètre` —
  jamais nommées en SQL : lecture par `SELECT *` + pliage de clés (`queryB64Text` sur
  Linux), filtre `archivé = 0` en JS. `SELECT *` est sans risque ici (aucune colonne
  mémo-binaire, contrairement à `stock_fil` / `client`). En revanche **toutes les colonnes
  écrites sont ASCII**, donc UPDATE nommé classique — pas de réinsertion positionnelle.
  Le `SET` ne nomme **que** les colonnes de maintenance : `nom`, `Jauge`, `diamètre`,
  `nb_chutes*`, `vitesse`, `elasthanne`, `adresse_automate` appartiennent à
  `FEN_Gestion_des_machines` (non porté) — non nommé = valeur conservée.
- **Compteur rouloir** : `produit = Σ ordre_fabrication.quantite` des OF `est_termine = 1`
  dont `date_creation > machine.date_maintenance` ; **seuil = 15 000 Kg**. Le seuil est un
  littéral entier, donc absent du cache : il a été **mesuré**, en reconstituant les 14
  valeurs « Rouloir dans N Kgs » lisibles sur une capture du legacy (2026-08-26) —
  **14/14, écart maximal 0 Kg**. `probe-maintenance-trm.ts` rejoue cette réconciliation ;
  s'il casse, la constante est fausse. ⚠️ C'est une constante de module qui s'applique à
  tout l'historique — la mise en garde que Prime portait avant de dater ses barèmes. Si ce
  seuil doit changer un jour, **faire ce qu'a fait Prime** : une table datée
  (`BAREMES_PRIME` dans `lib/bareme-prime-trm.ts`), jamais une édition du chiffre en place,
  sinon tout l'historique du rouloir se recalcule sur un seuil qui n'était pas le sien.
- **Couleurs de la liste (§41)** : rouge ≥ 100 % du seuil, amber ≥ 66,7 %. Reproduit la
  capture 30/30, mais la frontière amber/vert n'est contrainte que dans `]4 650 ; 5 170]`
  — ⚠️ approximation assumée.
- **Jauges d'entretien** = les 3 lignes `operation_maintenance` (Ventilateurs 3 mois,
  Couronnes 6, Fuites d'air 3), **atelier-wide, pas par métier** ; valeur = mois écoulés /
  `frequence`. Rendues **dynamiquement** (le legacy en câblait exactement 3). « Effectué ce
  jour » écrit `date_derniere = aujourd'hui` après la confirmation legacy mot pour mot.
- **Deltas assumés** : le cadenas rouge/vert devient le mode édition or + garde §28 ; les
  cadrans arc-en-ciel à aiguille deviennent des **meters** mono-teinte avec un mot d'état
  (les 3 anti-patterns `dataviz` que le legacy cumulait — voir l'en-tête de
  `MaintenanceGauge.tsx`) ; les dates de garniture gagnent une ancienneté dérivée (« il y a
  18 ans ») **sans code couleur**, aucune fréquence n'existant en base pour la garniture ;
  l'onglet Rouloir de la sidebar liste les OF derrière le compteur, que le legacy affirmait
  sans permettre de le vérifier.
- **Droit `edit_maintenance`** (catégorie « Atelier ») : cache « Modifier » et « Effectué ce
  jour », et l'API 403 sur `PUT /metiers/:id` + `POST /operations/:id/reset`. Lecture
  ouverte à quiconque a le menu Atelier.
- **Pas de bouton « + Nouveau »** dans la liste : un métier se crée dans
  `FEN_Gestion_des_machines`, non porté. Exception documentée au contrat §5.
- Scripts : `probe-maintenance-trm.ts` (lecture seule, parité du seuil — **à rejouer après
  `/etm_deploy`**, c'est le seul test du chemin Linux) et `check-maintenance-trm.ts`
  (garde HTTP : aller-retour PUT avec accents, 409 sur métier archivé, 403 sans le droit,
  reset d'opération, tout restauré).

## Refonte avec Mickaël (2026-10-01)

Mickaël (utilisateur principal) a demandé quatre choses ; ce qui a été fait :

- **Entretiens par métier.** Ventilateurs, Couronnes et Fuites d'air étaient UNE date pour tout
  l'atelier (`operation_maintenance`). Migration PG **`0007_maintenance_trm`** (`ETM/apps/api/src/lib/mps-schema.ts`) :
  `operation_maintenance.portee` (`'metier'` | `'atelier'`) + `archive`, et la table
  **`operation_maintenance_metier`** (op × métier : `date_derniere`, `commentaire`, `modifie_par`).
  Les trois anciens deviennent `metier`, chaque métier repart de la date commune qu'ils avaient ;
  « Fuites d'air » est **aussi** recréé en entretien d'atelier (même date, même fréquence).
  Carte **Entretien** dans la fiche, entre Rouloir et Garniture.
- **Onglet Rouloir retiré** (et `GET /metiers/:id/production` avec lui). L'onglet Entretien de la
  sidebar devient **Atelier** : les entretiens du bâtiment seuls (`portee = 'atelier'`).
- **Kg tricotés depuis chaque entretien** (rouloir, garniture, entretiens) : ⚠️ **une seule mesure,
  les rouleaux pesés** — Σ `stock_ecru.poids` des OF du métier, `date_saisie` **strictement après**
  le jour de l'entretien (`lib/maintenance-trm.ts`, testé). Le compteur rouloir a quitté la règle
  legacy (Σ `ordre_fabrication.quantite` des OF terminés créés après la visite, qui ignorait l'OF en
  cours) : écart ≤ ~10 % sur la plupart des métiers, le seuil 15 000 Kg est conservé. La parité
  avec l'écran WinDev (retiré le 2026-09-29) n'est plus vérifiée ; `probe-maintenance-trm.ts`
  imprime les deux mesures côte à côte.
- **Entretiens d'atelier extensibles** : « Ajouter un entretien » (sidebar Atelier ou carte
  Entretien) ouvre `components/maintenance/OperationDialog.tsx` — nom, fréquence en mois, portée
  (fixée à la création). L'icône réglages d'un entretien le renomme / change sa fréquence /
  le supprime (= `archive`, les dates restent). Routes `POST|PUT|DELETE /operations[/:id]`.

Autres changements :
- **« Effectué ce jour » sur chaque élément**, hors mode édition, confirmé (`ConfirmDialog`) :
  `POST /metiers/:id/fait { item: 'rouloir' | <clé garniture> | <id entretien> }` ; atelier :
  `POST /operations/:id/reset` (409 `operation_par_metier` sur un entretien par métier). En mode
  édition, les dates et commentaires des entretiens se corrigent avec le reste (`PUT /metiers/:id`,
  champ `entretiens`).
- **Liste** : liseré = pire état (rouloir + entretiens), ligne « À faire : … », pastille = métiers
  ayant quelque chose de dû ; tri état puis kg restants. La jauge reste celle du rouloir.
- **Route en PostgreSQL natif** (`mpsPg`), plus de pliage d'accents HFSQL.

**Déploiement** : `mps-migrate.ts --write` (owner) **avant** de redémarrer l'API, puis `/trm_deploy`.

**Atelier dans la liste (2026-10-01, retour de Vincent)** : les entretiens d'atelier dans le panneau de
droite passaient pour une info du métier sélectionné. Ils ont maintenant leur **entrée « Atelier »
épinglée en tête de la liste** (hors défilement, teinte marine, icône usine, au-dessus de l'intitulé
« Métiers »), et ouvrent leur propre vue au centre (`ATELIER_ID = -1` comme sélection). Le panneau de
droite ne montre plus que le métier sélectionné. La pastille rouge compte l'atelier quand un de ses
entretiens est dû. ⚠️ La sélection automatique attend les métiers (`suspended: isLoading`), sinon
l'atelier, seul dans la liste un instant, était choisi au chargement. Le sous-menu placeholder
Atelier › Bonnetier a été retiré le même jour (navigation, router, `screen-keys-trm.ts`).

## Historique des entretiens (2026-10-07, les régleurs)

Demande : cliquer une ligne d'Entretien ou de Garniture ouvre l'historique de ce qui a été fait,
avec les commentaires ; saisir un commentaire en déclarant « Effectué ce jour ».

- **Il n'y avait PAS d'historique** : chaque élément ne gardait que sa dernière date + commentaire,
  écrasés à chaque « Effectué ce jour ». Migration PG **`0013_maintenance_journal_trm`** : table
  **`trm_maintenance_journal`** (une ligne par intervention : `idmachine` — NULL = élément d'atelier —,
  `item` = `rouloir` | nom de colonne garniture | `operation` + `idoperation_maintenance`, `date_fait`,
  `commentaire`, `saisi_par`). Amorcée avec la date que portait chaque élément (`reprise = true`,
  « Reprise de l'ancienne fiche ») — le seul passé que la base avait, rien d'antérieur n'existe.
- ⚠️ **La date + le commentaire stockés d'un élément restent la COPIE de sa dernière ligne** (colonnes
  `machine`, `operation_maintenance_metier`, `operation_maintenance.date_derniere`) : tous les lecteurs
  sont inchangés. « Effectué ce jour » ajoute une ligne **et** recopie ; le commentaire de la fiche est
  donc toujours celui de la dernière intervention (un « fait » sans commentaire l'efface — voulu).
- **Le mode édition ne corrige que la dernière ligne** (décision de Vincent) : seuls les éléments dont
  la date ou le commentaire a changé la touchent (`journalCorrectLatest`) ; vider la date supprime la
  dernière ligne et l'élément retombe sur la précédente.
- Écran : ligne cliquable **hors mode édition seulement** (en édition, ses champs sont les saisies) →
  `components/maintenance/HistoriqueDialog.tsx` (§18.D, kg tricotés par période = `kgParPeriode`) ;
  bouton « Historique » sur la carte Rouloir ; carte d'un entretien d'atelier cliquable.
  « Effectué ce jour » = `FaitDialog.tsx` (commentaire facultatif), aussi depuis l'historique.
- API : `GET /metiers/:id/historique?item=rouloir|<clé garniture>|<id entretien>`,
  `GET /operations/:id/historique` ; `commentaire` sur `POST /metiers/:id/fait` et
  `POST /operations/:id/reset`.
- **Déploiement** : `/etm_deploy` (`deploy-api` applique la migration 0013 lui-même avant le redémarrage), puis `/trm_deploy`.

**Lecture / édition (décision de Vincent, 2026-10-07)** : le mode lecture **lit et enregistre** des
événements (« Effectué ce jour », l'historique, « Changer le jeu » de l'onglet Aiguilles) ; le mode
édition **modifie la fiche** (dates, commentaires, et les entretiens eux-mêmes : ⚙ renommer /
fréquence / supprimer, « Ajouter un entretien » ; quantités et références de l'onglet Aiguilles).
⚠️ Ne pas remettre le ⚙ en lecture. La vue **Atelier** a son propre mode édition (Modifier →
« Terminer », pas d'Enregistrer : chaque dialogue enregistre seul). L'onglet Aiguilles suivait
déjà la règle. Un entretien supprimé en mode édition sort aussi du brouillon (sinon fiche « non
enregistrée » à jamais).

## Onglet Aiguilles (LIVA #1263, 2026-10-07)

Le panneau de droite a deux onglets, **Métier** et **Aiguilles** (`components/maintenance/AiguillesTab.tsx`) :
les références d'aiguilles du métier groupées Cylindre / Plateau, le constructeur monté, le jeu
(quantité par montage) et le stock ; **« Changer le jeu »** remplace une ou plusieurs références
d'un coup et sort le stock ; historique des jeux sous les cartes. D'abord une carte de la fiche,
déplacée en onglet le même jour (le centre = l'entretien daté). Les données vivent dans le module
**Fournitures** — tout le détail (modèle, règles de sortie de stock, reprise du sheet) est dans
**`claude_doc/fournitures.md`**.
