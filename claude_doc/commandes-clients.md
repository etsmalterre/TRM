# Clients › Commandes — modèle de données, « Créer un OF », confirmation de commande

> Dossier de fonctionnalité, sorti de `CLAUDE.md` le 2026-09-02 (le fichier dépassait la limite de 150 k caractères). Contenu repris tel quel ; `CLAUDE.md` n'en garde que le résumé et les pièges majeurs. **Le mettre à jour ici**, pas dans `CLAUDE.md`.

## Commandes clients data model (legacy, shared HFSQL)

- Le registre TRM, c'est `commande_client` / `ligne_commande_client` **scopés `IDsociete = 2`** — les mêmes tables que l'écran ETM, autre partition. Une ligne TRM est toujours `TYPE = 1` (écru) et se compte en Kg : TRM tricote du tombé métier, rien d'autre.
- ⚠️ **Une commande dont `IDcommande_ETM > 0` est un miroir d'une commande sous-traitant ETM, et elle est en LECTURE SEULE ici.** ETM pilote son entête et ses lignes et les redescend ; il n'y a **pas** de synchro retour, donc une écriture côté TRM diverge en silence. C'est le cas courant, pas le cas limite : 93 % du registre. L'écran masque Modifier / l'édition des lignes / la clôture, et l'API refuse en 409 (`commande_miroir_etm`). Seules les commandes natives (`IDcommande_ETM = 0`) sont éditables.
- Le suivi d'une ligne passe par la **production**, pas par la réservation de stock comme côté ETM : `ordre_fabrication.IDligne_commande_client` → pièces sur **`stock_ecru.IDLigne_Commande_TRM`** (surtout pas `IDligne_commande_client`, qui reste à 0 sur les lignes TRM) → `ligne_expedition` via `IDligne_expedition_TRM`. « Produit » = somme des poids de ces pièces ; « expédié » = celles dont `IDligne_expedition_TRM > 0`.
- La pastille « 37 % » de la fiche ligne du legacy est la **marge** : `(prix − PrixDeRevientTRM) / prix`. Elle vit dans `ETM/apps/api/src/lib/pricing-trm.ts`, comme le calcul du tarif suggéré — mais ce sont deux fonctions distinctes, pas interchangeables.
- **Le tarif suggéré à la saisie d'une ligne = `max(PrixDeRevientTRM, ref_ecru.prix) / 0,7`** (règle `'cost-floor'`, décision utilisateur du 2026-08-26). `ref_ecru.prix` est la **base sûre** : c'est un plancher sur le *coût*, donc la plus haute des deux assiettes porte les 30 % de marge et une commande client TRM ne sort jamais sous base + 30 %. Le dialogue affiche laquelle des deux a été retenue — sans ça les deux apps annoncent des chiffres différents sans explication.
  - ⚠️ **Ce n'est PAS `trmLinePrix`**, qui reste sur la règle legacy `'price-floor'` (`max(cost / 0,7 ; base)`, la base gagne à plat quand elle est la plus haute). `trmLinePrix` price les lignes de **sous-traitance ETM → TRM** et doit continuer à coller au WinDev qui les écrit encore (vérifié 15/15 sur les lignes miroir récentes, ex. réf. 4 @500 kg stockée à 2,07 € = la base nue). Les deux règles diffèrent de ~+39 % en valeur : ne pas les « unifier » sans trancher aussi le prix de transfert intercompany.
  - ⚠️ **Le legacy, lui, ne calcule rien sur cet écran** : l'événement « sélection d'une ligne » de `COMBO_Reference` dans `FEN_Gestion_d_une_référence_de_commande_client` lit `ref_ecru.prix` et s'arrête là (récupéré du cache de compilation WinDev). D'où un tarif proposé visiblement plus bas côté legacy — c'est attendu, pas une régression. Les lignes natives historiques sont de toute façon négociées : sur 491 lignes type 1 avec prix, 315 sont *sous* le prix catalogue et 158 au-dessus.
- `ligne_commande_client.prix` est un **réel 4 octets** : un prix enregistré à 2,88 se relit 2.880000114440918. Tout champ de saisie qui le réaffiche doit arrondir le bruit flottant (4 décimales suffisent — les lignes miroir ETM portent de vrais prix à 4 décimales).
- Autres sources du tiroir Progression : `composition_ecru` → `stock_fil` (onglet Stock de fil ; le « potentiel » est borné par le composant le plus rare du mélange) et `ref_ecru_machine` → `machine.nom` (le « Compatible sur : 1H, 3F… » du pied de page).
- ⚠️ **L'onglet Stock de fil est scopé au CLIENT DE LA COMMANDE.** TRM tricote **à façon** :
  le fil est fourni par le client, donc une commande ne peut tourner que sur les lots que
  *son* client possède. `stock_fil` n'est pas partitionné par société — `IDclient` est la
  seule chose qui dit à qui appartient un lot. Les trois filtres sont ceux de la requête
  legacy, verbatim : `IDclient = <client de la commande>`, `IDMagasin = 1` (le magasin
  TRM), `terminé = 0`. Sans eux, l'onglet proposait le lot 10131 (Ets Malterre) sur la
  commande 2799 (Bonneterie Gautier) — et l'inverse aussi, des lots Gant Maille ou La
  Gentle Factory sur des commandes Ets Malterre (remonté par l'utilisateur le 2026-08-26,
  garde `ETM/apps/api/src/scripts/check-stock-fil-commande-trm.ts` : 5 lots retirés sur
  4 des 15 lignes ouvertes, tous appartenant à un autre client).
  - ⚠️ **`stock > 0` n'équivaut PAS à `terminé = 0`** : 3 lots sont archivés avec du stock
    dessus. Les deux filtres sont nécessaires.
  - `terminé` est accentué, donc lecture **scindée par plateforme** (`archivedLotIds`) :
    Windows accepte l'identifiant dans un WHERE mais rend zéro ligne sur `SELECT *` (colonnes
    memo-binaires), le pont Linux est l'exact inverse. Aucune forme ne marche des deux côtés.
  - Conséquence assumée : sur ces 4 lignes l'onglet est désormais **vide**, et c'est la
    vérité (le client n'a pas fourni de fil pour cette référence). L'état vide nomme donc le
    client — « Aucun lot de fil de Bonneterie Gautier pour cette composition » — sinon il se
    lit comme un écran cassé, le fil étant bien au magasin mais sous un autre propriétaire.

### « Créer un OF » depuis l'onglet Stock de fil

Le tiroir Progression d'une ligne : on coche les lots de fil à tricoter dans l'onglet
**Stock de fil**, un bouton **Créer un OF** apparaît dans le pied de l'onglet, et il ouvre le
dialogue de création avec la ligne imposée et les lots affectés aux positions de la
composition qu'ils peuvent alimenter. Port du bouton legacy en bas à droite du même onglet.

- **Le bouton est sous `edit_of`**, la clé de Production › Gestion des OF — pas
  `edit_commandes_client`, qui garde la commande et non la production. C'est la même clé que
  `POST /of-trm` exige, sinon le bouton ouvrirait le dialogue pour finir en 403.
- **Le bouton n'apparaît que si CHAQUE fil de la composition a un lot coché** (décision
  utilisateur du 2026-08-26) : un OF à qui il manque un de ses fils n'est pas tricotable, et
  le dialogue s'ouvrirait avec un composant sans lot. La couverture se teste contre
  `composants` — la liste complète des couples (fil, coloris) de la référence renvoyée par
  `/stock-fil`, **y compris ceux dont ce client n'a aucun lot**, cas que `lots` ne sait pas
  exprimer. Tant que ce n'est pas couvert, le pied de l'onglet nomme le fil manquant au lieu
  de laisser le bouton mystérieusement absent.
- **Le dialogue est partagé, pas dupliqué** : `apps/web/src/components/of/CreateOfDialog.tsx`,
  ouvert aussi par Production › Gestion des OF (« Nouveau », où l'utilisateur choisit la
  ligne). La différence entre les deux entrées est une prop (`presetLigneId` +
  `presetLotIds`), jamais une copie. Il a été sorti de `ProductionOf.tsx` pour ça et porte
  toute la fenêtre legacy : visitage, nettoyage, finir le fil, ouvert au large, maille
  d'ouverture, sonneter, consigne, **Ajouter un fil** et **Incorporer un fil**. Les deux
  sélecteurs de fil vivent dans `components/of/FilPickers.tsx`, partagés avec la fiche OF.
- **Écran scindé, comme la fenêtre legacy** (`mps_designer` §18.C, `max-w-5xl`) : à gauche
  **l'OF lui-même** — ses réglages (métier, poids/pièce, quantité, nb pièces, visitage,
  nettoyage, options) et ses fils ; à droite **ce que le régleur lit puis écrit** — les
  « Commentaires historiques » de la référence, la consigne au bonnetier et l'activation
  automatique. La consigne est juste sous les commentaires : elle s'écrit le plus souvent
  en réponse à eux. Sous `lg`, les colonnes s'empilent et le corps défile d'un bloc.
- **Trois niveaux de fond, tous chauds** (décision utilisateur du 2026-08-26, après deux
  essais refusés — corps zinc « nulle part dans les logiciels Malterre », puis blanc pur
  « agressif ») : feuille de gauche `bg-secondary` (38 12% 96 %), panneau de droite
  `bg-sand` (38 20% 93 %, un cran plus foncé pour qu'il se lise comme un panneau), et
  **blanc pur par-dessus** — les cartes, les champs, les tableaux. Les bandeaux d'en-tête
  et de total des tableaux sont en `bg-sand`, jamais en zinc : le gris froid est le langage
  des tiroirs et des panneaux d'écran, il vire boueux sur une feuille chaude.
- **Chaque section est une `Card` `card-premium` de l'app**, pas une mise en page maison :
  même surface blanche arrondie, même ombre bleutée, même en-tête (icône dorée 4×4 +
  `CardTitle text-sm font-semibold`), mêmes libellés de champ que le `KV` de la fiche OF.
  Une version intermédiaire regroupait par « titre + filet », ce qui organisait la même
  chose correctement mais dans un vocabulaire que l'app n'emploie nulle part — c'est ce qui
  faisait que le dialogue ne ressemblait pas au reste. Les deux déclencheurs « Ajouter »
  vivent dans l'en-tête de leur carte (`action`), à la manière de la barre d'outils legacy.
- **Le sélecteur de métier ne liste que les métiers compatibles** (`ref_ecru_machine`, la
  même source que le « Compatible sur : … » du tiroir). Sur les 11 références des commandes
  ouvertes, aucune n'est sans fiche machine et 8 en listent 1 à 3 — contre 37 métiers au
  parc : proposer le parc entier revenait à faire chercher 3 lignes dans 37. Repli s'il
  n'existe aucune fiche pour la référence : le parc complet, et le champ dit pourquoi
  (sinon l'OF serait tout simplement impossible à créer).
- **La composition est un brouillon éditable, pas le seed relu.** % modifiable, ligne
  retirable, fil ajoutable hors fiche écru — et c'est nécessaire : `POST /of-trm` exige au
  moins une ligne, donc une référence sans `composition_ecru` ne serait **pas lançable** si
  le dialogue ne servait que le seed. Le total des pourcentages passe en ambre dès qu'il
  s'écarte de 100 (le legacy affiche le même total).
- **Les fils incorporés se posent à la création** : `POST /of-trm` accepte un tableau
  `incorpore` (mêmes lignes que `PUT /:id/incorpore`), sinon il aurait fallu créer l'OF
  puis le modifier dans la foulée.
- **« Observations Régleur » = `obs_ref_ecru`, PAS `message_of`.** Ce sont les consignes
  durables portées par la **référence écru** (« Attention risque de trous », « Faire
  impérativement des pièces de 21 kgs minimum »), écrites dans l'onglet « Obs OF » de la
  fiche référence du legacy, et **portées par métier et par coloris** — `IDmachine = 0` vaut
  « Toutes », `IDcolori_ecru = 0` vaut « Tout coloris ». Le lancement est le moment où elles
  comptent : le régleur voit l'historique de cette référence sur ce métier et le répercute
  aux bonnetiers. Endpoint `GET /of-trm/lookups/observations?ligne=&machine=`, dont le
  prédicat est celui du legacy récupéré **verbatim dans le cache de compilation WinDev**
  (`FEN_Gestion_d_un_OF` / `FI_Gestion_OF`) :
  `IDref_ecru = :ref AND (IDmachine = :machine OR IDmachine = 0) AND (IDcolori_ecru = :colori
  OR IDcolori_ecru = 0) ORDER BY date DESC`. Tant qu'aucun métier n'est choisi, `machine = 0`
  ne fait donc remonter que les observations « Toutes » — le dialogue le dit au lieu de
  laisser croire qu'il n'y en a aucune. `date` est un mot réservé (aliasé au SELECT), et les
  libellés sont résolus à plat, jamais par le JOIN du legacy (le pont Linux mange les accents
  en jointure).
  - **La saisie est portée depuis le 2026-08-27** — voir « Observations régleur » plus bas.
    Le dialogue de création, lui, reste en **lecture seule** sur ce bloc : on lance un OF,
    on n'écrit pas la doctrine de la référence au même moment.
- ⚠️ **« Ajouter un fil » sert à DEUX choses**, confirmées par le régleur puis dans le
  registre (2026-08-26) — la seconde avait été ratée au premier port :
  1. **Tricoter un fil absent de la fiche écru**, comme variation volontaire de la
     référence (souvent pour écouler du stock interne sans impact client). 271 OF sur
     3 175 en portent un ; par année 37 % en 2020, puis 2,8 / 4,7 / 1,6 / 5,5 % de 2023 à
     2026 — le pic ancien est surtout de la dérive de composition, le résidu récent est du
     vrai écart. La traçabilité que ça demande **existe déjà** : l'OF fige sa propre
     `asso_fil_of` et ne relit jamais `composition_ecru`.
  2. **Servir une même part du mélange depuis PLUSIEURS lots.** Sur 105 groupes
     (OF, fil, coloris) à 2 lignes ou plus dans `asso_fil_of`, **83 sont sur le même lot**
     (vraies positions d'alimentation dupliquées, cf. la règle ci-dessous) et **22 sur des
     lots différents**, dont 18 portent plus de lignes que la référence n'en déclare, le
     pourcentage étant **éclaté** et non dupliqué : réf 97 % → OF 70 + 27 ; réf 95 % →
     47,5 + 47,5 ; réf 31 % → 15,5 + 15,5. Le dialogue le permet déjà (ajouter deux fois
     le même fil, un lot par ligne).
  Ne pas confondre le cas 2 avec la règle des positions d'alimentation plus bas : les deux
  produisent des lignes en double sur le même couple (fil, coloris), et c'est **le lot**
  qui les distingue.
- **Les deux usages ont chacun leur affordance** (livrés le 2026-08-26, à la demande de
  l'utilisateur après retour du régleur) :
  - **« compléter » sur une ligne courte** (icône `Split`, le vocabulaire de « Diviser »
    de Fils › Stock) : quand le lot choisi ne couvre pas le besoin, le bouton éclate la
    ligne en deux — la première garde ce que le lot couvre (`stock / quantité × 100`,
    arrondi au centième), la seconde reçoit le reste sans lot, et **hérite de la liste de
    lots de sa source** pour que son sélecteur soit prêt sans second appel. La sœur
    s'insère juste sous sa source, pas en fin de tableau. N'existe **que dans le dialogue
    de création** : la ligne d'édition de la fiche OF ne connaît pas la quantité, donc ni
    le besoin ni « court ».
  - ⚠️ **Le test de manque est par LOT, jamais par ligne.** Deux lignes peuvent
    légitimement tirer du même lot (positions d'alimentation : 83 des 105 groupes en
    double du registre), donc « ce lot est-il pris deux fois ? » est la mauvaise question ;
    la bonne est « les lignes lui demandent-elles ensemble plus qu'il ne contient ? ».
    Tant que le test était par ligne, un « compléter » repointé sur son propre lot source
    s'affichait au vert alors que les deux moitiés tiraient sur le même stock — 54,2 +
    45,8 Kg pris à un lot de 54,2 Kg (remonté par l'utilisateur le 2026-08-26). D'où
    `besoinParLot` / `besoinAilleursParRow` dans le dialogue : une ligne dont le lot est
    partagé affiche **« reste X Kg »** (ce qu'il lui laisse) au lieu de « stock X Kg », et
    le sélecteur annonce « déjà N Kg pris par une autre ligne » sur les lots concernés.
    **Ne jamais “corriger” ça en interdisant le doublon** : ça casserait les positions
    d'alimentation.
  - Reste ouvert : la même surconsommation reste possible depuis l'onglet composition de
    la **fiche OF** (`CompositionEditRow`), qui n'a aujourd'hui aucun contrôle de stock —
    lacune préexistante, pas une régression.
  - **badge « hors réf »** (`components/of/HorsRefBadge.tsx`, partagé par le dialogue et
    la fiche) sur tout fil absent de `composition_ecru`. Sans lui l'information n'existait
    que dans la base : l'OF fige bien sa composition, mais rien ne la montrait, ni au
    lancement ni six mois après — or c'est précisément l'intérêt de tracer une variation.
    Côté fiche c'est l'API qui décide (`composition[].hors_ref` dans `GET /of-trm/:id`,
    porté dans le brouillon d'édition) ; côté dialogue c'est calculé sur le seed, parce
    qu'une ligne peut devenir hors réf et le redevenir pendant la saisie.
    - **Neutre (`bg-accent/10`), jamais ambre** : une variation est une décision normale,
      pas une anomalie — et sur les OF d'avant 2022 le marqueur attrape surtout de la
      dérive de composition (la fiche de la référence a changé depuis), donc l'ambre
      crierait au loup sur l'historique.
    - **`false`, jamais `null`, quand la référence ne déclare aucune composition** :
      « tout est hors réf » serait du bruit, pas de l'information.
    - Garde : `ETM/apps/api/src/scripts/check-hors-ref-trm.ts` — 316 lignes marquées sur
      5 064, 271 OF sur 3 175, et par année 37 % en 2020 → 1,6 / 5,5 % en 2025-2026.
- **Le champ Lot ne porte que le numéro de lot ; son poids est un libellé à droite du
  champ** (« stock 168,8 Kg », en rouge + ⚠ « · manque » quand le lot ne couvre pas le
  besoin). Décision utilisateur du 2026-08-26 : on choisit un lot, et *ensuite* on lit son
  poids comme une information. Concrètement le poids voyage en **`description`** de
  `PopoverSelect` (rendu dans les lignes du popover seulement), **jamais en `secondary`**
  — `secondary` est aussi concaténé sur le bouton, ce qui donnait un champ fermé lisant
  « 10131 — 168,8 Kg ». Même règle dans les trois endroits qui listent des lots :
  `CreateOfDialog`, `FilPickers.LotPickerPanel` et le `CompositionEditRow` de la fiche OF.
- Sélection multi-lignes = **`mps_designer` §44** (ancre en `useRef`, MAJ+clic pour une
  plage, `select-none` sur la ligne). `PanelTable` a gagné `selectedIds` + l'événement
  transmis à `onRowClick` pour ça.
- L'OF naît **en attente, en fin de file du métier** (c'est `POST /of-trm` qui le décide,
  comme le flux legacy) : la création ne démarre rien, l'activation reste un acte distinct.
- Un lot coché qui n'entre dans aucune position de la composition est **annoncé et ignoré**
  (le cas normal : la sélection couvre deux écrus différents).

### Confirmation de commande (Imprimer · Envoyer par email)

Les deux boutons de l'entête de la fiche, sur `GET /commandes-trm/:id/pdf`,
`GET /:id/email-defaults`, `POST /:id/email`.

- **Le PDF n'est PAS un template TRM** : les deux sociétés confirment une commande de la
  même façon, donc c'est `ETM/apps/api/src/lib/pdf/CommandeClientPdf.tsx` — celui de l'écran
  ETM — rendu avec **`company: companyTrm`** (obligation légale : TRM signe, donc pied de
  page au SIRET / TVA / capital de Tricotage Malterre). Le composant a gagné pour ça deux
  champs optionnels, `company` et la `designation` par ligne : améliorer ce fichier dans ETM,
  ne jamais en forker une copie TRM. Précédent identique : `FacturePdf.data.company`.
- **Deux écarts assumés avec le legacy** (ce sont les choix du document ETM) : le tableau
  porte une colonne montant et un bloc de totaux (HT · remise · TVA · TTC) que le legacy
  n'imprime pas, et la désignation écru s'affiche sous la référence à la place de la ligne
  « V/ref ». La TVA vient de la fiche client (`loadClientTvaRate`) — un client export à 0 %
  doit être confirmé à 0 %.
- **Disponible aussi sur les commandes miroir.** La règle du miroir porte sur les
  *écritures* : lire ce qu'ETM a commandé à TRM et le lui confirmer, c'est exactement ce
  qu'est une confirmation de sous-traitance, et le legacy les imprime aussi. Les trois
  routes 404 en revanche sur un id de société 1 — `commande_client` est un seul espace d'ids,
  donc c'est le seul garde-fou de partition (script `check-commande-trm-pdf.ts`).
- **Pas de CGV en pièce jointe**, contrairement à la confirmation ETM : ce sont les
  conditions d'ETS Malterre, TRM n'a pas les siennes. L'envoi journalise dans `envoi_email`
  avec `IDtype_doc = 7` (`notes` vide, comme la confirmation ETM) — aucun écran TRM ne le
  relit aujourd'hui, c'est de la traçabilité.

