# TRM

> **Note**: this project was called `MPS-TRM` until 2026-07-30, when the repo and
> folder were renamed to **TRM** (alongside its sister `MPS_NG` → **ETM**).
> Deliberately unchanged because they are deployed infrastructure, not the project
> identity: the server dist path `/home/debian/mps_trm` and the workspace package
> name `@mps-trm/web`. The production **hostname did follow**, on 2026-08-26:
> `mpstrm.malterre` → **`trm.malterre`** (the DNS moved first; the old name no longer
> resolves, though nginx still answers to it as an alias).

## Project Overview

TRM is the ERP web app for **Tricotage Malterre (TRM)**, the knitting production company of the Malterre Holding. It is the sister app of **ETM** (`C:\dev\etsmalterre\ETM`, the ETS Malterre ERP) and replicates its design and architecture exactly, migrating the legacy WinDev app's "Tricotage Malterre" mode screen by screen.

- **Company**: Tricotage Malterre (TRM) — knitting production (tricotage)
- **Owner**: Vincent Malterre
- **Legacy system**: the WinDev MPS app (`C:\Mes Projets\MPS\`) in Tricotage Malterre mode (red banner), plus the older standalone `C:\Mes Projets\TRMPROD\`
- **Sister project**: ETM (`C:\dev\etsmalterre\ETM`) — same design system, same conventions, same DB, same API

## Architecture — frontend-only repo, shared API and DB

**This repo contains only the web frontend.** There is deliberately no API here:

- **Database**: the shared HFSQL `MPS` database (same server as ETM). Shared tables (`client`, `commande_client`, …) are partitioned by `IDsociete` — **TRM = 2** (ETM = 1, Confection = 3). Every TRM write must set `IDsociete = 2`.
- **API**: the **ETM API** (`C:\dev\etsmalterre\ETM\apps\api`, dev port 8080). All HFSQL footgun-handling (encoding repair, bridge storm protection, accented columns, positional inserts) and TRM-specific logic (ETM↔TRM cross-ledger bridge, `isTricotageMalterreSst`) already live there. **New TRM endpoints get added to the ETM API**, scoped `IDsociete = 2` — never build a second API stack on the shared tables.
- **Auth**: the shared cookie auth (`mps_uid`) against the same API — login/user-picker, permissions and admin gating work identically to ETM.
- **Dev CORS**: this app runs on port **5175**, which is already in the ETM API's `CORS_ORIGIN` list (`apps/api/.env.development`). If the port changes, update that list.

When implementing a feature here you will therefore usually touch **two repos**: the screen in `TRM/apps/web`, and its endpoints in `ETM/apps/api`. All HFSQL rules from `ETM/CLAUDE.md` apply to those endpoints — read them before writing any route.

**Paired-worktree rule for API changes**: API work is done in an **ETM worktree** (never in the ETM main checkout — that's NG's integration tree) and lands through NG's own pipeline (`feat/*` → NG `master` → `/etm_deploy`). A TRM feature needing endpoints = a pair of same-named worktrees, the TRM one spun up with `--api 808N` pointing at the NG one. Landing order: NG branch first, then TRM. Full rule: `ETM/claude_doc/worktrees.md` §"Shared-API changes"; the `/feature-complete` skill enforces the guardrail.

## Production / deploy

- **Host**: `http://trm.malterre` — nginx on `mfprod-erp` (`10.10.2.165`), dist at `/home/debian/mps_trm/dist`, `/api/` proxied to the shared ETM API (`10.10.2.163:8081`).
- **Deploy ownership**: this repo's `/trm_deploy` skill ships the **TRM web bundle only**. The shared API (and `mpsng.malterre`) is deployed exclusively from the ETM checkout with its `/etm_deploy`. If a TRM feature needed API changes, the API deploy (from ETM) must happen **before or with** the TRM web deploy.

## Branding

Identical to ETM — same colors, same design system:

| Color | Hex | Usage |
|-------|-----|-------|
| **Primary Blue** | #143D6B | Sidebar, navigation, headers |
| **Vivid Gold** | #F2B80A | CTAs, highlights, active states |
| **Accent Blue** | #3B7DC9 | Links, alternative accent |

Full design system: **`../ETM/.claude/skills/mps_designer/SKILL.md`** — the one and only
copy. This repo's `.claude/skills/mps_designer/SKILL.md` is a short **pointer** to it, not a
duplicate: it used to be a full copy with a "re-sync when it changes" note, that never
happened, and by 2026-07-30 it was 709 lines behind and teaching patterns ETM had already
replaced. Never restore the copy — improve ETM's file instead.

The `public/logo-*.png` files are currently the ETM logos as placeholders — replace with TRM logos when available.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + TypeScript 5.7, Vite 6, Tailwind CSS 3.4 |
| UI | Radix primitives (shadcn-style), Lucide icons |
| State | TanStack React Query 5 |
| Monorepo | pnpm + Turborepo (apps/web only for now) |
| API (external) | ETM Express API on HFSQL — see Architecture above |

## Navigation Structure

Mirrors the legacy WinDev app in Tricotage Malterre mode (top → bottom):

1. **Tableau de bord** (`/`, `/tableau-de-bord/:id`) — implemented, the ETM widget grid shared verbatim (see "Tableau de bord" below). Widgets propres à TRM : **Poids des pièces** et **Pièces à visiter**, plus les quatre widgets financiers d'ETM sur la partition société 2.
2. **Clients** — **Commandes** (`/clients/commandes`, implemented — voir "Commandes clients" ci-dessous), **Expéditions** (`/clients/expeditions`, implemented — TRM-specific, NOT shared, see below), **Facturation** (`/clients/facturation`, implemented — TRM-specific, NOT shared, see below), **Gestion** (`/clients/gestion`, implemented — see "Clients › Gestion" below), Planning
3. **Fils** — **Références** (`/fils/references`, shared verbatim with ETM), **Stock** (`/fils/stock`, implemented — TRM-specific, NOT shared, see "Fils › Stock" below), **Fournisseurs** (`/fils/fournisseurs`, shared verbatim with ETM)
4. **Tombé Métier** — **Références** (`/tombe-metier/references`, implemented — shared verbatim with ETM, see "Shared screens" below), Échantillons, **Stock** (`/tombe-metier/stock`, implemented — TRM-specific, NOT shared, see below). Menu icon is the custom `TmRollIcon`.
5. **Production** — **Ordres de fabrication** (`/production/of`, implemented — see "Production › Ordres de fabrication" below), **Visitage** (`/production/visitage`, implemented — see "Production › Visitage" below), **Prime** (`/production/prime`, implemented — see "Production › Prime" below), TRS
6. **Atelier** — **Maintenance** (`/atelier/maintenance`, implemented — see "Atelier › Maintenance" below), Bonnetier, **Planning** (`/atelier/planning`, implemented — weekly bonnetier grid over `planning_bonnetier` + desiderata dialog; API route `ETM/apps/api/src/routes/planning-atelier.ts`)
7. **Qualité** — Défauts récents, **Retour client** (`/qualite/retour-client`, implemented — the menu’s index redirect, see "Qualité › Retour client" below), Analyse
8. **Rapports** — **Finance** (`/rapports/finance`, implemented — the menu's only screen, shared verbatim with ETM; see "Rapports › Finance" below). The Production / Lots de fils / État stock fil / Analyse placeholders were removed with it.
9. **Paramètres** — **Utilisateurs** (`/settings/utilisateurs`, implemented, admin-only — see "Paramètres › Utilisateurs" below)

All other screens are `PagePlaceholder`s for now. Legacy references for each domain: `FEN_Gestion_des_OF.wdw`, `FEN_Machines.wdw`, `FEN_Rapport_de_production.wdw`, etc. in `C:\Mes Projets\TRMPROD\` and the main MPS WinDev project (`FI_Planning_Atelier.wdw`, `FEN_Desiderata.wdw` in TRM mode).

### Commandes clients data model (legacy, shared HFSQL)

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

#### « Créer un OF » depuis l'onglet Stock de fil

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

#### Confirmation de commande (Imprimer · Envoyer par email)

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

### Clients › Expéditions data model — why it is NOT a shared screen

`expedition` / `ligne_expedition` are shared tables partitioned by
`expedition.IDsociete` (**TRM = 2**), but the two companies ship different
merchandise, so the ETM screen could not take a `societe` param. TRM has its own
screen (`apps/web/src/pages/ClientsExpeditions.tsx`) over its own endpoints
(`ETM/apps/api/src/routes/expeditions-trm.ts`, mounted at `/api/expeditions-trm`):

| | ETM expédition (IDsociete 1) | TRM expédition (IDsociete 2) |
|---|---|---|
| Merchandise | finished rolls (`stock_fini.IDligne_expedition`) or bought écru (`stock_ecru.IDligne_expedition_ETM`); the line's `TYPE` decides | always tombé de métier it knitted: **`stock_ecru.IDligne_expedition_TRM`** |
| Piece identity | lot + numéro + métrage + magasin | numéro + poids + **métier** (`ordre_fabrication.IDmachine` → `machine.nom`) + visitage défauts. `lot`, `metrage` are empty, `IDmagasin` is 0 |
| Free-stock pool | `stock_*.IDligne_commande_client` | **`IDLigne_Commande_TRM`** — `IDligne_commande_client` is 0 on every TRM row |
| Buckets | Textile / Diverses | Textile only — `expedition_divers` has **no** `IDsociete` column, so misc shipments are ETM-only |
| Documents | avis d'expédition + rapport de contrôle + info matières (3-item print menu) | avis d'expédition only — the visitage findings ride in its Défauts column |

**The handover rule (the one real footgun).** When TRM ships to ETS Malterre —
which is most shipments — ETM's reception takes **ownership** of the piece: the
legacy flow flips `stock_ecru.IDsociete` from 2 to 1 and stamps
`lot = 'trm<IDexpedition>'`. So a delivered avis's pieces are no longer TRM rows.
Reads therefore **never filter on IDsociete** (filtering would make every
delivered avis read "0 pièces"); writes **require `IDsociete = 2`** and the API
409s on any attempt to pull a received piece back off an avis, or to delete an
avis holding one. Shipments to a third-party client (e.g. Bonneterie Gautier)
keep their pieces at `IDsociete = 2`.

Like ETM, the legacy **validé / dévalider** concept stays retired: an expedition
is "non facturée" (editable) or "facturée" (`est_facture = 1`, or a definitive
facture references one of its `ligne_expedition` rows) and then every write 409s.
`est_valide` is written once at INSERT (0) and ignored. The accented
`envoyé_client` / `envoyé_sst` columns (the legacy list's two checkboxes) are
never named in SQL — that storms the Linux bridge — so they are not surfaced.

The avis d'expédition PDF is the shared `BonLivraisonPdf` with `variant: 'trm'`
(ports `ETAT_Expédition_TRM`): Tricotage Malterre's own footer (`companyTrm` in
`lib/pdf/theme.ts` — its own SIRET/TVA/capital, a legal requirement), a Défauts
column, no Métrage, and lots identified by *métier + lots Malterre + lots
fournisseur* rather than a lot code. Grouping is per `ordre_fabrication`: every
piece of an OF shares the machine and the yarn lots (`asso_fil_of` → `stock_fil`
`lot` / `lot_frs`), which is exactly that header line. The legacy **CSV TAD**
export is deliberately not ported.

### Clients › Facturation — partitioned, but the SAME object as ETM's

`facture` / `facture_prov` are partitioned by `IDsociete` like `stock_ecru`, but unlike it
the two halves are the **same object** (same columns, same lifecycle, same screen). So the
API is **one router factory mounted twice** — `createFacturesRouter(scope)` in
`ETM/apps/api/src/routes/factures.ts` → `/api/factures` (ETM) + **`/api/factures-trm`**
(TRM) — not a second route file. Everything société-dependent lives in one `FacturesScope`.
When a future TRM screen hits a partitioned table, pick between the two shapes on that
"same object?" test; don't default to copying `stock-ecru-trm.ts`.

The screen (`apps/web/src/pages/ClientsFacturation.tsx`) mirrors ETM's, with two
deliberate deltas:
- **Code comptable is exposed** in the Info tab (editable on a proforma). The legacy TRM
  facture window shows it and TRM really varies it — 478 of its 512 invoices on "Vente à
  façon", 33 on "Vente à façon internationale". It decides which sales account the XImport
  export posts the HT half to. ETM's screen leaves it implicit.
- **No "non envoyé" red liseré / counter pill.** TRM does not email its invoices: 511 of
  512 definitive factures have no `envoi_email` row (ETM has 1 517 that do), so the
  attention state would paint the whole list red — the noise `mps_designer` §41 rules out.
  If TRM ever starts sending from this screen, reintroduce it **with a go-live date cutoff**
  so the historical ledger stays neutral.

Proforma generation reads the rolls through `stock_ecru.IDligne_expedition_TRM` (ETM uses
`IDligne_expedition_ETM`) — the same physical roll carries both over its life, so reading
the wrong column invoices the wrong shipment's weight.

### Tombé Métier › Stock data model — why it is NOT a shared screen

`stock_ecru` is partitioned by `IDsociete`, and the two halves are **different objects**,
so the ETM screen could not simply take a `societe` param. TRM has its own screen
(`apps/web/src/pages/TombeMetierStock.tsx`) over its own endpoints
(`ETM/apps/api/src/routes/stock-ecru-trm.ts`, mounted at `/api/stock/ecru-trm`):

| | ETM écru (IDsociete 1) | TRM écru (IDsociete 2) |
|---|---|---|
| Origin | bought from a tricoteur | knitted in-house: `IDordre_fabrication` → `ordre_fabrication.IDmachine` → `machine.nom` (the métier), `IDpiece_production` for the visitage timings |
| Storage | `IDmagasin` → `sous_traitant` | always 0 — TRM has no magasin dimension |
| Next step | affected to an ennoblisseur (`IDref_commande_affectation`), then becomes a `stock_fini` | shipped to the customer, usually ETM |
| "Still in stock" | `IDligne_expedition_ETM = 0` + no `stock_fini` child | `IDligne_expedition_TRM = 0` (~1k of ~6.7k rows) |
| Client reservation | `IDligne_commande_client` | **`IDLigne_Commande_TRM`** — `IDligne_commande_client` is 0 on every TRM row |
| Status filter | Disponible / En teinture / Tous | Disponible / Affecté / Tous — there is no teinture step in TRM's ledger |

`lot` and `metrage` are empty on TRM rows, so neither gets a column. The chain
`ligne_commande_client → commande_client → client` is identical, so
`resolveClientReservations` is **exported** from `stock-ecru.ts` and reused rather than
duplicated — same for `fetchDefectsByEcru` / `defautSummary`.

The screen is read-only: pieces are created and closed by the production/visitage flow,
never edited from here.

### Clients › Gestion (`/clients/gestion`) — port of `FI_Gestion_Client_TRM.wdw`

"Classeur" layout (`mps_designer §39`): left list · detail header · master-tabbed center · Info/Contacts/Adresses sidebar. Screen `apps/web/src/pages/ClientsGestion.tsx`; API `ETM/apps/api/src/routes/clients-trm.ts` (mounted `/api/clients-trm`, scoped `IDsociete = 2` — 27 clients).

**Not a shared `@etm` screen, on purpose.** ETM has the same window but a different fiche (tarifs/références catalog, marchandise expédiée, journal commercial) and a different ledger. Only the *server* plumbing is shared, via `ETM/apps/api/src/lib/clients-common.ts` — which both `clients.ts` and `clients-trm.ts` import, and which also registers the polymorphic contact/adresse CRUD on both mounts. Improve that lib rather than forking helpers.

- **TRM-only fields**: `client.rib`, `client.domiciliation`, `client.IDtransporteur`, and « Attente paiement facture » = the accented **`client.bloqué`** flag. Writes to it go through `setClientFlag` (delete + positional reinsert), never a named `SET` — the Linux bridge rejects accented identifiers, and prod is Linux.
- **Fields the TRM fiche does NOT have** (they belong to the ETM one): `client_interne`, `IDsecteur_activite`, `IDactivite`, `journal_commercial`, `dernier_contact`, `inclureRapportQualite`, `pct_ajeol` — so there is no « Général » card in the Info tab, and « Nouveau client » asks only for the nom and the compte. The API **must never name those columns in an UPDATE**: unnamed keeps the stored value, named would zero it. (All 27 société-2 rows currently hold 0 for the first three, which is itself evidence the legacy screen never wrote them.)
- **`tva` and `code_comptable` are partitioned by société.** TRM's « Vente à façon » is a different row from ETM's « VENTE FACON »; always use the `/clients-trm/lookups/*` endpoints, never ETM's.
- **Historique des commandes** — `commande_client` société 2, **including** the ETM-mirrored orders (`IDcommande_ETM > 0`): on this side those 2 518 rows *are* the knitting ETM ordered from TRM. Line types 1 (écru) / 2 (fini) / 3 (divers) / **4 (Confectionneur — `type_sst` 4, resolved against the écru catalog)**.
- **Stocks de fil** — `stock_fil.IDclient` is the yarn's owner (TRM knits à façon, the client supplies the fil).
- **Two deliberate gaps**, both because the legacy `.wdw` is PCS-compressed and unreadable:
  - the « En Attente » radio of Stocks de fil is **not implemented** (only En cours / Historique / Tous). `terminé` is the single state flag on `stock_fil`; `niveau` is the rack level, `controlé` is 0 on every open lot, and OF affectation doesn't fit either — nothing backs a third state. Do not invent one.
  - the historique's « Marge Brute » column is **rendered but always empty** (`marge_brute: null` from the API). Every observable legacy value is 0,00 %, so the formula could not be recovered. Fill it in when the calculation is specified.

### Production › Ordres de fabrication (`/production/of`) — port of FEN_Gestion_des_OF.wdw

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
  ceil(quantite/poids_piece); quantité locked once production started.
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

#### « Observations régleur » (`obs_ref_ecru`) — l'onglet Obs. et l'onglet Obs OF

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
- Le libellé du métier vient de `machine.nom`, pas de `machine.emplacement` que le legacy
  utilise ici : `emplacement` est **vide sur 4 métiers** (Vignoni, jersey 1F, terrot, RAY),
  qui s'affichaient donc sans nom. Delta assumé, cohérent avec le reste de l'écran.
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

### Atelier › Maintenance (`/atelier/maintenance`) — port de `FI_Maintenance.wdw`

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
### Production › Visitage (`/production/visitage`) — port of `FI_Visitage.wdw`

**Layout « Poste » (`mps_designer` §45)** — the 4th named layout, created for this screen:
bandes empilées, pas de liste maître, le sélecteur de contexte en barre d'outils. Écran
`apps/web/src/pages/ProductionVisitage.tsx`; API `ETM/apps/api/src/routes/visitage-trm.ts`
(monté `/api/visitage-trm`), helpers partagés extraits dans `lib/production-trm.ts` (que
`of-trm.ts` importe désormais au lieu de les porter). Le `.wdw` est PCS-compressé : la spec
vient du **cache de compilation WinDev** (`MPS.cpl/<user>/00000000/FI_Visitage.*.wdw.wcw` —
les requêtes SQL y survivent en clair) + une sonde de la base. Dossier complet :
`~/.claude/plans/visitage-tombe-metier.md`.

- **C'est le seul écrit de la fonctionnalité, et il n'y a pas de transaction.** `POST /valider`
  crée les `stock_ecru`, convertit les défauts, trace l'événement **et décrémente le fil** ;
  tout ce qui est vérifiable l'est **avant** la première écriture, et un échec en cours de
  route renvoie la liste des rouleaux réellement créés plutôt qu'un 500 nu. `?dry_run=1`
  renvoie le plan exact sans rien écrire — c'est ce que `check-visitage-trm.ts` exerce, pour
  qu'un passage de garde ne laisse jamais de pièce fantôme en stock.
- **Deux séquences de numérotation par OF** : 1er choix `num_piece_OF < 1000`, déclassé
  `1000+` — et le **premier déclassé d'un OF est 1001**, pas 1000 (438 OF vivants contre 167).
- **La coupe** = un `piece_production` → N `stock_ecru`. Les défauts déclarés au terminal par
  le bonnetier (`Type_Reference = 1`) sont **convertis sur place** en `Type_Reference = 2`
  pointant le rouleau, en préservant `DATE` / `Type_Spotteur` / `IDSpotteur` / `description` :
  c'est ce qui distingue encore, des années après, un défaut terminal d'un défaut visitage.
  ⚠️ **L'origine se lit sur `Type_Spotteur` seul** — « description NULL = visitage » n'est vrai
  que depuis 2023. `récuperé` est accentué → réécriture positionnelle (patron `setClientFlag`).
- **La quantité d'un défaut est CORRIGIBLE au poste, et c'est le point** : au terminal le
  bonnetier ne mesure pas, il prend un **seau** dans une liste, et c'est à la visiteuse de
  mesurer et de rectifier. Les seaux, comptés sur la base le 2026-08-27 : `100` domine
  massivement (1 456 lignes sur ~2 450 — c'est « de 100cm », le défaut par défaut), puis
  `0` pour tout ce qui se compte, `200` = « 1m - 3m », `25` = « Moins de 50 cm »,
  `300` = « Plus de 3m », `75` = « 50 cm - 1m », et **`999` = « Toute la pièce »** (7 lignes).
  ⚠️ Ne pas lire 999 comme « plus de 3 m » — c'est 300 ; 999 est le seau « toute la pièce »,
  et le champ de saisie du poste porte de toute façon un masque à quatre chiffres, pas une
  énumération. Chaque pastille porte donc son champ (masques du
  legacy : `9 999 cm` sur `taille_cm`, `x9 999` sur `nombre`), et `POST /valider` écrit la
  valeur en convertissant le défaut. Ce n'est pas une extension : la requête de la fenêtre
  legacy, récupérée verbatim dans le cache de compilation, ne lit **que**
  `IDdefaut_qualite, type_defaut, taille_cm, nombre FROM defaut_qualite WHERE
  Type_Reference = 1 AND reference = ?` — la colonne était liée et éditable.
  - **Seule la colonne de l'unité du type est prise du payload** ; l'autre garde ce que le
    terminal a écrit, pour qu'un client ne puisse pas la vider. `description` n'est **pas**
    touchée (le legacy ne la lit même pas ici) : elle reste la phrase du bonnetier, celle
    que Prime rend verbatim.
  - Les colonnes écrites sont ASCII, donc `UPDATE` nommé classique ; c'est `récuperé` seul
    qui force encore la réécriture positionnelle, qui porte désormais la quantité aussi.
  - ⚠️ **Un champ vide veut dire « ne touche à rien », jamais 0** — traverser une pastille
    sans rien taper effaçait la déclaration du bonnetier, et 0 est une quantité plausible :
    rien à l'écran ne trahit l'erreur. Le zéro reste joignable en tapant zéro. `qteDigits` /
    `qteCommit` sont sortis du composant et épinglés par `ProductionVisitage.test.ts` :
    l'expression du masque est toute la correction de ce champ (elle a déjà été écrite
    `[^d]` au lieu de `\D`, ce qui refusait tous les chiffres et validait 0 à chaque sortie).
- **Décrément du fil** = `Σ(poids des rouleaux) × asso_fil_of.pourcentage / 100`, **déclassés
  compris** (43 lots ouverts sur 75 le reproduisent, 0 en ne comptant que le 1er choix).
  C'est l'écriture la plus risquée : une mauvaise assiette fait dériver le grand livre du fil
  en silence, et rien en aval ne le signalerait.
- **Le worklist remplace la liste des métiers du legacy.** Le legacy interroge les pièces
  **OF par OF**, et n'envoie jamais que l'OF en tête de file : une pièce dont l'OF a été
  terminé entre-temps devient **invisible pour toujours** (56 pièces terminées sans rouleau
  sur 5 mois). On scanne donc **par machine**, et les égarées reviennent en `autres_pieces`.
  - ⚠️ **Une pièce isolée n'est offerte que 7 jours** (`ORPHAN_MAX_AGE_DAYS`, décision
    utilisateur du 2026-08-26), constante **dure** : la dérogation dev
    `VISITAGE_PIECE_MAX_AGE_DAYS` (`.env.development` de l'API, la base locale étant un
    instantané de mars) n'élargit **que** les pièces de l'OF en tête de file. Rien n'est
    supprimé en base ; `probe-visitage-trm.ts` §5 compte l'arriéré.
- **Le bandeau « Pièce à visiter »** : `ouvert_visiteuse = 1` → toutes les pièces, **exact**
  (18 355/18 362). Sinon une **cadence approximative** (~1 sur 3, parité 71,8 % — sept
  variantes essayées, aucune meilleure) : le legacy est probablement indicatif, donc l'écran
  laisse la visiteuse trancher. Le choix décide aussi lequel des deux
  événements est écrit : `Visitage tombé métier` / `Pesage tombé métier`.
  - **C'est une pastille pleine, et la pastille EST le bouton** (décision utilisateur du
    2026-08-27, `mps_designer` §45.2) : rouge « Pièce à visiter » / bleu « Pesée simple »,
    un clic la retourne. Ni le mot posé dans la barre avec un « changer » souligné à côté
    (rien ne disait que le mot était l'état courant), ni la pastille scindée du §29.3 dont
    la moitié droite nomme la cible — avec **deux modes nommés** elle écrit les deux côte à
    côte et laisse deviner lequel est lequel. La flèche `ArrowLeftRight` est ce qui dit
    qu'on peut cliquer : sans elle une pastille pleine se lit comme un statut figé.
- ⚠️ **La carte d'un rouleau porte la teinte de son choix SUR SON CORPS** (bord 2 px, bandeau
  d'en-tête à 20 %, corps à 10 % — remonté le 2026-08-27, la version d'origine à filet fin +
  lavis 5 % se lisait comme deux cartes blanches à bout de bras). Conséquence pour toute
  retouche de cette carte : **rien de ce qui s'y pose ne peut être un lavis de la même
  teinte** — une pastille de défaut « récupéré » à 10 % de vert disparaissait dans une carte
  verte, et le fond rouge à 5 % de « Ajouter un défaut » sombrait dans une carte déclassée
  tout en criant sur une carte 1er choix (il est passé au blanc). Le corps reste à 10 % et
  pas plus : il contient des champs blancs.
- **Droit `saisie_visitage`** (`permission-keys-trm.ts`, catégorie Production) : il ne garde que
  le bouton Valider et la route d'écriture — consulter le poste reste ouvert. ⚠️ **Fermé par
  défaut : à accorder aux visiteuses en prod** (Paramètres › Utilisateurs) après le déploiement.
- **L'identification, c'est le visage — il n'y a plus de champ.** Le bandeau ne porte que
  le nom et la photo, et **cliquer dessus ouvre un sélecteur de VISAGES** (décision
  utilisateur du 2026-08-27) : la combobox demandait de lire puis saisir un nom que la
  visiteuse reconnaît de toute façon au premier coup d'œil. La porte du §45.4 est intacte —
  non identifié, la pastille passe en ambre et dit « Qui visite ? ».
  - ⚠️ **`VisiteurGate` est local à l'écran, pas un `PopoverSelect`** : ce primitif est un
    miroir d'ETM sans déclencheur personnalisable ni avatar dans ses lignes, et le plier
    pour un seul écran de poste se propagerait à toutes les listes déroulantes des deux
    applications. Le popover est ancré au bord **droit** du bouton (il vit au bout de la
    barre : ancré à gauche il sortirait de l'écran).
  - `VisiteurPhoto` prend une `size` (56 au déclencheur, 40 dans les lignes) posée en style
    inline — une classe Tailwind ne se fabrique pas à partir d'un nombre — et demande
    `size * 3` à l'endpoint photo pour rester net sur l'écran du poste.
- **L'étiquette Dymo, imprimée à la validation** — `GET /visitage-trm/etiquettes?ids=…`,
  **une page PDF par rouleau** (`lib/pdf/EtiquetteEcruPdf.tsx`, Dymo 99012 89 × 36 mm comme
  `StockFiniLabelPdf` / `StockFilLabelPdf`), envoyée par `POST /valider` → `printPdf()` dès
  que la réponse revient. C'est le port de la procédure globale legacy **`ImprimeEtiquetteTM`**
  (collection `Utilitaire` du projet MPS) : le `.wdg` est PCS-compressé mais ses littéraux
  survivent dans le cache de compilation (`Utilitaire.AF726741.wdg.wcg`) et écrivent
  l'étiquette en toutes lettres — `TRM.jpg`, `Arial`, le métier via `ordre_fabrication` →
  `machine`, `"N° : "`, `"Poids : " %5,2f " Kg"`, `"Réf. : "` via `ref_ecru` → `colori_ecru`,
  `"Date : " JJ/MM/AAAA HH:mm:SS`. **Les champs sont donc ceux du legacy, verbatim et dans
  son ordre** ; seule la présentation change.
  - **Deux deltas assumés** : le vieux logo pyramide `TRM.jpg` devient le **badge M carré**
    (`logo-m-email.png`, décision utilisateur du 2026-08-27 — la bande de gauche d'une
    89 × 36 est haute et étroite, le monogramme la remplit là où le mot-symbole large doit
    rétrécir, et il tient mieux la trame thermique) ; et un rouleau déclassé porte
    désormais un **pavé noir « DÉCLASSÉ »**, que le legacy n'imprime pas — or c'est
    précisément ce que l'étiquette d'un rouleau devrait dire. Il vit sur la ligne de date,
    et **pas** en coin haut-droit : à 22 pt un numéro à neuf caractères (« 3417/1001 »)
    atteint ce coin.
  - **Tout est noir sauf le badge** : une Dymo est thermique, donc tout ce qui n'est pas
    quasi-noir sort gris. Ne pas y remettre l'ambre de l'app.
  - ⚠️ **La tête d'impression ne va PAS jusqu'au bout de l'étiquette** : elle s'arrête à
    ~82,5 mm des 89 mm, les ~6,5 mm de droite sont perdus. Mesuré sur un tirage du poste le
    2026-08-27, où le pavé DÉCLASSÉ est sorti tranché en plein mot (« DÉCLASS ») ; le bord
    gauche, lui, tombe exactement là où le PDF le met — donc rien n'est décalé ni mis à
    l'échelle, c'est bien une largeur imprimable. D'où `SAFE_RIGHT = 26` pt en padding
    droit de la page : ce n'est pas une marge, c'est une **zone sûre**, volontairement bien
    plus large que les 5 pt de gauche, et tout ce qui est calé à droite (le filet, le pavé)
    s'aligne dessus. Sur l'étiquette physique le résultat est centré, parce qu'il est centré
    dans la bande *imprimable* — ne jamais « rééquilibrer » ce padding contre celui de
    gauche. Les étiquettes sœurs (`StockFiniLabelPdf` / `StockFilLabelPdf`) ne l'ont jamais
    rencontré parce que tout y est calé à gauche : leur `paddingRight: 8` n'est pas un
    précédent.
  - **`printPdf()` (`apps/web/src/lib/print.ts`) n'ouvre PAS d'onglet** : il récupère le PDF
    `credentials: 'include'`, le ressert depuis une **URL `blob:`** — qui hérite de l'origine
    de la page — et appelle `contentWindow.print()` sur une iframe cachée. L'étape blob est
    porteuse : l'API dev est sur un autre port, et une iframe cross-origin lèverait
    `SecurityError`. ⚠️ **Le poste doit lancer Chrome avec `--kiosk-printing` et la Dymo en
    imprimante par défaut** pour que ça imprime sans boîte de dialogue, comme le legacy ;
    sans ce drapeau la boîte s'ouvre pré-chargée. Tout échec retombe sur `window.open`, et
    la barre de validation dit lequel des deux a eu lieu et offre « Réimprimer ».
  - **Le raccourci du poste** (à refaire tel quel si le PC est réinstallé) :
    `chrome.exe --kiosk-printing --user-data-dir="C:\visitage-profile" --app=https://trm.malterre/production/visitage`.
    ⚠️ Le `--user-data-dir` séparé n'est pas cosmétique : Chrome est un singleton par
    profil, donc lancé sur un profil déjà ouvert il passe l'URL au processus existant et
    **jette `--kiosk-printing`** — la boîte de dialogue revient et le drapeau a l'air cassé.
    Le profil isolé porte aussi le cookie du compte-poste `Visitage`. Vérifier le drapeau
    dans `chrome://version` (ligne « Ligne de commande »), jamais à l'œil. L'icône du
    raccourci est `public/icons/trm.ico` (multi-résolutions, dérivé de `icon-512.png`),
    servie par l'app pour être récupérable depuis le poste lui-même.
  - Pas de garde `saisie_visitage` : réimprimer une étiquette que le rouleau porte déjà est
    aussi sensible que consulter le poste. Le garde-fou de partition est
    **`IDordre_fabrication > 0`** (seul le tricotage TRM a un OF), jamais `IDsociete` — la
    réception ETM bascule le rouleau en société 1 et l'étiquette doit rester réimprimable.
  - Les deux boutons « Test Dymo » de la barre poste (bloc temporaire en pointillés ambre)
    ont été **retirés le 2026-08-27**, le rendu ayant été validé sur la vraie Dymo. **La
    route `?demo=N` de `GET /visitage-trm/etiquettes` survit** côté API (`demoEtiquettes()`
    dans `visitage-trm.ts`) : elle n'a plus d'appelant, mais la retirer demande une
    worktree ETM appairée et un passage par le pipeline NG pour du code mort inoffensif.
    À faire au prochain travail d'API sur ce fichier, pas pour elle-même.
- Scripts : `probe-visitage-trm.ts` (règles vs tout l'historique), `check-visitage-trm.ts`
  (routes, en `dry_run` — et les étiquettes, en lecture seule, avant la porte du worklist),
  `seed-visitage-historique.ts` (**dev only**, refuse de tourner hors
  localhost — peuple la bande « Aujourd'hui sur <métier> », vide sur l'instantané local) et
  **`seed-visitage-pieces.ts`** (dev only, même garde — peuple le **worklist** : sur
  l'instantané local les huit dernières pièces sont toutes encore sur le métier
  (`date_fin` NULL), donc le poste ouvre sur « Aucune pièce à visiter » et rien n'est
  testable. Il termine des pièces il y a quelques **heures**, ce qui tient dans les deux
  fenêtres — les 7 jours du poste et les 24 h du widget — sans dérogation d'env, et étale
  les heures de fin de part et d'autre des seuils 2 h / 3 h du widget. `--clean` défait tout,
  rouleaux compris si le poste en a déjà créé).


### Paramètres › Utilisateurs (`/settings/utilisateurs`) — TRM's own permission store

Port of ETM's screen (`apps/web/src/pages/SettingsUtilisateurs.tsx`): user list · Profil tab (email / photo / signature — the **shared** `/user-emails` + `/user-profiles` stores, one identity per person across both apps) · **Écrans** tab · **Permissions** tab. Notifications / « Copier les droits » are not ported yet — they arrive with the features that need them.

- **Permissions are TRM's own.** `PermissionsContext` reads **`/api/permissions-trm/me`**, the admin tab talks to `/api/permissions-trm/{keys,users}`; catalog `ETM/apps/api/src/lib/permission-keys-trm.ts`, store `data/permissions-trm.json`. Never point a TRM gate at `/api/permissions` — the two stores are separate so that neither admin screen can strip the other app's grants on save. A new switch = catalog entry (ETM API, paired NG worktree) + `trmUserHasPermission` on the route + `useHasPermission` in the screen. Default closed; effective admins bypass.
  - ⚠️ **Une clé nommée par un écran TRM mais absente de `TRM_PERMISSION_KEYS` échoue en SILENCE, et de façon irrattrapable.** Paramètres › Utilisateurs construit son onglet depuis `GET /permissions-trm/keys`, donc aucun interrupteur n'est rendu ; `setTrmUserPermissions` la jetterait comme inconnue si elle arrivait quand même ; `/permissions-trm/me` ne la renvoie jamais. Résultat : **le bouton est invisible pour tout non-admin et aucun admin ne peut l'accorder** — ça se lit comme une restriction voulue, pas comme un bug. C'est arrivé à six clés — `create_stock_fil`, `edit_factures`, `edit_client_info`, `delete_client`, `crud_client_contacts`, `crud_client_adresses` — déclarées seulement dans le catalogue d'**ETM** alors que Fils › Stock, Clients › Facturation et Clients › Gestion s'en servaient : « Nouveau lot » était inaccessible au poste de visitage, et le symptôme se lisait comme un droit qu'on avait simplement oublié d'accorder. Garde : `check-permission-keys-trm.ts --web <chemin absolu vers TRM/apps/web/src>`, le pendant de `check-screen-access-trm.ts` (là le manifeste API suit la nav du web ; ici les littéraux du web doivent tous exister dans le catalogue API).
  - ⚠️ **Le store est un ARGUMENT EXPLICITE des gardes partagées, jamais un défaut.** `requirePermission()` de `lib/clients-common.ts` est importé par `routes/clients.ts` (ETM) **et** par `routes/clients-trm.ts` / `routes/stock-fil-trm.ts` (TRM) ; tant qu'il appelait `userHasPermission` en dur, toute route TRM qu'il gardait demandait à `permissions.json` — celui d'**ETM** — si un utilisateur TRM avait le droit d'écrire. Un droit accordé côté TRM ne faisait rien, un droit accordé côté ETM ouvrait la route TRM. Il prend donc un `PermissionScope` (`ETM_PERMISSIONS` / `TRM_PERMISSIONS`) sans valeur par défaut : un nouvel appelant *doit* nommer son application. Même raison pour `FacturesScope.permissions` et `FinanceScope.hasPermission` — dès qu'une fabrique de routeur sert les deux sociétés, le store fait partie du scope.
  - **Deux routeurs TRM n'ont encore AUCUNE garde** : `expeditions-trm.ts` (6 routes d'écriture) et `planning-atelier.ts` (7). Comme pour `of-trm` avant `edit_of`, n'importe quel appelant joignant l'API peut les appeler — `attachUser()` est best-effort et il n'y a pas de garde globale.
- **Écrans = a second axis, TRM's own tree, same store.** Menu/screen visibility, stored flat next to the action keys in `permissions-trm.json`: a **menu is a grant, default closed** (`screen_<menu>`), a **screen inside a granted menu is a hide** (`hide_<menu>_<screen>`) — so a newly shipped screen shows up for everyone who already holds its menu instead of being invisible until an admin ticks it per user. A menu left with no visible screen disappears; granting a menu clears its screens' hide keys. Keys derive from the href, so nothing is hand-maintained: the web builds both the admin tree and the nav filters from `mainNavigation` itself (`config/navigation.ts` § Screen access, `hooks/useSubmenuFilter.ts`), and the API manifest `ETM/apps/api/src/lib/screen-keys-trm.ts` mirrors it (diffed by `check-screen-access-trm.ts --nav <abs path to TRM navigation.ts>`).
  - ⚠️ **Hide keys are negative — read them via `hasRaw()`, never `has()`.** `has()` is true for every key when the viewer is an effective admin, so a hide read through it would hide the whole app from the admin. `/permissions-trm/me` never reports hide keys for an admin either. Pinned by `apps/web/src/config/navigation.test.ts`.
  - **Enforcement is the nav surfaces + one route guard in `AppShell` (`useScreenGuard`) — a curtain, not a lock.** Endpoints are shared across screens, so gating them per screen would break unrelated features; confidentiality stays with a server-checked action key. The guard also owns the menu index redirect (`/clients` → the first screen the user may open, which the router's static `<Navigate>` cannot know) and never gates `/`, the other dashboards, or `/settings`.
  - ⚠️ **Grandfathering is a deploy step**: `seed-screen-access-trm.ts --write` **on the prod API host**, before the TRM web deploy — menus are default-closed, so without it every non-admin loses the whole nav. It is idempotent and is also how a *newly added menu* is handed to everyone at once.
- First key **`edit_commandes_client`**: hides « Nouvelle » / « Modifier » in Clients › Commandes (Supprimer and line editing sit inside edit mode) and 403s the write routes of `/commandes-trm`. Clôture is deliberately not under it (ETM keeps a separate `cloture_commande_client`).
- **Second key `edit_of`**: turns Production › Ordres de fabrication read-only — Modifier, Nouveau, Supprimer, les flèches de file, « Passer en cours » / « Terminer » et l’ajout d’observation disparaissent, et les **neuf** routes d’écriture de `/of-trm` 403. ⚠️ **Avant cette clé ces routes ne demandaient aucun cookie du tout** (`attachUser()` est best-effort, il n’y a pas de garde globale) : n’importe quel appelant pouvant joindre l’API pouvait terminer un OF. Toute nouvelle route d’écriture TRM doit donc porter sa propre garde — il n’y a rien au-dessus.
- **The user list is an allowlist**, not the whole shared `utilisateur` table: `TRM_STAFF` in the page (lowercase `prenom|nom`) — Vincent Malterre (admin), Nicolas Antonino, Mickael Grivelet, Isabelle Malterre, Laetitia Tellier, Pierre-Emmanuel Roux, **plus le compte-poste `Visitage`** (IDutilisateur 10, `roleHint` pc-visitage). Auth stays shared, so the picker still shows everyone. ⚠️ **Un compte-poste n’a pas de nom de famille, donc sa clé finit par un `|` nu** — ce n’est pas une coquille. Le PC de visitage se connecte comme lui ; la visiteuse s’identifie *dans* le poste, contre `bonnetier`, pas en se connectant. Sans son entrée ici aucun admin n’atteint ses droits, et `saisie_visitage` — fermé par défaut — ne pourrait jamais être accordé à la machine qui en a besoin. `Regleur` (14) et `eloise` (16) sont les deux autres comptes-postes du legacy : à ajouter le jour où un écran TRM les concerne. Mickael Grivelet was missing from the table: `ETM/apps/api/src/scripts/add-utilisateur-mickael-grivelet.ts` inserts him (idempotent; **run on prod before the first deploy**).

### Qualité › Retour client (`/qualite/retour-client`) — port de `FI_Retour_ClientTRM.wdw`

Layout Classeur (§39) : liste · en-tête fiche · onglets maîtres **Retour** / **Traçabilité** ·
volet **Journal / Documents / Info** · pill de statut §29.3. Écran
`apps/web/src/pages/QualiteRetourClient.tsx` ; API `ETM/apps/api/src/routes/retours-client-trm.ts`
(monté `/api/retours-client-trm`) ; primitives de table `ETM/apps/api/src/lib/retour-client-trm.ts` ;
état imprimé `ETM/apps/api/src/lib/pdf/RetourClientPdf.tsx`. Le `.wdw` est PCS-compressé : la spec
vient du **cache de compilation WinDev** (`MPS.cpl/<user>/00000000/FI_Retour_ClientTRM.*.wcw`
pour le SQL et les libellés, `.wbw` pour l'inventaire des champs), et tout a été revérifié sur la
base par `apps/api/src/scripts/probe-retour-client-trm.ts` (lecture seule, rejouable en prod).
Garde HTTP : `check-retour-client-trm.ts` (crée un dossier jetable — **jamais contre la prod**).

**C'est l'autre bout de Qualité › Dossiers d'ETM, pas un écran indépendant.** ETM ouvre un
`dossier_qualite` et envoie sa FNC ; ça arrive ici comme un `retour_client`. Les 91 lignes vivantes
ont toutes `IDdossier_qualite > 0`.

| ETM `dossier_qualite` | TRM `retour_client` |
|---|---|
| `messageFNC` | `message_client` (copie) |
| `envoiFNC` | `DATE` |
| `IDdefaut_textile`, `Type_Reference`, `reference` | copiés **à la création seulement** |
| `IDclient` = le client **final d'ETM** | `IDclient` = **le client de TRM**, Ets Malterre |
| `reponseFNC` = `"<libellé>\r\n<commentaire>"` | ⟵ `IDresolution_qualite` + `reponse` |
| `echéance`, `terminé` | *(pas de colonne — lus, jamais écrits)* |

- **La réponse remonte, le reste non.** `PUT /retours-client-trm/:id` republie la résolution et la
  réponse sur `dossier_qualite.reponseFNC` via **`writeFncReponse()`** (exporté de
  `dossiers-qualite.ts` — l'encodage a un seul propriétaire). Ne remontent JAMAIS : l'affectation
  (TRM la repointe sur le rouleau réellement trouvé — 13 dossiers sur 91) et la clôture (ETM ferme
  son dossier quand la réponse le satisfait, c'est une autre décision).
- **L'aller** est le bouton « Envoyer la FNC » de l'écran ETM, qui était un placeholder jusqu'au
  2026-08-26 : `POST /dossiers-qualite/:id/fnc/envoi` (ou l'envoi email `…/fnc/email`, qui fait la
  même chose une fois le mail parti) date `envoiFNC` et crée la ligne. **Idempotent** — un second
  envoi n'ouvre pas un dossier en double. Seule `IDSociétéFNC = 1` (Tricotage Malterre) se
  transmet : `retour_client_confection` est une autre table, sans écran.
- **Le client TRM est résolu par le nom de la société émettrice**, pas par un id en dur, et la
  fonction lève si elle ne le trouve pas — un repli silencieux classerait la réclamation sous le
  client qui a le hasard d'être l'`IDclient` 1.

**`retour_client` — les pièges.** Pas d'`IDsociete` (l'objet est trmien par nature, comme
`ordre_fabrication`). L'ordre physique des colonnes est celui du **`SELECT *` runtime**, qui diffère
du `MPS.xdd` (même piège que `controle_titrage`) et que la sonde §2 revérifie à chaque passage.
`archivé` est la **seule colonne accentuée**, et c'est le drapeau En cours / Terminé : lecture pliée
par `rcReadCol`, écriture par `patchArchive` (SET nommé sur Windows, réécriture positionnelle pleine
ligne sur Linux). Le filtre En cours / Terminé se fait **en JS** — le pont Linux ne sait pas nommer
`archivé` dans un WHERE. `DATE` est réservé. Deux colonnes sont **mortes** et ne doivent recevoir
aucun champ de saisie : `impact_prime` (0 sur 91/91, aucun champ dans le legacy — elle n'existe
qu'à l'impression, et y reste à 0,00 € par décision du 2026-08-26, comme la tuile morte de
Production › Prime) et `defaut` (copie texte du libellé, vide sur 90/91).

**Affectation — la divergence à connaître.** `Type_Reference` est un discriminant *texte* sur la
colonne libre `reference` : `'1'` → `stock_ecru.numero` (85 lignes), **`'2'` → `stock_fini.lot`**,
le lot FINI (6 lignes). ⚠️ Sur `dossier_qualite`, le même `'2'` désigne un **lot de fil**
(`stock_fil.lot`). Même code, deux tables. La résolution rend toujours une **liste**, éventuellement
vide : `numero` n'est pas unique et 6 références historiques (`2636`, `2637`, `2667`, `10318`) ne
matchent rien — la croix rouge du legacy, pas une erreur.

**Traçabilité.** `stock_ecru` → `ref_ecru.reference` + `colori_ecru.reference` (l'étiquette
« 061 - ecru » du legacy), `ordre_fabrication.IDmachine` → le métier, `evenement_piece` (jointure
sur `IDstock_ecru` **OU** `IDpiece_production`), `defaut_qualite` `Type_Reference = 2` avec son
spotteur (1 = Bonnetier, 2 = Visiteur). ⚠️ `defaut_qualite.reference` est du **texte** qui stocke
l'id : la liste `IN` doit être quotée. ⚠️ `taille_cm` n'est **pas** des centimètres — jamais rendu
avec une unité ni sommé (même règle que Prime). Les deux documents (bon de commande via
`IDref_commande_source` → `ligne_commande_sous_traitant`, bon de livraison via
`IDligne_expedition_TRM` → `ligne_expedition`) réutilisent les endpoints PDF existants.
**Aucune lecture ne filtre `IDsociete`** : la réception ETM bascule le rouleau en société 1, et les
80 rouleaux référencés y sont déjà.

⚠️ **L'onglet Documents est dégradé en prod.** `doc_qualite` porte sa PK *et* sa FK accentuées
(`IDdoc_qualité`, `IDdossier_qualité`) : le pont Linux ne sait pas cadrer sur un dossier et un
`SELECT *` traînerait 87 Mo de blobs. L'API répond `degraded: true` et l'écran le dit, plutôt que de
faire croire le dossier vide — exactement comme l'écran ETM. Le §8 de la sonde reteste la question à
chaque passage et dira quand ce chemin pourra disparaître.

- **Droit `edit_retour_client`** (`permission-keys-trm.ts`, catégorie Qualité) : seule l'écriture est
  gardée. La donnée qualité n'est pas confidentielle et la visibilité relève de l'axe Écrans
  (`screen_qualite` / `hide_qualite_retour-client`, déjà présents) ; ce que la clé protège, c'est la
  boucle FNC — une réponse écrite ici parle à ETM au nom de TRM.
- **L'échéance est en lecture seule** : elle vit sur le dossier d'ETM. Elle pilote le liseré §41
  rouge (atteinte) / ambre (≤ 3 j) sur les seuls retours **en cours** — jamais la règle §30 « date
  manquante = en retard », qui peindrait toute la liste (elle est nulle sur presque tous les
  dossiers récents).
- `components/shared/PieceEvents.tsx` (`BonnetierAvatar`, `EventTimeline`) est **sorti de
  `ProductionOf.tsx`** pour cet écran : répondre à une réclamation, c'est lire exactement cette
  liste. Améliorer le fichier partagé, ne pas re-forker.
- L'email n'est **pas** journalisé dans `envoi_email` : ce registre est clé par
  (`IDreference`, `IDtype_doc`) et `type_doc` n'a pas de « retour client ». Le classer en 2 =
  « autre » mettrait une fiche qualité dans l'historique d'envoi du client, entre ses factures.
- Le corps du mail legacy (« Le dossier N°%1 a été créé auprès de notre service qualité », signé
  « Ets Malterre - Service Qualité ») était un copier-coller de la fenêtre ETM : au départ de TRM le
  destinataire EST Ets Malterre, donc on envoie la fiche avec la réponse de l'atelier.
- **Défauts récents et Analyse restent des placeholders** ; l'index `/qualite` pointe donc sur
  Retour client, le seul écran réel du menu.

### Fils › Stock (`/fils/stock`) — port of `FI_Stock_Fil_TRM.wdw`

Tableau layout (§27). Screen `apps/web/src/pages/FilsStock.tsx`; API
`ETM/apps/api/src/routes/stock-fil-trm.ts` (second router on the `/api/stock` mount,
endpoints `/fil-trm/*`).

**`stock_fil` is NOT partitioned — no `IDsociete` column.** The legacy TRM screen and
ETM's Fournisseurs › Stock read the same ~1.7k rows: the yarn physically sits at TRM
(`IDMagasin = 1` on 99% of rows) and **`IDclient` names its owner** (TRM knits à façon —
Ets Malterre is TRM's biggest "client", holding most of the yarn). So the TRM screen
lists ALL rows (user-confirmed), with a Client column and a Disponible (`terminé=0`,
default) / Archivé / Tous filter. It is a different *flavor* of the same table, not a
shared screen: TRM adds the lifecycle actions ETM's screen doesn't have.

- **Droit `create_stock_fil`** (catégorie « Fils ») : garde les **trois écritures du grand
  livre** — « Nouveau lot », « Diviser », « Archiver » — et rien d'autre. Le contrôle de
  titrage n'en fait pas partie (il n'écrit que dans `controle_titrage`), la consultation
  reste ouverte à qui a le menu Fils. ⚠️ La clé était nommée par l'écran et par les trois
  routes depuis l'origine, mais **n'était déclarée que dans le catalogue d'ETM** : le bouton
  était donc invisible pour tout non-admin et inaccordable — voir l'avertissement de
  « Paramètres › Utilisateurs ». À accorder au **poste de visitage** (compte-poste
  `Visitage`, IDutilisateur 10) : c'est là que le fil est reçu.
- **Read-only columns, verified against live data**: `stock` moves only via piece
  declaration (`Δ = stock_ecru.poids × asso_fil_of.pourcentage/100` — can go negative),
  `fil_incorpore`, and archivage (`stock = 0`); `dernier_mouvement` =
  max(`stock_ecru.date_saisie`) of the lot's OFs (183/183 parity). Never written by the web.
- **Lot numbering**: numeric string, unique key, `MAX(numeric lot)+1` computed **in JS**
  (SQL `MAX(lot)` is lexicographic; CAST unverified on the bridge), 3-attempt retry.
- **Create** writes IDclient, IDMagasin=1, `stock = stock_initial`,
  `dernier_mouvement = date_entree`, `dernier_pointage` (defaults date_entree) — ETM's
  older `POST /stock/fil` omits all four, don't reuse it.
- **Diviser**: new row copies the identity fields + gets lot max+1 and
  `stock = stock_initial = X`; source loses X on both columns. No ledger row exists.
- **Contrôle de titrage**: reference block from `ref_fil`
  (titrage/nb_fil/nb_brin/`unite_titrage`), Valider INSERTs into `controle_titrage` —
  positional INSERT, max+1 PK (reserved `date` column). ⚠️ **Physical column order is
  `IDcontrole_titrage, titrage, nb_fil, nb_brin, IDstock_fil, IDunite_titrage, date`** —
  trust the runtime `SELECT *` key order, NOT the `.xdd` analysis listing (they differ;
  this bit once).
- **Archivage** (`GET /fil-trm/:id/bilan` + `POST /fil-trm/:id/archiver`): freinte =
  `stock_initial − Σ(OF pieces poids × pourcentage/100) − Σ fil_incorpore.poids` — the
  **pourcentage weighting is load-bearing** on blended yarns (verified vs legacy
  annotations). Defects verdict =
  `defaut_qualite` `Type_Reference = 2` over the OFs' `stock_ecru` ids (« Aucun Défaut »
  smiley when empty). Writes corrected `stock_initial`, `observation_freinte`,
  `stock = 0`, `terminé = 1`. Thresholds (user-confirmed): freinte green ≤ 10 %, red
  above or negative; second choix green 0 / amber ≤ 5 % / red. PDFs: Dymo 89×36
  étiquette (`StockFilLabelPdf`) + A4 rapport de freinte (`RapportFreintePdf`,
  **`issuer: companyTrm`**).
- ⚠️ **Le fil incorporé est de la consommation, pas de la freinte** (décision utilisateur
  du 2026-08-26, après vérification auprès du régleur). « Incorporer un fil » verse un
  reliquat de lot dans un OF pour s'en débarrasser ; le poids est déclaré en Kg sur l'OF
  (`fil_incorpore`), **jamais en pourcentage**, donc `Σ(pièces × pourcentage/100)` ne peut
  pas le voir. Tant qu'il n'était pas déduit, la freinte était gonflée du poids exact :
  sur ~10 des 32 lots concernés, la freinte calculée **était** le poids incorporé au kilo
  près (lot 9479 : 50,5 pour 50 ; lot 10065 : 20,6 pour 20). Correction vérifiée par
  `ETM/apps/api/src/scripts/check-freinte-incorpore-trm.ts` : |freinte| médiane 4,58 % →
  1,46 %, 27 lots rapprochés de zéro, 5 éloignés.
  - **Affiché comme sa propre ligne, jamais fondu dans `produit`** : le poids est
    *déclaré* par le régleur, pas pesé à la visiteuse — les consignes disent souvent
    « incorporer le lot X **si possible** » — et une poignée de lots ne réconcilient pas
    (le lot 10106 déclare 8 Kg incorporés sur un lot de 8 Kg dont 6,6 Kg déjà tricotés).
    L'archiviste doit voir le chiffre pour le juger, et il peut toujours corriger
    Quantité initiale, qui est là pour ça. La carte « Fil incorporé » et le tableau du
    PDF ne s'affichent que s'il y en a (33 lots sur ~1 700).
  - `fil_incorpore` n'a que **quatre colonnes** (`IDfil_incorpore`, `IDordre_fabrication`,
    `IDstock_fil`, `poids`) : ni date, ni lien vers une pièce, ni pourcentage. **Le
    *moment* de la consommation n'est donc enregistré nulle part** — il vit dans la
    consigne au bonnetier, et les trois cas coexistent : réparti (« incorporer l'ancien
    lot 1 sur 2 », « en bordure »), en fin d'OF (« solder le lot 10373 à la fin de la
    prod »), au début (« solder le guipé 9847 avant de prendre le 10187 »). Décision du
    2026-08-26 : **on laisse ça en consigne**, pas de colonne en plus.
  - Dossier complet (34 incorporations, 32 lots, qui incorpore quoi et quand) :
    `ETM/apps/api/src/scripts/probe-fil-incorpore-trm{,2,3,4}.ts`, en lecture seule.
- **`controlé` is a dead pre-2023 flag** (1 065 rows, always with `terminé=1`, unrelated
  to the 2-row `controle_titrage`) — never write it, never render it editable.
- **Windows driver footgun (this feature's discovery)**: any SELECT naming a
  **memo-binary column** (`certif_bio`, `certif_recyclé`) — or `SELECT *` on a table
  holding one (`stock_fil`, `client`) — silently returns **zero rows** on the Windows
  ODBC driver. Probe blobs with `LENGTH(col)` on Windows; `SELECT *` works on the Linux
  bridge. Both certif blobs are empty on every row (probed 2026-08), so the Linux
  archive path (delete + positional reinsert à la `setClientFlag`, blob slots `''`)
  is safe; it 409s `certificat_bloque` should a blob ever appear.
- Probe/parity script: `ETM/apps/api/src/scripts/probe-stock-fil-trm.ts` (read-only) —
  re-run it against prod after `/etm_deploy` to sanity-check the Linux paths.
- Dev note: `apps/web` `pnpm dev` **hardcodes `VITE_API_URL=:8080` via cross-env**,
  overriding `.env.development.local` — for a worktree API pair run
  `VITE_API_URL=http://localhost:808N/api pnpm exec vite --port 5175` instead.
### Production › Prime (`/production/prime`) — port of `FI_Prime.wdw`

Read-only dashboard (`apps/web/src/pages/ProductionPrime.tsx`; API
`ETM/apps/api/src/routes/prime-trm.ts`, mounted `/api/prime-trm`). The legacy `.wdw` is
PCS-compressed, but the full WLanguage survives as comments in the generated Android Java
(`C:\Mes Projets\MPS\Android\dbg\Compile\GWDFFEN_Prime.java`) — that is the recovered spec.

- **Period** = semester bounded by **15/06 and 15/12** (S1 = 15/12/(Y−1)→15/06/Y, labelled
  by the *fin* year; S2 = 15/06→15/12, labelled by the *début* year). Précédent/Suivant
  move a reference date ±6 months; Suivant is blocked on the current period.
- **Sums** = `SUM(stock_ecru.poids)` over `date_saisie` (a DATETIME) × the rate **du barème
  applicable au semestre** (voir le ⚠️ plus bas) : jusqu'à S1 2026, 1er choix
  (`second_choix = 0`) +0,05 €/Kg et 2nd choix (`second_choix = 1`) −0,20 €/Kg ; à partir de
  S2 2026, **+0,055 / −0,40 €/Kg**. **No
  IDsociete filter** (the ETM handover flips delivered pieces to société 1 — filtering
  would empty the semester); TRM production is scoped by **`IDordre_fabrication > 0`**
  instead, a deliberate delta from the legacy whose predicate also caught ETM `lot='fictif'`
  manual rows (~0.4% overcount). **Retour client (−0,60 €/Kg) is a dead tile**: the legacy
  hardcodes it to 0 (never wired); keep it displayed at 0 until a real data source exists.
- **Répartition** = every atelier employee — **no `regleur` filter and no `archivé` filter**
  (`date_sortie` is what scopes history) — whose employment overlaps the period; prorata of days from
  max(début, date_entree) to **min(today, fin, date_sortie)** — the period-end cap is the
  second deliberate delta (the legacy counted to *today* even on past semesters, so
  historical splits drifted). Photos come from `bonnetier.photo` (real JPEG blobs) via
  `/prime-trm/bonnetiers/:id/photo` — **binary needs `queryRaw`**, the normal `query()`
  path UTF-8-mangles blobs; the web falls back to initials on non-200.
- The **week always describes the current week** (Monday → open-ended) and therefore
  renders **only when the current semester is displayed** (screen and PDF both). On screen
  it is not a section of its own: it used to be a third navy band restating the same three
  production tiles at a smaller size, costing a full page row. It now rides the tiles it
  belongs to — one « Cette semaine · kg · € » footer per tile, the week named once in the
  hero — and its qualitative half is the déclassement table below. The PDF
  (`lib/pdf/PrimePdf.tsx`) still prints the week as a block: it rides `MalterreDocument`
  with `issuer: companyTrm`, renders the same `/prime-trm` payload as the screen, and
  deliberately omits the déclassement table — it is the payout document, not the ops view.
- **Déclassements de la semaine** (`semaine.declassements[]`) fills the column under the
  taux block inside the déclassements card: **one row per 2nd-choix roll** — the unit that
  costs money — with its métier, its poids, its manque à gagner (`poids × le taux 2nd choix
  du barème en vigueur`, the same
  basis as `DeclassementType.montant` and the tile) and its `defaut_qualite` findings
  (`Type_Reference = 2`) folded onto a second line. It was the whole visitage log, **both
  choix**, until 2026-08-25; the user narrowed it to the déclassées, because the table lives
  inside the déclassements card and answers « qu'est-ce que la semaine a coûté ».
  - **The population is exactly the one `semaine.secondChoix` sums** (same `periodWhere(1,
    monday)` predicate), so the column's totals always equal the tile's — including
    **déclassées carrying no defect row**, which get a « Aucun défaut relevé » line rather
    than being dropped. Keep that invariant: a "must have a defect" filter would silently
    make the two disagree.
  - No per-row amber flag any more: every row is a déclassement, so the §7 colour would
    stop discriminating. The money column is what ranks the rows.
  - ⚠️ **`taille_cm` is NOT centimetres** (25 for « Moins de 50 cm », 1500 for « 1m - 3m »):
    the units are per-vocabulary and unrecoverable, so never render or sum it as a length.
    `description` already reads « Maille Moins de 50 cm » — render it verbatim (whitespace
    normalised: historical rows carry « Autre Barrure  Plus de 3m ») and keep « · » free as
    the separator *between* defects; identical labels fold into a `×N` (a piece really does
    carry four « Démaillage » rows).
- **Analyse des déclassements** (not in the legacy): taux de 2nd choix (kg-based) compared
  to the **previous semester in full** — always, including while the current one is still
  running. A same-elapsed-days window would be more like-for-like statistically, but it
  moves every day; the full previous semester is a fixed number to beat, which is the point
  of showing it (user decision, 2026-08-24 — don't "fix" it back). Plus the defect-type
  breakdown of the déclassé pieces
  (`defaut_qualite`, `Type_Reference = 2`). A piece's weight splits **equally across its
  distinct defect types** so the donut sums to the true déclassé weight; unknown types
  fold into « Autres », defect-less pieces into « Non renseigné ». Defects on 1er-choix
  pieces exist too — this section is about **déclassements**, don't rebrand it « défauts ».
  Donut colors are a fixed type→color map validated with the dataviz six-checks script.
- ⚠️ **The régleurs take part in the prime, and that changes what everyone gets.** The
  legacy filtered `regleur = 0`, which silently dropped the only two — Nicolas Antonino
  (16) and Mickaël Grivelet (15), both still employed. They share the **same pot** at a
  bonnetier's per-day weight, so the semester total is untouched and every other share
  shrinks. Applies to **all browsable periods**, past ones included, so historical splits
  no longer match what was actually paid (user decision, 2026-08-25 — same class of
  caveat as the rates below).
- ⚠️ **Les taux sont datés — `ETM/apps/api/src/lib/bareme-prime-trm.ts`, `BAREMES_PRIME`.**
  C'étaient trois constantes de module appliquées à *toute* période navigable : les réviser
  recalculait l'historique entier et l'écran affichait des primes jamais versées. Une
  révision s'ajoute donc en **ligne datée**, et **on ne touche jamais une ligne passée**.
  La révision du 2026-08-26 (+0,055 / −0,40 €/Kg, décidée avec l'atelier) s'applique **dès
  le semestre en cours, S2 2026** (`from: '2026-06-15'`) ; S1 2026 et avant gardent
  +0,05 / −0,20. `retour client` reste à −0,60 : la tuile est morte de toute façon.
  - Le `from` **doit être une frontière de semestre** (15/06 ou 15/12). La prime est *une*
    somme sur toute la période × *un* taux, donc un barème qui démarrerait en cours de
    semestre ne serait pas calculable sans découper chaque somme de kg à la date de bascule
    (`sumPoids`, les montants de déclassement, le donut). Si l'atelier veut ça un jour,
    **c'est ce découpage le travail**, pas une ligne de plus dans la table.
  - Le semestre affiché est prixé au barème de *son* `debut` ; **la semaine** l'est au barème
    en vigueur *aujourd'hui*, puisqu'elle décrit toujours la semaine courante quelle que
    soit la période consultée. Les deux coïncident dès que le semestre courant est affiché,
    seul cas où l'écran rend la semaine.
  - ⚠️ **Le taux s'affiche à trois décimales quand il en porte trois.** `fmtTaux` (écran
    *et* `PrimePdf`) était figé à deux : +0,055 sortait « +0,06 €/Kg », un taux que
    personne ne touche, à côté d'un total calculé sur le vrai 0,055 — sur le document qui
    paie la prime. La troisième décimale n'apparaît que si elle porte quelque chose
    (-0,40 et -0,60 se lisent toujours à deux). Le calcul, lui, n'a jamais arrondi.
  - Garde : `bareme-prime-trm.test.ts` épingle la bascule au jour près et vérifie que la
    table reste triée et sur des frontières de semestre — `baremePour` sort de sa boucle au
    premier `from` futur, donc une table désordonnée résoudrait faux en silence.
  - Le barème vit dans `lib/` (et pas dans `routes/prime-trm.ts`) pour être testable sans
    charger le driver HFSQL, à côté de `lib/pricing-trm.ts` où vivent déjà les règles de prix TRM.

### Rapports › Finance (`/rapports/finance`) — ETM's screen, TRM's partition

Port of the legacy `FI_Analyse_Finance.wdw` (Analyse › Finance): the balance comptable
with a Charges fixes / Charges variables toggle, one row per compte, N vs N-1, and a
drawer holding the compte's yearly history and its two editable fields. Tableau layout
(§27).

**Nothing is forked — neither tier.** The API was already there: the finance widgets
(above) mount `createFinanceRouter(FINANCE_SCOPE_TRM)` at `/api/rapports-trm`, and this
screen reads the very same endpoints. Landing it was the two edits
`ETM/apps/api/src/lib/finance-common.ts` was left open for — `view_rapport_finance` joined
`financeKeys`, and `editComptesKey` switched the compte drawer's routes on.

- **The screen is ETM's file**: `import { RapportFinance } from '@etm/pages/RapportFinance'`,
  rendered `<RapportFinance basePath="/rapports-trm/finance" />`. `basePath` is the ONLY
  per-app difference (ETM defaults to `/rapports/finance`) — the frontend mirror of what
  `FinanceScope` is on the backend. Improve the file in ETM; never fork a TRM copy.
- **The rule** (verified to the cent on société 2): montant(compte, année) = `debit − credit`
  of the `releve_compta` row at the **last upload of that calendar year**. Uploads are
  cumulative YTD — never sum them, never take the early-January upload that closes the prior
  exercise. Class-7 accounts (`numero >= 700000`) are produits and are excluded.
- **Permissions**: `view_rapport_finance` + child `edit_compte_description` in
  `permission-keys-trm.ts`. Same key NAMES as ETM's catalog on purpose — same action,
  separate store. **The Rapports menu disappears entirely without the key**, Finance being
  its only screen (`SubMenuItem.permission`, on top of the menu's own `screen_rapports`
  grant). Nav hiding is convenience: the page renders "Accès restreint" and the API 403s.
- ⚠️ **`releve_compta` has no `id_societe`** — a compte id is the only thing that carries the
  partition. `GET /finance/comptes/:id/historique` had no ownership check while ETM was its
  only mount; it does now, or a TRM caller could have read an ETM payroll account's year
  series by guessing its id. Any future `:id` route on this factory needs the same guard.
- **One dependency was missing** for the shared screen: `xlsx` (Excel export of the visible
  rows). `lib/depassement.tsx` — the N/N-1 traffic light the screen and the Charges widget
  share — was already here, copied in with the widgets.
- HTTP guard for the two newly-mounted compte routes:
  `ETM/apps/api/src/scripts/check-finance-comptes-trm.ts`.

### Atelier planning data model (legacy, shared HFSQL)

- `planning_bonnetier` — `IDplanning_bonnetier`, `date_debut`/`date_fin` (DATETIME, one row per bonnetier per worked day), `IDbonnetier`. No équipe column: the shift (Matin/Après-Midi/Nuit) is derived from the start hour. Overnight (Nuit) shifts end on the next day.
- `bonnetier` — accented columns `prénom`/`archivé` (HFSQL accent rules apply). Grid rows = `archivé=0 AND regleur=0`; regleurs are excluded (roles in `role_employe`: apprenti/bonnetier/visiteur/regleur).
- `desiderata` — `DATE` (reserved word → returns uppercased; 8-char YYYYMMDD), `description`, `IDbonnetier`, `justifie`, `declare`. Writes use positional INSERT (max+1 PK) to avoid naming the reserved column. "En cours" = date ≥ today.

## Ticket widget (LIVA issue tracker) — feature version 1.2.0

In-app bug/feature reporting to the LIVA tracker (product **`trm-erp`**), same widget as
ETM's (spec + upgrade path: the `issue_tracker_integration` skill):

- **Widget**: `apps/web/src/components/tickets/` + trigger/unread badge in
  `components/layout/Header.tsx`, screenshot via lazy `html-to-image`. The files are
  verbatim mirrors of ETM's `components/tickets/` — improve them **in ETM** and re-copy.
  The single deliberate delta is `useTickets.ts` calling `/api/tickets-trm` instead of
  `/api/tickets`.
- **Proxy**: the ETM API's `routes/tickets.ts` router factory, mounted at
  `/api/tickets-trm` and scoped by env `ISSUE_TRACKER_PRODUCT_SLUG_TRM=trm-erp` —
  a **prod deploy requirement** on the shared API's env (`ETM/claude_doc/dev_setup.md` §4).
  Never point the widget at `/api/tickets`: the tracker key is company-scoped and the
  per-mount slug is what keeps ETM's and TRM's "Mes tickets" apart.
- Read state (unread badge) is `localStorage`-only, keyed per user — no HFSQL change.
  Reporters need an email mapped in Paramètres › Utilisateurs, or the proxy 400s.
- **Suivi par email (v1.2.0)** — « Me tenir informé par email » : une case **décochée par
  défaut** sur le formulaire, et un interrupteur (§35) dans la fiche du ticket. Le drapeau
  vit côté tracker (`bugs.follow_up`), pas ici : rien à stocker dans HFSQL. Une fois activé,
  **chaque changement de statut** du ticket envoie un email au rapporteur, aux couleurs
  Malterre et en français (la marque du client pilote la langue) — y compris la clôture
  automatique quand LIVA publie la version corrective. Une réponse du développeur qui ne
  bouge pas le statut n'envoie rien : elle voyage dans l'email du prochain changement, et
  la pastille non-lu du widget couvre déjà ce cas.
  - Route proxy `PATCH /api/tickets-trm/:id/follow` (même contrôle de propriété que le
    détail : la clé API du tracker est *company*-scoped, pas *reporter*-scoped).
  - Garde HTTP : `ETM/apps/api/src/scripts/check-tickets-follow.ts`
    (`TICKETS_MOUNT=tickets-trm` par défaut) — elle crée un vrai ticket `[CHECK]` sur le
    tracker visé, donc pointer l'API dev sur un tracker local avant de la lancer.
  - ⚠️ **Le tracker doit être déployé avec la migration `follow_up` avant le web TRM**,
    sinon la case part avec le POST sans effet et l'interrupteur 404.

## Shared screens (live cross-repo link with ETM)

Some screens are pixel-identical in both apps and hit the same non-partitioned data (e.g. Tombé Métier → Références over `/references-ecru`). Those are **not copied** — TRM imports the ETM source file directly, so editing the one file updates both apps:

- **Import**: `import { TombeMetierReferences } from '@etm/pages/TombeMetierReferences'` in `router.tsx`. The `@etm` alias points at `../../../ETM/apps/web/src` (vite.config.ts + tsconfig paths) — the two repos **must stay sibling directories** under `C:\dev\etsmalterre\` (worktrees like `TRM-ref-tm` are siblings too, so they work).
- **`@/` imports inside a shared screen resolve to THIS app's src** — the screen uses TRM's local copies of components/lib/hooks. Keep those copies in sync with ETM (they currently differ only in line endings, plus the `API_URL` dev fallback in `lib/api.ts`). Verbatim mirrors of ETM files, copied when a screen needed them — improve them **in ETM** and re-copy, never fork: `components/email/SendEmailDialog.tsx`, `components/ui/signature-preview.tsx`, `lib/email.ts`, plus the `components/ui/*`, `lib/*` and `hooks/*` that predate them.
- **The source of truth lives in ETM** — improve the screen there (or from here via the alias path, it's the same file). Never fork a TRM copy of a shared screen.
- **A per-app difference is a PROP, never a fork.** Three precedents, in increasing strength: `RapportFinance basePath` (a string), `TombeMetierReferences obsOfEditor` (a whole **component** TRM injects, so the shared file never learns a TRM endpoint — see « Observations régleur »), and on the backend `createFinanceRouter(scope)`. Default the prop to the ETM behaviour and the other app is untouched.
- **Adding a new shared screen**: (1) import it via `@etm/pages/...` in `router.tsx`; (2) add its file path to the `content` array in `tailwind.config.js` (explicitly — no globs — or its Tailwind classes won't be generated); (3) check the data it touches is either non-partitioned or already TRM-scoped; (4) if it needs modules TRM doesn't have yet, copy those from ETM first.
- **Guardrails already in vite.config.ts** — `server.fs.allow` (serves out-of-root files in dev) and `resolve.dedupe` (prevents a second React copy from ETM's node_modules, which would crash hooks). Don't remove either.
- Consequence: TRM builds require the ETM checkout to be present at the sibling path.
- **Changing a shared file from a paired worktree.** The alias targets the ETM *main* checkout, so an edit made in an NG worktree (`ETM-<feature>`) is invisible here until it lands on ETM master. For the dev loop, repoint the alias per worktree — gitignored, never committed: `apps/web/.env.local` with `ETM_WEB_SRC=../../../ETM-<feature>/apps/web/src` (read by `vite.config.ts` via `loadEnv`; restart the dev server) and `apps/web/tsconfig.local.json` extending `tsconfig.json` with the same `@etm/*` path, checked with `tsc --noEmit -p tsconfig.local.json`. The committed `tsconfig.json` / `pnpm build` keep pointing at ETM master, so the TRM branch only builds cleanly once the NG branch has landed — which is the landing order anyway.

## Tableau de bord — the ETM widget grid, shared verbatim

The screen is ETM's (`import { Dashboard } from '@etm/pages/Dashboard'`): same react-grid-layout grid, same edit mode (header "Personnaliser" slot, drag/resize, hidden-widget tray, several named dashboards as header tabs — ETM's `CLAUDE.md` § Navigation documents the mechanics). What makes it TRM's:

- **`src/components/dashboard/registry.tsx` is TRM-local** and is the whole catalog: `WIDGET_REGISTRY` (TRM widgets only) plus **`DASHBOARD_APP = 'trm'`**. The shared shell reaches it because ETM's `Dashboard.tsx` and `useDashboardLayout.ts` import the registry and types through `@/components/dashboard/…` (never `./…`), which resolves to *this* app's `src`. The other files in that folder (`types.ts`, `WidgetFrame.tsx`, `DashboardContextMenu.tsx`, `useDashboardLayout.ts`) are one-line `export * from '@etm/…'` shims — keep them shims. `WidgetDef` lives in ETM's `types.ts`, not its registry, precisely so TRM can type its registry without dragging ETM's widgets into the type-check.
- **Layouts are stored per app.** The hook calls `GET/PUT /api/user-profiles/me/dashboard?app=trm`; the store keeps `dashboards_trm` next to ETM's `dashboards` for the same `IDutilisateur` (`ETM/apps/api/src/lib/user-profiles.ts`). No `?app=` means ETM — every pre-existing client.
- **Widget permissions are TRM keys** (`ETM/apps/api/src/lib/permission-keys-trm.ts`, category « Tableau de bord », one `dashboard_*` key per widget, granted from Paramètres › Utilisateurs). The TRM `PermissionsContext` reads `/permissions-trm/me`; admins see every widget.
- **Plumbing TRM had to grow for the shell**: `contexts/HeaderActionsContext.tsx` (verbatim ETM mirror; `AppShell` wraps in its provider, `Header` owns the slot div and swaps the dashboard submenu for `useDashboardTabs()`), the `.dashboard-grid` block at the end of `index.css` (verbatim), `react-grid-layout` in `package.json` + `resolve.dedupe`, the `process.env.DRAGGABLE_DEBUG` define in `vite.config.ts`, `DASHBOARD_ROUTE_PREFIX` in `navigation.ts`, and the three ETM files in `tailwind.config.js` `content`.
- **Adding a widget** = one registry entry + its component in `src/components/dashboard/` + a key in `permission-keys-trm.ts` + an endpoint in `ETM/apps/api/src/routes/dashboard-trm.ts` (`/api/dashboard-trm`, one router for every TRM widget, gated with `trmUserHasPermission`). `dashboard-trm.ts` is for widgets with **no ETM equivalent**; a widget that mirrors an ETM one over a partitioned table gets a scoped router factory instead — see the finance widgets below.

### Widgets financiers — Charges · Chiffre d'affaires · Analyse financière · Évolution du CA

The four ETM finance widgets, over **TRM's own partition of the same books**. There is
no second aggregation: `upload_compta` / `compte_compta` (`id_societe`) and `facture`
(`IDsociete`) are partitioned tables whose two halves are the **same object**, so the API
is the `factures.ts` shape — **one router factory, two scopes** —
`createFinanceRouter(scope)` in **`ETM/apps/api/src/lib/finance-common.ts`**, mounted on
ETM's `rapportsRouter` (URLs unchanged) and at **`/api/rapports-trm`** for this app.
Everything société-dependent, *including which permission store answers*, lives in
`FINANCE_SCOPE_TRM`. Improve that file — never fork a TRM copy.

| Widget | Endpoint | Permission |
|---|---|---|
| Charges | `GET /rapports-trm/finance` | `dashboard_charges` |
| Analyse financière | `GET /rapports-trm/finance/analyse` | `dashboard_finance` |
| Chiffre d'affaires | `GET /rapports-trm/ca-clients` | `dashboard_ca` |
| Évolution du CA | `GET /rapports-trm/ca-evolution` | `dashboard_evolution_ca` (sous-droit, l'API exige `dashboard_ca`) |

- **The web components are verbatim mirrors of ETM's** (`components/dashboard/*Widget.tsx`
  plus `lib/depassement.tsx`) — improve them **in ETM** and re-copy, like
  `components/tickets/`. Deltas, all documented in each file's header: the endpoint path,
  a `trm-`-prefixed React Query key (the two apps must never share a cache entry for the
  same URL shape), and the CA donut below.
- **The Répartition donut drops ETM's 10 000 € / 5 000 € "Other" buckets.** TRM invoices
  **8 or 9 clients a year** (ETM: ~144) and bills **~98 % of its revenue to Ets Malterre**
  (2025: 335 304 € of 340 853 €), so those thresholds would fold the whole book except one
  client into a single grey wedge. Every client that billed something gets its own slice;
  the near-single ring is the finding, not a bug.
- **`/finance` is an any-of gate.** It returns the compte-by-compte balance (it names the
  salary lines) and feeds two unrelated consumers, so `FINANCE_SCOPE_TRM.financeKeys` lists
  **both** `dashboard_charges` (this widget) and `view_rapport_finance` (the Rapports ›
  Finance screen, landed 2026-08-25). Neither key is the other's parent — holding one does
  not imply the other, and **removing `dashboard_charges` from that list would silently
  blank this card** for anyone granted only the widget.
- ⚠️ **Pas de BFR possible ici non plus, et le constat vaut pour les deux partitions** :
  `compte_compta` ne contient **aucun compte sous 600000**, ni pour la société 1 ni pour la
  société 2 — ce que dépose l'expert-comptable est un compte de résultat, pas un bilan.
  Détail, preuves et sorties possibles dans `ETM/CLAUDE.md` § « BFR / bilan — hors de portée ».
- **Verified against société 2 before shipping** (probe
  `ETM/apps/api/src/scripts/probe-finance-trm.ts`, re-run it after an `/etm_deploy`):
  the compte-level sums reproduce `upload_compta`'s `frais_fixe` / `frais_variable`
  **exactly** on the 2025 and 2026 anchors (46 633,56 € / 10 562,04 € at 2026-03-23), and
  the `facture` × `ligne_facture` CA agrees with `upload_compta.produits` to 0,0 % on
  2026 — two independent sources for the same number. The **2024 anchor drifts ~4,5 k€**
  because `frais_variable` is the compte's *current* classification, not the one in force
  that year; ETM drifts the same way and the legacy screen does too, so it is not corrected.
- **TRM's shape is the mirror of ETM's**: charges *fixes* dominate (46 634 € vs 10 562 €
  variables) and the marge brute runs at ~90 % of CA, because TRM knits **à façon** — the
  client supplies the fil, so there is almost no variable purchase. EBE 54 429 € on a CA of
  111 625 € at 2026-03-23.
- ⚠️ **The Charges card compares a partial year against a *full* N-1, and that is the
  POINT since 2026-08-26** — it no longer shows the raw ratio as its verdict. Amount for a
  year = the last upload *falling in that calendar year* (the legacy rule, which ETM's
  report reads the same way), so a « 23 % » in March is a partial-vs-full figure and means
  nothing on its own. The card therefore subtracts the **share of the year elapsed at the
  arrêté date** and shows the écart in points: a gauge whose fill is the consumed share of
  the N-1 envelope and whose navy tick is the repère. Charges *fixes* carry an alert ladder
  (±3 pts « au rythme », +10 amber, beyond red), charges *variables* carry none — more
  variable charge means TRM knitted more. Full rationale in ETM's `CLAUDE.md` § Charges
  widget and in the file header; the two apps must keep the same reading.
- **Trois autres réglages du 2026-08-26, communs aux deux applications** (faits dans ETM et
  re-copiés) : « Chiffre d'affaires » ouvre sur **Même période** au lieu d'Année complète ;
  « Évolution du CA » donne à l'**année en cours** le style 0 (bleu accent, plein, trait
  épais, dessiné au-dessus) au lieu de ce que la liste croissante laissait — et remplace sa
  **légende** par une infobulle au survol, classée par CA, les pastilles d'année restant la
  clé des couleurs ; « Analyse financière » ne porte plus la mention « Variation de stock
  estimée à … et intégrée » sous ses tuiles (le calcul, lui, est intact — et de toute façon
  côté TRM il n'a jamais existé : l'estimation est ETM-seulement, `scope.societe === 1`).

### Widget « Poids des pièces » — port of `FI_Mauvais_Compteur.wdw` + `FEN_Graphe_Compteur.wdw`

The legacy windows are PCS-compressed, but their SQL survives in **WinDev's compile cache** (`C:\Mes Projets\MPS\MPS.cpl\<user>\00000000\<Window>.<hash>.wdw.wcw` — string literals, identifiers and real literals are readable; integer literals and function names are not). That is the place to look for any future TRM port; the recovered query is quoted in full in `routes/dashboard-trm.ts`.

- **Unit = the roll** (`stock_ecru` row, the visiteuse's weighing), never `piece_production` — its `poids` is the nominal 20/10 kg, not a measurement. Target = `ordre_fabrication.poids_piece`.
- **Valid** ⇔ `poids_piece ≤ poids ≤ poids_piece + 0,7` **or `poids ≤ 0,65 × poids_piece`** — a remnant (end of lot, piece cut after a defect) is deliberately not held against the métier. Evaluated on the raw doubles, on purpose: `poids` is a 4-byte real, so a roll keyed as 20,7 reads 20.7000008 and is *invalid* in the legacy too. Verified 6/6 against the live widget.
- **Rows**: OFs with `est_actif = 1` **and at least one weighed roll**, sorted by pct ascending; Métier = `machine.emplacement`; Nb pièces = `COUNT(stock_ecru)`. Colours: red `< 0,6`, orange `< 0,8`, green (the two literals recovered next to the query; the boundary operators are an assumption). No `IDsociete` filter anywhere — the ETM handover flips delivered rolls to société 1 and the legacy counts them.
- **Chart** (click a row; legacy: double-click): every roll of the OF by `date_saisie`, dashed target line, band `[poids_piece, poids_piece + 0,7]`, red outside. Deliberate deltas: axis target ± 2 stretched to at most ± 4 with out-of-range points pinned as triangles (a 3 kg remnant must not squash the band), a grey remnant zone, X = weighing sequence, hover tooltip. The legacy's `18–22` axis is an inference (integer literals don't survive the cache).

### Widget « Pièces à visiter » — port of `FI_PiecesAVisiter.wdw`

Le tombé métier qui est sorti d'un métier et que personne n'a encore pesé : la liste de
travail de la visiteuse, et la preuve pour le régleur que ça s'accumule quelque part.
Écran `apps/web/src/components/dashboard/PiecesAVisiterWidget.tsx` ; API
`GET /api/dashboard-trm/pieces-a-visiter` ; droit `dashboard_pieces_a_visiter`.

Le `.wdw` est PCS-compressé : la requête vient du **cache de compilation WinDev**
(`MPS.cpl/<user>/00000000/FI_PiecesAVisiter.*.wdw.wcw`) et **le WLanguage de la boucle de
coloriage a été fourni par l'utilisateur** — les littéraux entiers ne survivent pas au
cache, donc les seuils n'étaient pas récupérables autrement. Les deux sont cités verbatim
dans l'en-tête de `routes/dashboard-trm.ts`.

- **Population** = pièce `piece_production` terminée, sans `stock_ecru`, `date_fin` dans les
  **24 h**, la plus ancienne en tête. Pas de filtre `IDsociete` (les tables OF n'en ont pas).
- **Couleur = le temps d'attente**, et c'est le seul signal du widget : **rouge ≥ 3 h,
  orange ≥ 2 h, vert en deçà** (`dhDateRouge.Heure -= 3` / `dhDateOrange.Heure -= 2`).
  Calculée **dans le navigateur** contre une horloge qui bat à la minute, comme le legacy la
  calcule contre `DateHeureSys()` — mais sans figer au moment du fetch : une ligne passe à
  l'orange puis au rouge sous les yeux. Épinglé à la minute par
  `PiecesAVisiterWidget.test.ts` : un `<` pris pour un `<=` décale toute la grille d'une heure
  sans que rien ne se voie.
- **Colonne « Attente » en plus du legacy** : le legacy peint la ligne et laisse lire deux
  heures d'horloge pour comprendre pourquoi. La couleur doit être lisible comme un nombre.
- **Lecture seule**, comme le legacy (décision utilisateur du 2026-08-27) : pas de clic vers
  Production › Visitage. Le widget constate, le poste saisit.
- ⚠️ **L'équipe se dérive de l'heure PARSÉE, jamais du `SUBSTR(date_fin,9,2)` du legacy.**
  Bornes legacy conservées (5–13 Matin, 13–21 Après-Midi, sinon Nuit), mais le SUBSTR ne lit
  l'heure que sur le `AAAAMMJJHHMMSS` compact de WinDev ; sur un pilote qui rend
  `YYYY-MM-DD HH:MM:SS` ces deux caractères sont le **jour du mois**, et le même CASE
  étiquetterait toutes les pièces par quantième. Mesuré 0/8 sur le pilote ODBC Windows
  (`probe-pieces-a-visiter-trm.ts` §5).
- **Le lecteur est partagé avec le poste de Visitage** : `awaitingPieces()` dans
  `ETM/apps/api/src/lib/production-trm.ts`, extrait de `visitage-trm.ts` pour ce widget.
  Il encode de la discipline de pilote (anti-jointure résolue en JS — `date_fin <> ''` vs
  `IS NULL` ne se comportent pas pareil des deux côtés — et balayage par machine plutôt que
  la boucle par OF du legacy, qui perd les pièces des OF terminés). **Améliorer ce fichier,
  ne jamais en forker une copie.** Chaque appelant pose sa propre fenêtre : 7 jours pour le
  poste, 24 h pour le widget.
- **Sonde de parité** : `ETM/apps/api/src/scripts/probe-pieces-a-visiter-trm.ts` (lecture
  seule, rejouable en prod après un `/etm_deploy`). Elle fait tourner le SQL legacy et le
  helper côte à côte — **56 vs 56 dans la profondeur de scan** au 2026-08-27 — vérifie que
  l'anti-jointure n'a pas de trou (aucun `stock_ecru` sans `date_saisie`) et enregistre la
  forme de DATETIME que parle le pilote. `PROBE_WINDOW_DAYS` élargit la fenêtre : la base de
  dev est un instantané de mars, donc 0 ligne à 24 h.
- Dérogation dev `PIECES_A_VISITER_WINDOW_HOURS` (`apps/api/.env.development` **seulement**,
  la prod garde 24 h) — même raison et même patron que `VISITAGE_PIECE_MAX_AGE_DAYS`.

## Design system rule

**Before building or modifying any user-facing screen, component, button, tab, card, dialog, or interaction pattern, you MUST invoke the `mps_designer` skill (`Skill(skill: "mps_designer")`).** Not optional — same rule as ETM. The skill is a pointer, so its first instruction is to `Read` ETM's canonical file — do that before writing code, not after.

**Before inventing a pattern, grep the ETM gold-standard reference screens** (`C:\dev\etsmalterre\ETM\apps\web\src\pages\`): `Entreprises.tsx`, `FilsGestion.tsx`, `FilsStock.tsx`, `FilsCommandes.tsx`, `EtudesColoris.tsx`. Reuse the exact same icons, strings and dialog structures.

Key invariants (full detail in the skill):
- Panel backgrounds `bg-zinc-100/80` (list/sidebar) / `bg-zinc-200/50` (header/footer) / `bg-white` (cards); `scrollbar-transparent` on scrollable panels. **Never hardcode hex values.**
- OS system font stack only — **no web fonts** (`@import`/`<link>`/`@font-face` are banned in `index.css`).
- "Modifier" CTA is always `<Button variant="gold">`.
- 3-panel `MasterDetailLayout` for master-detail screens; table-centric pattern (§27) for row-list screens; unsaved-changes guard (§28) on every edit-mode screen.
- Native `<select>` is banned — use `PopoverSelect` / `SearchableCombobox`.

## React / frontend rules (inherited from ETM)

- **Hooks before early returns** — violating crashes production builds (React error #310).
- **Shared `apiFetch`** (`src/lib/api.ts`) for every API call — sets `credentials: 'include'` for cookie auth. Never duplicate per page.
- **SW denylist for `/api/`** in `vite.config.ts` — never remove.
- **Never revert web build to `tsc -b`** — emitted `.js` in `src/` shadows `.tsx` sources in Vite. Build is `tsc --noEmit && vite build`.
- HFSQL booleans are `0`/`1` — always `!!value &&` in JSX to avoid rendering `0`.
- **`<Badge className="badge-warning">` renders navy, not amber.** The `.badge-*` helpers live in `@layer components` while the Badge's own `bg-primary` is a plain utility, and utilities beat components — the helper silently loses. For a coloured badge, pass `variant="outline"` plus explicit utilities (`bg-amber-500/15 text-amber-800 border-amber-500/30`). Applies to ETM's copy of `badge.tsx` too.

## Versioning

Mirrors ETM exactly (`ETM/CLAUDE.md` §Versioning) — same mechanism, **separate version
numbers**: the two apps ship independently, so TRM started its own count at **0.0.1** on
2026-08-26 (ETM was at 0.2.4). Do not try to keep them in step.

- **Single source of truth**: `version` in the **root** `package.json`. The web build
  injects it as `__APP_VERSION__` (`define` in `apps/web/vite.config.ts`, declared in
  `apps/web/src/vite-env.d.ts`) and the header profile menu displays it under the
  « Actualiser l'application » button.
  - ⚠️ **`vite-env.d.ts` était `.gitignore`-é et jamais commité** jusqu'au 2026-08-27 :
    la règle `apps/web/src/**/*.d.ts` (qui existe pour empêcher un `tsc -b` d'éclipser les
    sources) l'avalait. Le fichier n'existait donc que dans le checkout principal, où il
    avait été créé à la main — et **tout worktree neuf échouait au build** sur
    `TS2304: Cannot find name '__APP_VERSION__'`, alors que `/trm_deploy` depuis le
    principal passait. Corrigé en reprenant la négation qu'ETM avait déjà
    (`!apps/web/src/vite-env.d.ts`) et en commitant le fichier. Ne pas ré-ignorer.
- Unlike ETM there is **no `vitest.config.ts`** here — vitest reads `vite.config.ts`, so
  the one `define` covers the test run too. If a vitest config is ever added, the define
  must be duplicated into it or every test touching the Header fails on an undefined global.
- The per-package `apps/*/package.json` versions are displayed **nowhere** — leave them
  alone, don't keep them in sync.
- To release: bump the root version, commit `chore(release): X.Y.Z`, then `/trm_deploy`.
  The skill takes an optional version argument (`/trm_deploy v0.0.2`) that does this for you.
- **« Actualiser l'application »** (`lib/sw-refresh.ts`, a verbatim mirror of ETM's — improve
  it in ETM and re-copy) waits for the new service worker to *take over* before reloading.
  A plain `registration.update()` + reload races the install and re-serves the old build —
  that was ETM's « click twice to get the new version » bug. This matters more here than in
  ETM: the bonnetiers' shop-floor devices run the installed PWA and rarely get closed.

## Conventions

- **Code**: English. **UI**: French. **Comments**: English.
- **"check last screenshot"** → read the latest file in `%USERPROFILE%\Pictures\Screenshots`.
- Git remote: `github.com/etsmalterre/TRM` (etsmalterre account).

## Quick Start

```bash
pnpm install
pnpm dev          # web on http://localhost:5175

# The ETM API must be running (dev port 8080):
#   cd C:\dev\etsmalterre\ETM && pnpm dev
```

## Business Domain (Quick Reference)

Same glossary as ETM (`C:\dev\etsmalterre\ETM\claude_doc\business_glossary.md`).

| French | English |
|--------|---------|
| Tricotage | Knitting |
| Métier | Knitting machine |
| OF (Ordre de fabrication) | Production order |
| Tombé métier | Greige fabric off the machine |
| Visitage | Piece inspection |
| Bonnetier | Knitter (machine operator) |
| Fonture | Needle bed |
| Jauge | Gauge |
