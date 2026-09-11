# Production › Visitage (le poste de visitage)

> Dossier de fonctionnalité, sorti de `CLAUDE.md` le 2026-09-02 (le fichier dépassait la limite de 150 k caractères). Contenu repris tel quel ; `CLAUDE.md` n'en garde que le résumé et les pièges majeurs. **Le mettre à jour ici**, pas dans `CLAUDE.md`.

## Production › Visitage (`/production/visitage`) — port of `FI_Visitage.wdw`

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
- ⚠️ **`POST /valider` est SÉRIALISÉ côté API (`validerLock`, `lib/serial-lock.ts`,
  testé), et le poste ne tire qu'une fois (`createLatch`, épinglé par
  `ProductionVisitage.test.ts`).** Le 2026-08-28 à 14:35:38, deux POST identiques sont
  partis du poste dans la même seconde (pièce 40751, OF 3564) : la garde « pièce déjà
  visitée » est un COUNT que les deux ont passé avant la première écriture, les numéros
  un MAX+1 sur lequel les deux étaient d'accord — **quatre rouleaux pour une coupe en
  deux, et deux lignes par clé primaire dans `evenement_piece`** (HFSQL n'a pas
  d'index unique dessus, et `newIdAfterInsert` rend le PLUS HAUT id au-dessus du
  repère, donc les deux réponses ont nommé les mêmes rouleaux). Le fil, lui, n'a été
  décrémenté qu'une fois : le pont est FIFO, les deux ont lu `avant` bien avant que
  l'un n'écrive `apres`. Réparé à la main le jour même (56936 / 56938 supprimés, les
  deux événements réécrits, `stock_fil` intact).
  - Côté web, `valider.isPending` ne suffit PAS : TanStack notifie React par
    `setTimeout(0)`, donc pendant une macrotâche après `mutate()` le bouton et
    Ctrl+Entrée lisent encore « libre ». D'où un verrou synchrone dans le handler,
    relâché par `onSettled` — `isPending` reste l'affordance de rendu, pas la garde.
  - Côté API le verrou est **global, pas par pièce** : les PK MAX+1 sont partagées
    entre pièces, deux pièces validées au même instant se marcheraient dessus aussi.
    Le second appel attend, puis rencontre les rouleaux du premier → 409
    `piece_deja_visitee`, le message « déjà visitée ailleurs » du poste.
  - ⚠️ Le même patron « check, MAX+1, INSERT » sans verrou existe dans les autres routes
    d'écriture TRM (`of-trm`, `expeditions-trm`, `maintenance-trm`…) : même exposition
    à un double envoi, non traitée — `createSerialLock` est là pour ça.
- **Deux séquences de numérotation par OF** : 1er choix `num_piece_OF < 1000`, déclassé
  `1000+` — et le **premier déclassé d'un OF est 1001**, pas 1000 (438 OF vivants contre 167).
- ⚠️ **Un déclassé sort du visitage SANS réservation** (`IDLigne_Commande_TRM = 0`) ; seul
  le 1er choix porte la ligne de commande de l'OF. Le legacy n'affecte un 2nd choix qu'à
  la main, à l'expédition (mesuré sur la prod le 2026-09-07 : 547 des 1 588 déclassés
  legacy portent une ligne et 546 d'entre eux sont expédiés — la ligne d'un déclassé est
  la trace d'une expédition, pas du visitage ; le dernier déclassé legacy, 3541/1006, est
  à 0). La règle « ligne = celle de
  l'OF, 12/12 » avait été mesurée sur des 1er choix seulement, et **le poste a réservé ses
  déclassés pendant sa première semaine** (LIVA #1129) : ils apparaissaient dans
  l'Affectation de la commande à plein poids et sont partis avec « Expédier » comme du
  1er choix (3564/1001, 3542/1006, 3554/1001 — expédiés et facturés, laissés tels quels ;
  3566/1001 remis à 0 à la main). Corrigé dans le plan de `POST /valider` (le champ
  `IDLigne_Commande_TRM` est exposé par `?dry_run=1` pour que `check-visitage-trm.ts`
  l'affirme sans écrire), compté par `probe-visitage-trm.ts` §6 (le chiffre ne doit jamais
  monter), réparé par **`fix-choix2-affectation-trm.ts --write` sur le serveur juste après
  l'`/etm_deploy`** (ne libère que les déclassés encore en stock dont la ligne est celle
  de l'OF ; un rouleau expédié est une décision humaine, pas un UPDATE).
  - **Lacune assumée** : TRM n'a pas de « Affecter des pièces disponibles » — un déclassé
    libéré ne se ré-affecte aujourd'hui que depuis l'écran commande du WinDev (le legacy
    a ce sélecteur, même référence et coloris, 2nd choix en dernier). À traiter dans un
    ticket propre, pas dans ce correctif.
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
  - ⚠️ **L'OF de contexte du poste est l'OF en cours (`est_actif = 1`), plus la requête
    legacy** (`priorite <= prio_actif.priorite`, la plus basse gagne) : après la clôture
    depuis un terminal Android (`est_actif` seul basculé), cette requête rendait
    l'**ancien** OF et les pièces du nouveau n'étaient plus que des « isolées » (LIVA
    #1128, 2026-09-07). `headOfForMachine` = `activeOfOnMachine`, précédé de
    `healHandedOverOfs()` (`lib/of-queue-trm.ts`, voir le dossier Production › OF).
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
  - **Deux deltas assumés** : le vieux logo pyramide `TRM.jpg` devient le **M Malterre**
    (le monogramme, pas le mot-symbole large : la bande de gauche d'une 89 × 36 est haute
    et étroite, décision du 2026-08-27) ; et un rouleau déclassé porte désormais un **pavé
    noir « DÉCLASSÉ »**, que le legacy n'imprime pas — or c'est précisément ce que
    l'étiquette d'un rouleau devrait dire. Il vit sur la ligne de date, et **pas** en coin
    haut-droit : à 22 pt un numéro à neuf caractères (« 3417/1001 ») atteint ce coin.
  - ⚠️ **NOIR ET BLANC, par construction et par le test** (`EtiquetteEcruPdf.test.ts`
    refuse toute couleur du stylesheet hors `INK` / `PAPER`). Une Dymo est thermique : tout
    ce qui n'est pas quasi-noir sort en trame grise, **et il n'y aura jamais d'imprimante
    d'étiquettes couleur au poste** (décision du 2026-09-11). La première version portait
    le badge M doré (`logo-m-email.png`) et sortait en carré gris moucheté ; depuis le
    2026-09-11 la bande de gauche est **un seul « tampon »** : un cadre arrondi (1,6 pt)
    avec le M script noir (`logo-m-mono.png`, le même que l'étiquette ref_fini) au-dessus
    du code métier **en réserve blanche sur une cellule noire pleine** — un seul objet,
    comme un tampon encreur, et chaque trait est de l'encre pleine ou du papier nu. Deux
    variantes écartées au rendu : le badge noir avec le M en réserve (bloc lourd qui se
    bat avec le pavé DÉCLASSÉ, et le ruban tricolore devient une encoche blanche) et le M
    nu au-dessus du cadre métier (deux marques flottantes). Les petits libellés (N° ·
    POIDS · RÉF.) sont des capitales espacées en noir, plus de gris `#444`. Aperçu sans
    rouleau : `GET /api/visitage-trm/etiquettes?demo=3`.
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
    `chrome.exe --kiosk-printing --user-data-dir="C:\visitage-profile" --app=https://trm.intra.etsmalterre.com/production/visitage`.
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


