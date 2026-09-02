# Production › Ordres de fabrication + Observations régleur (`obs_ref_ecru`)

> Dossier de fonctionnalité, sorti de `CLAUDE.md` le 2026-09-02 (le fichier dépassait la limite de 150 k caractères). Contenu repris tel quel ; `CLAUDE.md` n'en garde que le résumé et les pièges majeurs. **Le mettre à jour ici**, pas dans `CLAUDE.md`.

## Production › Ordres de fabrication (`/production/of`) — port of FEN_Gestion_des_OF.wdw

> Renamed from « Gestion des OF » on 2026-08-26 (label only — the route, the screen file
> `ProductionOf.tsx` and every screen-access key are unchanged, so there was no migration).
> `Atelier › Productivité` was removed in the same pass: it had never been more than a
> placeholder. A stored `hide_atelier_productivite` grant is now an orphan and simply
> disappears the next time an admin saves that user — the permissions-trm PUT filters
> unknown keys rather than rejecting the payload.

Fiche layout + §29 status pill; screen `apps/web/src/pages/ProductionOf.tsx`; API
`ETM/apps/api/src/routes/of-trm.ts` (`/api/of-trm` — the OF tables have **no IDsociete**,
scope goes through the commande chain). The legacy windows are PCS-compressed: the data
model was recovered from `MPS.xdd` + a live DB probe — the full dossier (column semantics,
event strings, formulas) lives in the plan `~/.claude/plans/golden-petting-shell.md`.

- **La recherche marche pareil dans les trois onglets** (2026-08-27) : n° d'OF, référence,
  coloris, client, n° de commande, métier. En cours / Attente filtrent la liste déjà
  chargée côté web ; **Terminés passe par `?q=`**, dont le `searchTermineIds` d'`of-trm.ts`
  fait le travail **en JS sur des projections étroites** — le LIKE de HFSQL ne replie pas
  les accents (les libellés en portent, la boîte de recherche non), et l'axe client
  demanderait sinon un `IN` de tous les `IDligne_commande_client` d'Ets Malterre. Mesuré
  ~0,6 s au pire sur le pilote, pour une liste qu'on n'atteint qu'en tapant. Le `TOP 200`
  borne désormais les **résultats**, plus le corpus : une recherche lit tout le registre.
  - ⚠️ **Un nombre est À LA FOIS un n° d'OF et une référence plausible** — 249, 027, 161
    sont de vraies étiquettes écru. La requête numérique ne court-circuite donc pas le
    balayage des libellés (ce qu'elle faisait avant, en ne rendant que l'OF du même
    numéro) : elle place son OF exact en tête, puis les correspondances de libellé.
- **Queue**: `priorite` ranks OFs per métier (1 = running, 0 = terminé), one `est_actif`
  max per métier; Terminer re-ranks and flips the new head active if `auto_activation=1`
  (our endpoint owns that flip — the legacy trigger is unreadable).
- **Form mapping**: consigne = `observations`; Ouvert au large = `ouvert_visiteuse`;
  1/2 Nettoyages = `Nettoyage` (capital N); Visitage int = 1 « 2 premières pièces et
  toutes les 3 pièces » / 2 « Toutes les pièces » (0 = 20 legacy rows, shown « — »);
  Tricoter = `asso_fil_of`, Incorporer = `fil_incorpore`; nb_pieces derived
  ceil(quantite/poids_piece) **tant qu'on tape quantité ou poids pièce, puis modifiable à
  la main** ; **quantité et nb pièces restent modifiables après le démarrage de la
  production** (décision utilisateur du 2026-09-02, ticket LIVA #1110 — le legacy grisait
  la quantité, et le port répondait 409 `production_lancee`) : c'est en fin de prod que le
  régleur ajuste, quand le lot a manqué ou que le client se contente de 18 pièces, et
  `nb_pieces` est ce que l'atelier lit pour proposer « Terminer OF » (`atelier.ts`,
  `produites + 1 >= nb_pieces`) et garder le métier dans « Actives ». Le formulaire
  affiche « N Kg déjà tricotés » sous la quantité pour que l'ajustement se fasse contre
  un chiffre. Seuls `est_termine` (409 `of_termine`) et la suppression (409
  `production_lancee`) restent gardés. Sous `edit_of`, comme tout le formulaire.
- **« Finir le fil » = une estimation, pas une consigne de quantité** (2026-09-02, port du
  comportement de `FEN_Gestion_d_un_OF` : le legacy grise Nb pièces et Quantité dès que
  la case est cochée). Le régleur demande au bonnetier d'épuiser les lots ; la fiche
  remplace alors quantité et nb pièces par **réalisé + réalisable**, où réalisable =
  min sur les lots de `stock ÷ Σ % des lignes nourries par ce lot` (`realisableSurFil`,
  deux positions d'alimentation sur un même lot tirent ensemble), et grise les deux
  champs. Le stock des lots est décrémenté au visitage de chaque pièce, l'événement même
  qui fait grandir `realise` : les deux moitiés ne se comptent jamais deux fois. **Rien
  côté API** : le formulaire envoie les valeurs estimées comme des valeurs saisies, et le
  brouillon s'ouvre déjà sur l'estimation (sinon le mode édition serait « modifié » avant
  toute frappe). Le côté bonnetier existait déjà : `atelier.ts` propose « Dernière
  pièce » et garde le métier dans « Actives » tant que `finir_fil = 1`. ⚠️ **Écart
  legacy non tranché** : sur l'OF 3395 le legacy affichait 83,43 kg = 60 (quantité) +
  23,43 (réalisable) ; ici c'est 0 (réalisé) + 23,43. Le dialogue de création n'est pas
  concerné (pas de lot connu au lancement).
- **Le sélecteur de métier de la fiche ne liste que les métiers compatibles** avec la
  référence de l'OF (`detail.compatibles_ids`, la source du « Compatible sur : … » de
  l'en-tête de carte) — décision utilisateur du 2026-09-02, à la place du parc entier
  avec une mention « compatible » sur quelques lignes. Le métier où l'OF est déjà reste
  listé même hors fiche (sinon le champ montrerait une sélection vide), et une référence
  sans fiche machine retombe sur le parc complet, comme `CreateOfDialog`.
  **Le libellé y est `machine.emplacement`** (repli `nom` s'il est vide), comme l'aside
  et la figure « Métier » du mode lecture — décision utilisateur du 2026-09-02, dans la
  ligne du ticket LIVA #1102 (« 1G apparaît sous le nom “beck” ») : `nom` est une marque
  sur 1G (« Beck ») et 1H (« Orizio »), et un régleur nomme un métier par sa place au
  sol. Le filtre est par **id**, plus par libellé. Depuis le 2026-09-02 (#1102) c'est
  **toute la chaîne** : `machineLabel()` dans `ETM/apps/api/src/lib/production-trm.ts`
  (miroir web `apps/web/src/lib/machine.ts`), que `resolveMachineNames` d'`of-trm.ts`
  emprunte — donc la liste des OF, la pastille de carte, les observations, « Compatible
  sur » et la recherche Terminés (qui répond aussi à « beck ») disent tous « 1G » ; la
  fiche reçoit `machine.label` (`nom` et `emplacement` restent dans le payload), et les
  sélecteurs de `CreateOfDialog` / `ObsRefEcru` passent par le même repli. ⚠️ Les autres
  écrans TRM qui nomment un métier — Tombé Métier › Stock, Expéditions, le tiroir
  Progression de Commandes, Atelier › Maintenance (délibérément : `nom` y est la marque) —
  sont restés sur `machine.nom`.
- **5 sidebar tabs**: Observations = **`obs_ref_ecru` + `message_of`**, empilés (voir
  « Observations régleur » ci-dessous) ; Production = `piece_production` +
  `evenement_piece` timeline (avatars = `bonnetier.photo` blob endpoint, initials
  fallback); Visitage = `stock_ecru` rolls; Qualité = `defaut_qualite` both populations
  (Type_Reference 1 = pièce, 2 = rouleau), trim `type_defaut` (historical
  `"Autre Barrure "`); Performance = `evenement_machine` (recorder covers PLC métiers
  only, no data after 2026-03-09 → honest empty state).
- **Flagged approximations** (legacy formulas unrecoverable): per-piece % =
  trs_10kg_chute/nb_chutes × poids/10 ÷ vitesse (fallback orf → machine → ref_ecru);
  faux-arrêts filter = 120 s. Imprimer (ETAT_OF work sheet) is still the §18 placeholder.

### « Observations régleur » (`obs_ref_ecru`) — l'onglet Obs. et l'onglet Obs OF

Les consignes durables portées par la **référence écru**, ciblées **par métier et par
coloris** (`IDmachine = 0` = « Toutes », `IDcolori_ecru = 0` = « Tout coloris »).
Composant partagé `apps/web/src/components/of/ObsRefEcru.tsx` (carte + dialogue +
confirmation de suppression), CRUD `ETM/apps/api/src/routes/of-trm.ts`
(`GET /:id/observations-ref`, `POST /references/:refId/observations-ref`,
`PUT|DELETE /observations-ref/:obsId`, `GET /lookups/coloris-ecru?ref=`), garde
`ETM/apps/api/src/scripts/check-obs-ref-ecru-trm.ts`.

- ⚠️ **L'onglet Obs. de la fiche OF lisait `message_of`, et c'était le mauvais fichier**
  (corrigé le 2026-08-27, signalé par l'utilisateur sur l'OF 1741). Le legacy y montre
  `obs_ref_ecru` : requête récupérée verbatim dans le cache de compilation
  (`FI_Gestion_OF.wcw`), prédicat `IDref_ecru = :ref AND (IDmachine = :machine OR
  IDmachine = 0) AND (IDcolori_ecru = :colori OR IDcolori_ecru = 0) ORDER BY date DESC`.
  L'OF 1741 (créé en 2022) porte bien une observation de 2024 — c'est le propre d'une note
  de référence, et c'est ce qui trahissait l'erreur. **`message_of` n'apparaît nulle part
  dans le legacy bureau** : il vit dans l'app Android du poste (`FEN_Consigne`).
- **Le scope se lit sur l'OF, pas sur sa ligne de commande** : `ordre_fabrication` porte ses
  propres `IDref_ecru` / `IDcolori_ecru`, et ils divergent de la ligne sur **848 OF sur
  3 178**. La fiche affiche ceux de l'OF (`GET /:id`), donc l'onglet aussi.
- **Les deux populations sont empilées dans le même onglet** (décision utilisateur du
  2026-08-27) : « Commentaires historiques » puis « Messages de l'atelier ». Le fil
  `message_of` est conservé parce que **la PWA est le seul endroit côté bureau où on peut
  le lire** — 113 messages, toujours alimentés depuis le poste.
- **Le bloc porte le nom ET l'habillage que `CreateOfDialog` lui donne déjà** :
  « Commentaires historiques », le compte en aside, et la carte or
  (`border-gold/30 border-l-4 border-l-gold bg-gold-light/60`). C'est une **exception
  assumée au §8.1** (qui veut une carte blanche dans un onglet de sidebar) : le régleur
  croise ces notes deux fois — au lancement puis sur la fiche — et deux habillages
  différents en faisaient deux choses sans rapport.
- **Les deux blocs finissent par le MÊME déclencheur** : le bouton fantôme `+ Ajouter…`
  du §8, **en mode édition seulement**. `message_of` ouvrait auparavant un textarea
  permanent hors mode édition (delta assumé, retiré le 2026-08-27) : deux contrôles
  d'ajout de formes différentes empilés se lisaient comme deux fonctionnalités
  étrangères. Le composeur de message n'apparaît qu'une fois demandé (§9 InlineForm).
- **La saisie est ouverte sur les deux écrans**, comme le legacy (même table, même dialogue
  `FEN_Editer_Observation`, même confirmation « Voulez-vous vraiment supprimer cette
  observation ? ») : la fiche OF, où le nouveau billet est **pré-ciblé sur le métier et le
  coloris de l'OF**, et Tombé Métier › Références, qui montre toute la référence sans filtre.
- ⚠️ **L'écran Références est le fichier PARTAGÉ d'ETM** : il ne connaît pas `obs_ref_ecru`
  en écriture et ne doit pas apprendre une URL TRM. Il expose donc une prop
  `obsOfEditor` — **un composant**, pas un booléen — et TRM y injecte `ObsOfEditor` depuis
  son `router.tsx`. Sans la prop, l'onglet reste la liste en lecture seule qu'ETM a
  toujours eue. C'est le pendant frontend de `FinanceScope` : améliorer le fichier dans
  ETM, ne jamais en forker une copie TRM.
- **Droit `edit_of`** sur les trois routes d'écriture — pas de nouvelle clé : ces notes
  existent pour être lues au lancement, c'est le même acte. La lecture reste ouverte.
  Côté écran, il faut **la clé ET le mode édition** de l'écran hôte : c'est pour ça que
  `ObsOfEditorProps` porte `isEditing`.
- Écriture HFSQL : `DATE` est réservé → **INSERT positionnel** (ordre physique vérifié sur
  le `SELECT *` runtime : `IDobs_ref_ecru, IDref_ecru, IDmachine, IDcolori_ecru,
  observation, DATE`), UPDATE nommé pour le reste. ⚠️ **Une modification ne re-date pas la
  ligne** : les deux tables trient par `date`, une correction de faute ne doit pas remonter
  en tête. Un coloris non nul doit appartenir à la référence (400 sinon), comme la combo
  legacy qui est paramétrée dessus.
- Le libellé du métier est `machine.emplacement`, `nom` en repli (`machineLabel()`, voir
  le sélecteur de métier plus haut) — jusqu'au 2026-09-02 c'était `nom` seul, parce
  qu'`emplacement` est vide sur les métiers archivés (Vignoni, jersey 1F, terrot, RAY) ;
  le repli couvre ce cas sans afficher « Beck » pour le 1G.
- ⚠️ **Une composition est une liste de POSITIONS D'ALIMENTATION, pas de fils.** Un mélange
  peut alimenter deux fois le même couple (fil, coloris) : la réf. 119/ecru, c'est
  71 % + 14,5 % + 14,5 % de deux fils seulement, et il faut les trois lignes pour faire les
  100 % que la fenêtre legacy contrôle. `composition_ecru` porte donc des lignes en double
  (70 groupes sur 2 859), et les OF que le legacy écrit portent bien la ligne `asso_fil_of`
  dupliquée (vérifié 4/4 sur la réf. 189). **Ne jamais regrouper par couple** : le seed
  `/of-trm/lookups/composition` le faisait (`SELECT DISTINCT` + dédup) jusqu'au 2026-08-26
  et déclarait 85,5 % du fil sur tout OF créé pour une telle référence — erreur silencieuse
  et définitive, puisque le mouvement de stock à la déclaration de pièce comme la freinte à
  l'archivage sont `poids × pourcentage/100`. Les lignes sont donc clés par
  `IDcomposition_ecru`, et le pourcentage n'est sommé par couple que là où c'est la bonne
  question (colonne % et « Potentiel » de l'onglet Stock de fil : ce lot couvre 29 % du
  mélange, pas 14,5). Garde : `check-of-creation-trm.ts`.
- **Le corps de la fiche passe en deux colonnes au-dessus de ~780 px de largeur de
  PANNEAU** — mesurée par `useElementSize` dans `OfDetailBody`, jamais un palier Tailwind.
  `lg:`/`xl:` portent sur la **fenêtre**, or la largeur de ce panneau est fixée par le mode
  master-detail (§4) : à 1400 px de fenêtre il ne fait que ~390 px alors que `xl:` est vrai
  depuis longtemps, et la grille des paramètres y serait déchiquetée. Ses cartes tournent
  aussi sur des paddings resserrés (`cardHeaderClass` / `cardContentClass`) : à `p-6`, cinq
  sections empilées coûtaient ~100 px de pure gouttière, exactement ce qui empêchait un OF
  de tenir sur un écran 1080p — la fiche se lit au métier, le régleur ne doit pas défiler
  pour savoir quels lots alimentent la production qu'il lance. La carte Paramètres est
  `h-full` pour finir sur la même ligne que Commande client.
- **L'en-tête tient sur UNE ligne** (décision utilisateur du 2026-08-27) : « OF N° 3426 »,
  « Créé le … » et le badge Mode édition côte à côte, au lieu du titre puis d'une seconde
  ligne de contexte. Même raison que les paddings resserrés ci-dessus : la date tient en
  quelques caractères et la seconde ligne coûtait ~30 px de hauteur sur chaque OF. **La
  pastille métier n'y est plus** : c'est le premier champ de Paramètres de tricotage juste
  en dessous, et elle est déjà sur la carte de liste qui a mené ici.
- **La consigne porte le même bandeau rouge qu'au poste de visitage**
  (`components/of/ConsigneCallout.tsx`, `mps_designer` §46) : c'est le même
  `ordre_fabrication.observations`, et le montrer en carte calme d'un côté et en alerte de
  l'autre apprenait au lecteur que l'alerte était décorative. La carte neutre reste dans
  deux cas — **vide** (rien à crier, et c'est l'en-tête qui nomme la chose absente) et **en
  édition** (on l'écrit, on ne l'exécute pas : un champ encadré de rouge se lit comme une
  erreur de saisie, et le liseré or du §9 a besoin du cadre). ⚠️ Le rouge est un **étirement
  assumé du §41** : 6 des 10 OF en cours portent une consigne, dont quatre la même phrase
  type. À surveiller — voir §46.2 pour le décompte à rejouer.

