# Atelier — la PWA mobile de l'atelier (`apps/atelier`)

> Dossier de fonctionnalité, sorti de `CLAUDE.md` le 2026-09-02 (le fichier dépassait la limite de 150 k caractères). Contenu repris tel quel ; `CLAUDE.md` n'en garde que le résumé et les pièges majeurs. **Le mettre à jour ici**, pas dans `CLAUDE.md`.

## Atelier — la PWA mobile de l'atelier (`apps/atelier`)

Migration de l'app Android legacy des bonnetiers/régleurs. **Deuxième app du monorepo**,
hôte **`atelier.intra.etsmalterre.com`**, parc Android. Dossier de conception :
**`~/.claude/plans/atelier-malterre.md`** — décisions, pièges vérifiés, questions ouvertes.

**État au 2026-08-27** : Accueil (grille de visages) → Choix Métier (Actifs / Inactifs) →
Poste, **saisie comprise**. Les huit actions du legacy s'enregistrent (`POST
/api/atelier/of/:id/evenement`), depuis un téléphone enrôlé.

## Les métiers inactifs — dernier OF, à suivre, historique (2026-09-15)

Décision de Vincent du 2026-09-15 : la tuile d'un métier **sans OF** n'est plus vide, et
le poste d'un métier sans OF n'est plus un état vide.

- **Les segments disent « Actifs / Inactifs »**, pas « Actives / Inactives » comme le legacy :
  sa liste s'appelait « Machines Actives », la nôtre est titrée « Métiers », et métier est
  masculin. Ne pas réintroduire le féminin (commentaires compris).
- **La tuile inactive garde les trois fentes de la tuile active** (`MetierTile`) : l'article
  du dernier OF (réf · coloris, en gris) là où va la barre d'avancement, et en dessous les
  pastilles « Terminé il y a 3 j » (neutre) et « → réf · coloris » (bleu accent) pour l'OF
  à suivre ; **aucun glyphe d'état** — le cercle pointillé « au repos » (tuile et en-tête du
  poste) a été retiré le 2026-09-15, « inutile » selon Vincent : ne pas le remettre. Une
  première version à petites étiquettes majuscules empilées a été jugée « laide et pas
  harmonieuse » (2026-09-15) — ne pas y revenir. Les chiffres restent sur le poste.
- **L'onglet vit dans l'URL** (`/?vue=inactifs`, `lib/vue-metiers.ts`, 2026-09-15) : la
  flèche retour du poste revenait toujours sur Actifs (`useState` remis à zéro par
  `navigate('/')`). Le retour du poste va sur l'onglet où le métier se trouve **maintenant**
  (`cheminListe`) ; les autres écrans reviennent par `navigate(-1)`, qui garde l'URL. La
  règle Actifs / Inactifs (`estInactif`) n'a qu'une copie.
- **Les pastilles de pièces portent le rouleau tombé métier** (`components/icons/TmRollIcon.tsx`,
  miroir de celui de l'ERP, masque CSS sur `public/icons/tm.png`, précaché par
  `includeAssets: ['icons/*.png']`) — plus l'icône « Layers » de lucide.
- **Le poste d'un métier sans OF** (`components/atelier/MetierAuRepos.tsx`) : en-tête §5
  « Aucun OF en cours », puis deux cartes à bandeau sable (`Entete`, la grammaire de la fiche
  de réglage) : « À suivre » (l'OF en tête de file, que l'ERP active par « Passer en cours »
  ou l'`auto_activation`) et **les 20 derniers OF terminés du métier**
  (`GET /api/atelier/machines/:id/derniers-of`, `DERNIERS_OF_MAX`). Chaque rangée
  (`RangeeOf`) reprend la tuile un cran plus petit : n° d'OF en gros à gauche, réf · coloris
  avec « il y a … » à droite, pastilles pièces faites / commandées, Σ poids visité, et 2ᵉ
  choix en ambre quand il existe. Lecture seule, pollée avec les défauts de l'app.
- **API** : `inactif` sur chaque ligne de `GET /machines` (`null` dès qu'un OF tourne),
  calculé par `reposDesMetiers()` en trois lectures bornées pour toute la liste (GROUP BY
  `MAX(IDordre_fabrication)` par métier, ces lignes, la file d'attente). Les choix sont
  purs et testés dans `lib/metier-repos-trm.ts`. Coût mesuré en dev : ~120 ms de plus
  sur la liste régleur (0,25 → 0,37 s), ~40 ms sur la liste bonnetier.
- ⚠️ **« Dernier OF » = l'id le plus haut parmi les OF terminés du métier**, pas le
  `MAX(arret_prod)` (empty-vs-null du DATETIME entre ODBC et le pont) — la même lecture que
  l'onglet Terminés de l'ERP et la référence précédente de la fiche de réglage. **La date
  de fin est `arret_prod`** (3 162 des 3 163 OF terminés la portent, sondé le 2026-09-15),
  repli sur la fin de la dernière pièce pour le reliquat Android.
- ⚠️ **« À suivre » = la tête de file comme `rerankQueue()` l'ordonne** (`priorite ASC`, les
  non classés après, puis id) — le téléphone nomme l'OF que l'ERP activerait.
- Le libellé relatif (`lib/depuis.ts`, testé) : minutes, heures, jours jusqu'à 30, puis la
  date — un métier arrêté depuis novembre dit « le 29/11/2025 », pas « il y a 290 j ».
- **Pas un portage** : `FEN_Historique` du build régleur est l'historique **par pièce d'un
  OF** (porté à part) ; l'historique par métier n'existe pas dans le legacy.

**Ce qui manque encore, dans l'ordre où ça compte :**
- ⚠️ **Pas d'annulation**, alors que le legacy en a une (`IMG_Annuler` sur la dernière
  action). Une mauvaise « Terminer OF » n'est donc pas rattrapable depuis le téléphone :
  elle ferme la pièce, arrête l'OF et **le termine** (`terminerOf()` de
  `lib/of-queue-trm.ts` — `est_termine = 1`, re-rang, activation du suivant s'il a
  « Activation auto » : la même voie que le bouton de l'ERP). Jusqu'au 2026-09-07 elle
  reproduisait l'`AutoActivation()` legacy, qui ne bascule qu'`est_actif` (LIVA #1128).
- **Un téléphone n'écrit que s'il est enrôlé** (2026-09-15, § « Enrôlement des
  téléphones » plus bas), et **l'enrôlement suffit** : le droit `saisie_atelier` a été
  retiré le même jour (décision de Vincent — seul un admin émet un code, personne n'enrôle
  un téléphone pour qu'il reste en lecture). À faire sur la prod : enrôler les deux
  téléphones de régleur sous les comptes de Nicolas (11) et Mickaël (21), les téléphones
  partagés sous `Regleur` (14).
- Un seul écran secondaire reste : Information (la checklist de nettoyage, littéraux
  récupérés verbatim). Consigne, Historique et Fils OF sont portés (voir « L'OF actif »).
- L'hôte de prod (nginx sur `10.10.20.4` + entrée Caddy sur `10.10.20.5`).

## Rafraîchissement — les téléphones convergent en 10 s (2026-09-15)

Décision de Vincent du 2026-09-15 : une action faite ailleurs (l'ERP termine un OF, un
régleur lance le suivant depuis son téléphone, un bonnetier enregistre une fin de pièce
sur le poste d'à côté) doit apparaître sur tous les téléphones « plus ou moins
instantanément ». Jusque-là l'app ne relisait qu'au retour au premier plan, derrière des
`staleTime` de 15 à 30 s : deux téléphones pouvaient montrer deux vérités pendant une
demi-minute.

- **Une seule constante, `POLL_MS = 10 s`** (`apps/atelier/src/lib/rafraichissement.ts`),
  posée en **défaut du `QueryClient`** (`main.tsx`) : `refetchInterval`, `staleTime`,
  `refetchOnWindowFocus`, `refetchOnReconnect`, et `refetchIntervalInBackground: false`.
  C'est le `POLL_MS` de la tablette TRS : l'enregistreur réécrit l'état toutes les ~10 s,
  rien n'est plus frais. **Aucun écran ne porte de `staleTime` propre** — un écran qui en
  remettrait un plus long recouvrirait le poll au retour au premier plan.
- Seules les requêtes **montées** interrogent, et **jamais en arrière-plan** (écran éteint,
  app derrière une autre) : un téléphone sur le poste coûte deux lectures bornées toutes
  les 10 s, un téléphone dans une poche ne coûte rien ; au réveil, une relecture immédiate.
  ⚠️ La liste `?regleur=1` est la plus chère (deux balayages 24 h + `TOP 100` par couple
  réf/coloris, cache par OF côté API) — si le nombre de régleurs monte, c'est elle à
  surveiller.
- **Deux requêtes disent explicitement `refetchInterval: false`** : les lookups de défauts
  (`SaisieBand`, contenu de fenêtre, `staleTime: Infinity`) et la grille de visages de
  l'Accueil (`staleTime` 5 min) — un téléphone laissé sur la grille toute la journée ne
  doit pas taxer l'API pour une liste qui ne bouge jamais.
- **Deux gardes contre le poll qui arrive sous les doigts** :
  - `EditeurConsigne` (Consigne) ne réarme le champ sur une nouvelle valeur serveur que
    si le brouillon est **intact** (`initialePrecedente` ref) ; un brouillon touché reste,
    et se lit « modifié » contre le texte plus récent.
  - `SaisieBand` ferme une feuille ouverte (confirmation, fin de pièce, défaut) dont l'action
    **n'est plus proposée** par l'OF rafraîchi, ou dont l'OF a changé (la feuille retient
    l'`ofId` sur lequel elle a été ouverte), avec la raison en ligne, plutôt que de
    l'envoyer pour que le serveur la refuse. `actions` est mémoïsé sur l'objet OF, que
    React Query garde stable tant que la charge utile ne change pas : la garde ne tire que
    sur un vrai changement.
- Le Poste résout son OF **par la liste des métiers** : quand l'ERP termine l'OF et active
  le suivant, l'`ofId` change au poll suivant et l'écran bascule seul sur le nouvel OF.
- Non fait : l'ERP (`apps/web`) reste à 5 min de `staleTime` ; Production › OF et Visitage
  ne voient une saisie téléphone qu'au focus ou après leur propre écriture.

### Un déploiement arrive seul sur les téléphones (`lib/mise-a-jour.ts`, 2026-09-15)

Le second volet de la même décision : « quand je pousse une mise à jour, le téléphone se
met à jour tout seul ». Jusque-là le script injecté par vite-plugin-pwa (`registerSW.js`)
enregistrait le worker **et rien d'autre** : aucune vérification (le navigateur ne
vérifie qu'à une navigation ou toutes les 24 h, et une PWA installée jamais fermée ne
navigue pas), et quand le nouveau worker finissait par s'installer et prendre la page
(`skipWaiting` + `clientsClaim` dans `sw.ts`), la page continuait à faire tourner
**l'ancien bundle**. Un déploiement pouvait rester invisible un jour entier.

- `injectRegister: null` dans `vite.config.ts` ; `installerMiseAJour(queryClient)` dans
  `main.tsx` enregistre `/sw.js` lui-même, appelle `registration.update()` toutes les
  **`CHECK_MS = 60 s`** et à chaque retour au premier plan, et **recharge la page sur
  `controllerchange`** — c'est-à-dire une fois que le nouveau worker contrôle la page,
  donc que la navigation sera servie par son `index.html` précaché et ses assets hachés
  (la même leçon que `sw-refresh.ts` d'`apps/web` : recharger avant, c'est resservir
  l'ancien build).
- ⚠️ **Le rechargement attend qu'aucune écriture ne soit en vol** (`qc.isMutating()`,
  abonnement au `MutationCache`) : recharger au milieu d'une « Fin de pièce » abandonne
  la requête côté téléphone alors que le serveur peut la commettre. Ce qui n'est pas
  enregistré (brouillon de consigne, action choisie non confirmée) est perdu ; l'identité
  survit (localStorage), le téléphone revient sur le même poste.
- Le tout premier `controllerchange` (page sans contrôleur au démarrage = première
  installation, pas une mise à jour) ne recharge pas. Rien ne tourne en dev
  (`import.meta.env.PROD`, `devOptions.enabled: false`).
- nginx sert `sw.js` en `no-store` (vérifié sur la prod le 2026-09-15) et le navigateur
  contourne de toute façon le cache HTTP pour le script du worker.
- ⚠️ **Le premier déploiement qui porte ce mécanisme ne s'installe pas seul** : les
  téléphones en service tournent encore l'ancienne inscription, sans vérification. Une
  fois — recharger chaque téléphone à la main (ou attendre le contrôle des 24 h). Tous
  les déploiements suivants arrivent seuls en ≤ 1 min + un rechargement.
- La tablette TRS (`apps/trs`) a exactement le même trou (script injecté, jamais fermée)
  et n'est pas traitée ici.

## Vibration — le téléphone confirme sous le doigt (`lib/vibration.ts`, 2026-09-15)

Le legacy Android vibrait **100 ms sur presque chaque tap** (`vibrationDeclenche(100)`,
34 appels dans `Android\dbg\Compile\` : visage, métier, retour, icônes fil / info…) : une
vibration identique partout, qui ne disait rien d'autre que « touché ». Les opérateurs ont
l'habitude, et l'atelier s'y prête (bruit, gants, regard sur la machine) ; une app muette
donne l'impression qu'un tap n'est pas passé. On garde l'habitude, mais la vibration porte
une information :

| Moment | Motif |
|---|---|
| Le serveur confirme une écriture (saisie, consigne, message, Lancer OF, enrôlement) | `confirme` — une impulsion courte et ferme (60 ms) |
| Une écriture est refusée ou n'arrive pas (réseau, non enrôlé, 409) | `refuse` — deux impulsions rapides (50·70·50) |
| Choisir un visage (Accueil) ou un métier (Choix Métier) | `tick` — très léger (12 ms) |
| Défiler, segments, onglets, retour | rien |

- ⚠️ **Une écriture vibre à la réponse du serveur, jamais au tap** : sinon le téléphone dit
  « fait » pour une écriture qui échoue ensuite, et l'app n'a pas d'annulation. `confirme` /
  `refuse` ne sont appelés **par aucun écran** : le `MutationCache` du `QueryClient`
  (`main.tsx`) les tire pour **toute** mutation, donc une nouvelle écriture vibre sans
  qu'on y pense — et même si son écran s'est démonté (« Lancer OF » navigue au succès).
  Seul `tick` s'appelle depuis un gestionnaire de clic. Toute mutation de l'app est une
  écriture serveur ; une future mutation qui ne doit pas vibrer devra le dire.
- Limites du web (Chrome Android, PWA installée comprise) : durée et rythme seulement, pas
  d'intensité ; il faut que la page ait déjà reçu un tap (une réponse serveur après le tap
  compte, un poll sur un téléphone que personne n'a touché non — la cloche régleur ne peut
  pas vibrer, ce serait du push) ; un téléphone réglé sans vibration reste muet. No-op sur
  desktop et iOS, testé (`vibration.test.ts`).
- Le refus « l'OF a évolué depuis un autre poste » de `SaisieBand` ne vibre pas : il vient
  du poll, pas d'une écriture.

## La bande d'action du poste — deux rangées, sans défilement (2026-09-15)

Demande de Vincent (capture du poste 2A, OF 3424) : la bande d'action prenait ~430 px — un
en-tête « Action », une colonne de cinq choix de 56 px, puis « Valider » (64 px) et la
confirmation — et le poste défilait. Les actions sont de trois natures, la bande le dit
maintenant en deux rangées (`components/atelier/SaisieBand.tsx`, ~130 px) :

```
[ 🖌 Nettoyage 1/2 ] [ ⚑ Fin de pièce ] [⏸]   routine · routine · régleur seulement
[ ⚠ Signaler un défaut               ]        qualité → DefautSheet
```

- **Une tuile ouvre directement sa confirmation** : plus de sélection puis « Valider ». Deux
  taps au lieu de trois, jamais un seul — le « Voulez-vous vraiment enregistrer » du legacy
  reste, il n'y a pas d'annulation sur le téléphone.
- **Les tuiles gardent leur place.** Nettoyage reste affiché une fois les nettoyages de la
  pièce faits (grisé, « 2/2 ✓ ») au lieu de disparaître et de glisser Fin de pièce sous le
  pouce ; il ne sort que sur un OF qui n'en demande aucun (`nb_nettoyages_requis = 0`).
  « Terminer OF » prend la place de Fin de pièce sur la dernière pièce (liseré or).
- ⚠️ **« Dernière pièce » n'est pas une Fin de pièce douce : l'API ferme la pièce ET TERMINE
  L'OF** (même branche que Terminer OF, `terminerOf()`). Sur un OF « finir le fil » elle est
  la seconde réponse de la feuille Fin de pièce (« C'est la dernière pièce », bouton
  contouré — prop `alternative` de `ConfirmSheet`), qui ouvre **sa propre** confirmation
  « l'OF N sera terminé ». Une alternative de `ConfirmSheet` ne doit jamais écrire seule.
- **Pause / lecture** = la paire régleur Interrompre / Relancer OF en un bouton carré de
  64 px **habillé comme les tuiles** (carte blanche, bordure, ombre), portant **le glyphe
  d'état de la liste des métiers** (`ETATS` de `ChoixMetier.tsx`) dans un disque teinté :
  ⏸ bleu (`primary`), ▶ vert (`success`) — l'état où le tap mène, dans la couleur que la
  liste affichera ensuite (demandes de Vincent, 2026-09-15 ; un disque gris nu se lisait
  comme désactivé à côté des tuiles).
- **Défaut** ouvre `components/atelier/DefautSheet.tsx` (types en grille de deux, tailles
  pour les types cm, « Enregistrer le défaut » or). **La feuille EST la confirmation** —
  écart au legacy décidé avec Vincent ; elle reste ouverte pendant l'écriture et un refus
  s'y affiche, type choisi conservé. Les lookups restent chargés par la bande, pour que la
  feuille s'ouvre sur ses puces.
- La liste des actions offertes ne change pas : `lib/actions.ts` et l'API décident, la
  bande ne fait que les ranger. Aucun changement d'API.
- **« Dernière action » est un pied ancré** (bande 5, `Poste.tsx`) : hors de la zone qui
  défile, dans le **navy du bandeau** (`bg-gradient-brand`), libellé or, visage à liseré or,
  « il y a … » (`lib/depuis.ts`) au-dessus de la date exacte ; il porte
  `safe-area-inset-bottom`. Sur le fond blanc cassé de l'écran, l'ancienne bande se lisait
  comme du contenu de plus (retour de Vincent, 2026-09-15).
- **La fiche de réglage porte le coin d'icônes du poste** (Consigne · Fils,
  `components/atelier/BoutonIcone.tsx`, sorti de `Poste.tsx`) — **sans Historique** : la
  fiche est toujours un OF pas encore lancé, sans pièce ni rouleau (Vincent, 2026-09-15) ; la pastille
  « À lancer » est **retirée** (la clé à molette et « Lancer OF » en pied le disent déjà),
  la pastille de l'icône Consigne compte **notes + messages** (un OF à notes permanentes le
  dit dès le coin), et la rangée « Notes » en pied de fiche est retirée — l'écran Consigne
  porte l'onglet Notes. Fils et Historique résolvent l'OF par le métier, donc marchent sur un OF non lancé.
- **Pas d'onglet « Messages » sur un OF pas encore lancé** (écran Consigne, 2026-09-15) :
  les messages sont ce qu'une équipe laisse à la suivante sur un OF qui tourne. Sondé sur
  l'instantané de mars : 113 `message_of`, **aucun** sur un OF jamais lancé ni daté avant le
  `demarrage_prod` de son OF, aucun du bureau. ⚠️ L'ERP (`POST /of-trm/:id/observations`)
  peut pourtant en poster un sur un OF en file : l'onglet ne se cache **que** si l'OF n'est
  pas démarré **et** n'a aucun message.
- **La consigne se reconnaît partout au triangle rouge** (demande de Vincent, 2026-09-15) :
  segment « Consigne » de l'écran Consigne (`Segment ton="destructive"` — rouge plein une
  fois choisi, triangle rouge sinon), libellé de l'éditeur, titre de `ConsigneSheet`.
  ⚠️ **Le champ
  de saisie reste neutre** (§46.2) : on marque ce qui NOMME la consigne, jamais la zone où
  on la tape, qui se lirait comme une erreur de validation.

## Le bonnetier voit moins que le régleur (2026-09-22)

Quatre retraits demandés par Vincent le 2026-09-22, tous côté bonnetier, le régleur inchangé.
Le rôle est celui du téléphone enrôlé (identité fixe = régleur), comme partout.

- **Pas de « Lancement OF »** : `actionsFor()` (API, qui fait foi) et `actionsDisponibles()`
  (web, `actions.test.ts`) rendent `[]` à un bonnetier sur un OF non lancé — le legacy
  l'offrait aux deux builds, mais le lancement est la fin de la fiche de réglage, que seul
  un régleur lit. La bande dit « OF non lancé — en attente du régleur » (`SaisieBand.tsx`) ;
  l'API répond 409 `action_indisponible` à un ancien bundle qui l'enverrait quand même.
- **Le % de 2nd choix se voit dès 1 %, par les deux rôles** : il voyage **brut** sur
  `of.pct_defaut` de `GET /atelier/machines` (sans `?regleur=1`, `pctDefautDesOfs`, un
  `TOP 100` par couple), et la tuile est seule à décider (`SEUIL_PCT_DEFAUT = 0,01`,
  `ChoixMetier.tsx`). ⚠️ **La règle legacy « % remis à 0 sans alerte » est retirée** :
  un 1,5 % s'affiche désormais sans cloche, aussi chez le régleur. `alerteRegleur()` ne
  porte plus `pct_defaut` (le % est une entrée de l'alerte, pas une sortie) ; l'alerte
  (liseré rouge) reste `% > 2 % ou arrêts/pièce > 1`, régleur seul.
- **Pas d'Historique** (icône du coin de l'OF, `Poste.tsx`) — comme le legacy ; l'écran
  renvoie un bonnetier au poste s'il y arrive par un lien (`Historique.tsx`).
- **Pas d'onglet « Notes »** sur l'écran Consigne : un bonnetier garde les deux plans du
  legacy (consigne, messages) ; `avecNotes = regleur`, la requête `obs_ref_ecru` n'est même
  pas lancée, un `state.onglet = 'notes'` demandé est ignoré.

## L'OF actif — Consigne · Historique · Fils (2026-09-15)

Demande de Vincent du 2026-09-15, photos du téléphone Android de Nicolas à l'appui : sur un
OF en cours le téléphone doit offrir tout ce que le legacy offre — écrire ou effacer la
consigne, laisser un message sur l'OF, voir les pièces produites et les rouleaux visités,
savoir où est le fil de cet OF, du précédent et du suivant. Le poste porte donc **trois
entrées** (Consigne · Fils · Historique, plus Réglage pour un régleur sur un OF non lancé),
chacune un écran clé par le métier comme le reste.

- **Depuis le 2026-09-15 (après-midi) les trois sont des boutons icône SANS libellé**, en
  haut à droite de l'en-tête de l'OF (44 px, badge or = messages ; le libellé vit dans
  `title` / `aria-label`) — décision de Vincent : le régleur s'en sert tous les jours et
  apprend les icônes. La progression passe sous « réf · coloris » pour leur faire la place.
  Ordre : Consigne (consigne, notes, messages) · Fils · Historique — **Historique et
  l'onglet Notes sont au régleur seul depuis le 2026-09-22**. **Réglage reste une
  rangée `Lien` libellée** sous la consigne : conditionnelle, et elle mène au lancement.
  Le callout §46 de la consigne reste toujours affiché sur le poste quand il y en a une.
  L'icône Fils est la **bobine d'ETM** (`components/icons/BobineIcon.tsx`, miroir verbatim de
  `ETM/apps/web/src/components/icons/BobineIcon.tsx`, l'icône du menu Fils de l'ERP —
  améliorer là-bas et recopier), sur le bouton comme dans l'en-tête de `FilsOf.tsx` ; pas le
  `Cylinder` de lucide.

- **Consigne** (`Consigne.tsx`, déjà là depuis le 08/09) : le régleur écrit ou vide
  `ordre_fabrication.observations` (vide = effacée), les deux rôles lisent et postent dans
  le fil `message_of`, chacun supprime ses propres messages.
- **Historique** (`Historique.tsx`, port de `FEN_Historique` du build régleur) :
  `GET /atelier/of/:id/historique` rend les pièces (`piece_production` DESC) et les
  rouleaux (`stock_ecru`, `num_piece_OF` DESC) ; taper une pièce déplie ses événements
  (`GET /of/:id/pieces/:pieceId/evenements`, photo + prénom + libellé + date).
  - ⚠️ **« Pièce N° i » est une POSITION comptée à rebours depuis le nombre de lignes**,
    pas la colonne `numero` — c'est ce que le legacy affiche.
  - ⚠️ **La productivité est la formule du legacy, pas celle de l'ERP** :
    `durée mini = ref_ecru.poids / (20 tours/min × 10 / (trs_10kg_chute / nb_chutes))`,
    `% = durée mini / durée réelle`, rouge sous 70 %, **plafonné à 120 % et rouge
    au-dessus** (une pièce trop rapide est un horodatage faux). Pure et testée dans
    `ETM/apps/api/src/lib/historique-atelier-trm.ts` ; la couleur lit le ratio brut,
    pas le % arrondi (100/143 affiche 70 % rouge). Le poids est celui de `ref_ecru`
    comme le legacy (repli sur `poids_piece` de l'OF si la fiche n'en a pas) — un
    Android encore en service doit imprimer le même chiffre. Le `/of-trm/:id/production`
    de l'ERP garde son approximation par `vitesse` ; l'adopter là-bas est un chantier
    séparé. Sans fiche `ref_ecru_machine` : « — » partout, pas un mur de rouge (le
    legacy stocke 0 min et peint tout en rouge).
  - Régleur seul, comme le legacy — offert aux deux rôles du 2026-09-15 au 2026-09-22,
    puis repris au bonnetier par Vincent (le mur TRS lui montre déjà ces chiffres).
    La jointure interne du legacy sur `bonnetier` perdait les événements sans auteur ;
    ici ils restent, prénom vide.
- **Fils** (`FilsOf.tsx`, port de `FEN_Fils_OF`, les deux builds) :
  `GET /atelier/of/:id/fils` rend les lots réservés (`asso_fil_of` → `stock_fil`
  **non terminés**, un par lot distinct : fil, lot, stock, **emplacement** en gros, fournisseur,
  commentaire), la composition de la référence pour ce coloris (`composition_ecru`,
  « % · fil » + commentaire ⓘ) et les ids `precedent` / `suivant` ; les trois segments
  du legacy, un segment absent quand il n'y a pas de voisin ; un voisin affiché porte un
  badge « OF précédent / suivant » là où le legacy peignait le titre en rouge.
  - ⚠️ **L'OF précédent n'est pas le balayage de tout `evenement_piece` du legacy**
    (la plus grosse table, pour un id) : c'est l'OF du métier au dernier `arret_prod`
    parsable, TOP 20 par id — la même lecture que la fiche de réglage. Le suivant est
    `priorite + 1` non terminé sur le métier, verbatim.
  - ⚠️ `stock_fil.terminé` est accentué : `terminé AS termine` nommé sur Windows,
    `SELECT *` + `pickVal(/^termin/)` sur le pont Linux (patron de `stock-fil-trm.ts`).
    Un lot sans fournisseur est gardé (le legacy le perdait), nom vide.
  - Les voisins ne sont calculés que pour l'OF du métier ; le téléphone relit la même
    route avec l'id du voisin et ignore ses propres voisins, comme la fenêtre legacy.

## Le côté régleur (2026-09-08)

Le côté régleur s'est développé (2026-09-08) avec un bascule dev de l'Accueil (« dev · voir
la grille régleur »), livré en prod le 2026-09-14 pour voir les écrans sur le téléphone de
Nico. **Depuis le 2026-09-15 le bascule n'existe plus : le rôle vient du téléphone enrôlé**
(§ « Enrôlement des téléphones » plus bas — `identite.regleur` n'est vrai que pour l'identité
fixe d'un appareil, jamais pour un visage choisi sur la grille). **Et c'est l'API qui tient
la règle** : chaque écriture régleur vérifie `bonnetier.regleur = 1` sur l'`IDbonnetier`
nommé, en plus des contrôles de `gateSaisie` (appareil enrôlé, appareil autorisé à parler
pour ce bonnetier).

⚠️ **La spec du régleur n'est PAS `Android\dbg\Compile` (build bonnetier du 24/03/2026) mais
`Android\gen\Compile`** : `GWDPMPS.getNomConfiguration()` y renvoie `"Appli_Regleur"`, il
date du **2026-05-25** et il contient deux fenêtres absentes du build bonnetier,
`FEN_Reglage_Machine` et `FEN_Historique`. Les blocs `<COMPILE SI Configuration="Appli_Regleur">`
du build bonnetier sont **vides** (le code est retiré à la compilation) — c'est pour ça que
« Interrompre OF » n'y apparaissait pas. Lire `gen` pour tout ce qui touche au régleur.

Ce que le build régleur ajoute, et ce qui en est porté :

| Legacy (gen) | Porté | Où |
|---|---|---|
| Combo : « Interrompre OF » / « Relancer OF » — et **« Lancement OF », régleur seul depuis le 2026-09-22** (le legacy l'offrait aux deux builds) | oui (dès le 27/08) | `actionsFor()` / `actions.ts` |
| Choix Métier : icône d'état (réglage / pause / marche), fréquence d'arrêt, % 2nd choix, **alerte** ; Inactifs = métiers **sans OF** | oui — le % 2nd choix est **aux deux rôles** depuis le 2026-09-22 (`of.pct_defaut`, brut) | `GET /atelier/machines?regleur=1`, `lib/atelier-regleur-trm.ts` (pur, testé), `ChoixMetier.tsx` |
| Choix Métier : taper un OF non lancé → contrôle d'éligibilité → `FEN_Reglage_Machine` | oui | route `/metier/:id/reglage`, `GET /atelier/of/:id/reglage`, `ReglageMachine.tsx` |
| `FEN_Reglage_Machine` : repères par tour (LFA précédente / LFA / repère), réglages, fils, consigne, **« Lancer OF »** | oui — le lancement passe par l'événement `Lancement OF` existant (une seule voie d'écriture) | idem |
| `FEN_Consigne` plan 3 : le régleur **écrit** `ordre_fabrication.observations` | oui — **et depuis la fiche de réglage** (2026-09-15 : Modifier / Supprimer, `ConsigneSheet` ; une neuve par l'icône Consigne) | `PUT /atelier/of/:id/consigne`, `Consigne.tsx`, `ReglageMachine.tsx` |
| `FEN_Consigne` plan 2 : fil `message_of` (les deux rôles), suppression de **ses** messages | oui | `GET/POST/DELETE /atelier/of/:id/messages[/:msgId]` |
| Icône Historique → `FEN_Historique` (pièces, durée, productivité vs durée mini ; événements d'une pièce ; rouleaux visités) | oui (2026-09-15 ; régleur seul depuis le 2026-09-22) | `GET /atelier/of/:id/historique`, `/pieces/:pieceId/evenements`, `Historique.tsx` — voir « L'OF actif » |
| `MAJ_auto` (version par configuration), `notif_token` / push | non (sans objet / à venir) | — |

Les règles du legacy, verbatim dans l'en-tête de `lib/atelier-regleur-trm.ts` :
- **État** : pas de `demarrage_prod` → réglage ; `arret_prod` valide → pause ; sinon marche.
- **Le chiffre de la cloche n'est PAS la fréquence horaire du legacy — c'est le chiffre
  de la tablette TRS** (décision du 2026-09-14) : moyenne des arrêts **anormaux par pièce**
  sur les 3 dernières pièces terminées de l'OF, `arretsParPiece()` de `lib/trs-trm.ts`, lu
  par **`lib/arrets-par-piece-trm.ts`** (un seul lecteur + cache par OF, partagé avec
  `routes/trs.ts`). ⚠️ **Le legacy est bogué** : `FrequenceArret` divise 24 h d'arrêts par
  `DateHeureDifférence(dhDateRef, DateSys)` — `DateSys` est une DATE, l'intervalle court
  jusqu'à **minuit d'aujourd'hui** alors que les comptes vont jusqu'à maintenant. À 17 h 37
  la cloche est gonflée ×3,8 (les 4 / 4 / 2 / 3 / 6 de la photo du 14/09 se reproduisent
  tous ainsi), en soirée elle explose, un OF lancé le jour même n'a jamais de cloche. La
  fréquence horaire honnête vaut « 1 » partout et ne dit rien au régleur ; le « ≈ 4 par
  rouleau » qu'il a appris à lire est précisément le chiffre du mur. Ne pas réintroduire
  la formule horaire. `probe-atelier-regleur-trm.ts` (sur la prod, `node --env-file=.env
  --import tsx …`) imprime le chiffre de la tuile ET la cloche legacy bug compris, pour
  comparer à un téléphone Android encore en service.
- **% 2nd choix** = poids 2nd choix / poids total sur les rouleaux récents du couple
  (référence, coloris) — tous OF, tous métiers — `TOP 100`, arrêt au rouleau qui passe 1 000 kg.
- **Alerte** = `% > 2 % ou arrêts/pièce > 1` (le palier ambre de la tablette,
  `SEUIL_ARRETS_PIECE`). C'est l'état d'attention §41 de la liste (liseré rouge).
  ⚠️ Le « % remis à 0 sans alerte » du legacy (gardé jusqu'au 2026-09-21, avec la pastille
  **dès 1 %** sous cloche seulement) est **retiré le 2026-09-22** : le % voyage brut sur
  `of.pct_defaut` pour les deux rôles et la pastille rouge s'affiche dès 1 %, cloche ou
  non — voir « Le bonnetier voit moins que le régleur ». Le chiffre d'arrêts n'est jamais
  remis à 0 et **sa pastille porte la couleur de la tablette** (≤ 1 vert · ≤ 3 ambre · > 3
  rouge, `lib/teinte-arrets.ts`, test de parité qui importe `apps/trs/src/lib/affichage.ts`
  — décision 2026-09-14).
- Seuls l'état, l'éligibilité et le lecteur arrêts/pièce sont réservés à `?regleur=1` (le
  `TOP 100` par couple du % est payé par toute liste depuis le 2026-09-22) : (cache par OF, une
  lecture `piece_production` par appel) + un `TOP 100` par couple + une lecture
  `ref_ecru_machine` ; la liste bonnetier ne paie rien.

Écarts assumés de la fiche de réglage : la référence précédente est lue sur
`ordre_fabrication.IDref_ecru` (le legacy passe par la ligne de commande), `arret_prod <> ''`
n'est pas envoyé au driver (20 derniers OF du métier, premier `arret_prod` parsable) ; le
**compteur est celui du poste** (`compteurFor`, poids pièce de l'OF) là où la fiche legacy
divise `ref_ecru.poids` — le régleur qui règle et le bonnetier qui lit doivent voir le même
nombre. La consigne s'enregistre sur « Enregistrer », pas à chaque frappe comme le legacy.

Écrans : tous clés par le **métier** (`/metier/:id/consigne`, `/metier/:id/reglage`), le
métier décidant l'OF comme le poste. Le poste porte une rangée « Consigne · n messages »
(badge or) et, pour un régleur sur un OF non lancé, « Réglage ». `ConfirmSheet`,
`Segment`, `Pastille`, `Entete` et `lib/erreurs.ts` sont désormais partagés entre les écrans.

### La consigne se tient depuis la fiche de réglage + l'onglet « Notes » (2026-09-15)

Demande de Vincent sur la fiche de réglage (OF 3395 sur 1F) : le régleur doit pouvoir
**voir, modifier ou supprimer la consigne sans quitter la fiche**, et avoir **un accès à tout
l'historique des notes de l'OF**. Le legacy y arrivait par l'icône `IMG_Consigne` de
`FEN_Reglage_Machine` (→ `FEN_Consigne` plan 3, puis retour).

- **Le callout §46 reste le seul rendu de la consigne** ; sous lui, pour un régleur sur un OF
  non terminé, deux boutons de 44 px « Modifier » / « Supprimer ». Le fantôme « + Ajouter
  une consigne » d'un OF sans consigne est **retiré le 2026-09-15** (demande de Vincent) :
  une consigne neuve s'écrit par l'icône Consigne du coin de la fiche. L'éditeur est un **bottom sheet** (`components/of/
  ConsigneSheet.tsx`) — champ neutre, commit or de 64 px, échec en ligne. **Supprimer =
  écrire la chaîne vide** derrière un `ConfirmSheet` destructif : c'est le même
  `PUT /atelier/of/:id/consigne`, pas une route de plus. La mutation et ses invalidations
  (OF, réglage, liste des métiers) vivent une fois dans **`lib/consigne.ts`**
  (`useEcrireConsigne`), partagée avec l'éditeur plein écran de `Consigne.tsx`.
- **« Notes »** (rangée `Lien`, compteur « n notes · n messages » — pas « Historique », ce mot est l'écran pièces/visitage du poste) ouvre l'écran Consigne
  sur un **troisième segment « Notes », régleur seul depuis le 2026-09-22** : les observations durables de la référence
  (`obs_ref_ecru`, les « Commentaires historiques » de l'ERP, filtrées par le métier et le
  coloris de l'OF), **lues sur la route de l'ERP** `GET /of-trm/:id/observations-ref`
  (lecture ouverte, même prédicat legacy — pas de second lecteur). Lecture seule : elles
  s'écrivent au bureau. Même habillage or que `ObsRefEcru.tsx` (`NoteRefCarte.tsx`), pour
  la raison du 2026-08-27 (même objet, mêmes habits). Le segment « Messages » est le fil
  `message_of` déjà porté. L'écran accepte `state.onglet` pour atterrir sur un segment.
- `Lien` est sorti de `Poste.tsx` vers `components/atelier/Lien.tsx` ; `lib/dates.ts`
  (`formatDateHfsql`, testé) découpe le `YYYYMMDD` HFSQL sans passer par `new Date()`.
- ⚠️ **`index.html` porte désormais `interactive-widget=resizes-content`** : sans lui,
  Chrome Android laisse la mise en page sous le clavier et un sheet `fixed` en bas de
  l'écran se retrouve **derrière** le clavier pendant la frappe. Cela vaut pour toute
  l'app (le `100dvh` de `#root` rétrécit avec le clavier).
- Non fait : l'historique `FEN_Historique` (pièces, durées, productivité) reste non porté ;
  la consigne n'a **pas d'historique de versions** (une colonne, écrasée à chaque écriture).

## Enrôlement des téléphones — l'identité de l'app (2026-09-15)

Le legacy identifiait le régleur par son téléphone (`NomAppareil()` = l'ANDROID_ID, contre
une liste codée « Terminal Nico » / « Terminal Mickaël »). Le web ne lit aucun identifiant
matériel : **l'identité d'un téléphone est un secret émis par le serveur**, posé une fois,
dans son propre cookie. Conception : plan §3.2–3.4 ; décision de Vincent du 2026-09-15
(« les téléphones régleur toujours connectés comme eux-mêmes, toujours l'interface régleur »).

- **Une ligne par téléphone** (`ETM/apps/api/src/lib/appareils-atelier.ts`, store
  `data/appareils-atelier.json`) : `IDutilisateur` (le compte sous lequel il agit ; être
  enrôlé suffit pour écrire, aucun droit à accorder sur ce compte), `IDbonnetier`
  (**identité fixe** = téléphone de régleur, `null` = téléphone
  partagé), `libelle` (écrit dans `evenement_piece.appareil`, là où le legacy mettait le
  nom du terminal), `creeLe`, `creePar`, `vuLe`.
- **Cookie `mps_appareil`** = `<id>.<secret>` ; seul `sha256(secret)` est stocké ; **révoquer
  = supprimer la ligne**, le cookie copié meurt sans toucher `AUTH_COOKIE_SECRET`. `Secure`
  en prod seulement (`appareilCookieOptions`). `attachUser()` le résout (`req.appareil`) et
  ne pose `req.userId` que si aucun `mps_uid` valide n'est là.
- **Le store n'est pas celui de `permissions-trm.ts`** : relecture si le mtime a bougé,
  écritures sérialisées (le patron cache-au-chargement a déjà perdu 10 droits `edit_of`).
- **Enrôlement** : Paramètres › Utilisateurs › onglet **Appareils** (`components/settings/
  AppareilsAtelier.tsx`) — « Enrôler un téléphone » (libellé + identité : un régleur actif
  ou « téléphone partagé »), code à **6 chiffres, 10 min, usage unique, en mémoire** (un
  redémarrage de l'API les efface) ; sur le téléphone, « Enrôler ce téléphone » sous la
  grille (`EnrolementSheet`) → `POST /atelier/appareils/enroler` → cookie. Frein brute force :
  10 échecs / client / 15 min → 429. Routes admin (`requireAdmin`) : `GET /`, `POST /codes`,
  `DELETE /codes/:code`, `PATCH /:id`, `DELETE /:id` ; téléphone : `GET /moi`, `POST /enroler`,
  `GET /enrolement-en-attente`.
- **Le lien « Enrôler ce téléphone » n'apparaît que pendant qu'un code est en attente**
  (2026-09-15) : `GET /enrolement-en-attente` → `{ enAttente }` (`codeEnAttente()`), public,
  **un booléen seulement** — jamais le code, le libellé ni le régleur. L'Accueil l'interroge
  sur le poll de 10 s tant que le téléphone n'est pas enrôlé ; tous les téléphones non enrôlés
  voient le lien en même temps (un téléphone sans cookie n'a pas d'identité à cibler), c'est
  le code qui choisit. ⚠️ **Échec = lien affiché** (API pas encore déployée → 404, réseau) :
  le masquer sur une erreur fermerait la seule porte d'entrée. Une feuille ouverte reste
  ouverte si le code expire dessous. Déploiement : `/etm_deploy` avant l'atelier, sinon le
  lien reste visible en permanence (repli) — pas de panne.
  Monté **avant** `/api/atelier`.
- **`gateSaisie` (toute écriture de `routes/atelier.ts`) refuse dans l'ordre** :
  `appareil_non_enrole` (401 sans cookie, 403 avec un simple `mps_uid` — `POST /auth/login`
  n'authentifie rien, un curl pouvait agir pour n'importe qui), bonnetier inconnu,
  `identite_appareil` (un téléphone fixe n'écrit que
  pour son régleur), `regleur_hors_appareil` (un téléphone partagé n'écrit jamais pour un
  régleur — la règle du plan §3.3, en API et pas seulement en UX).
- **Côté PWA** (`BonnetierContext`) : `GET /atelier/appareils/moi` au démarrage puis au poll
  (une révocation ramène la grille en ≤ 10 s), réponse miroir dans `localStorage`
  (`atelier.appareil`) pour un lancement hors ligne, `Attente` (logo seul) tant qu'un
  téléphone neuf n'a pas de première réponse. Identité fixe → `identite` dérivée de
  l'appareil, `fixe = true`, pas de « Quitter » (`PosteHeader`), jamais l'Accueil. Grille =
  `?regleur=0` seulement ; une identité choisie est toujours `regleur: false` (une entrée
  écrite par l'ancien bascule est rétrogradée à la lecture). Pied de l'Accueil : le libellé
  du téléphone (+ « consultation seule » si son compte ne peut pas écrire), ou le lien
  d'enrôlement.
- **Comptes** : régleurs sous leurs comptes personnels (Nicolas 11 ↔ bonnetier 16, Mickaël
  21 ↔ 15), téléphones partagés sous `Regleur` (14, `pc-regleur`, le compte de l'app Android
  legacy — ajouté à `TRM_STAFF` pour cela). Le dialogue présélectionne le régleur homonyme du
  compte.
- ⚠️ **`scripts/check-api-routes.mjs` ne détecte pas un sous-routeur manquant** : il sonde
  les racines de montage et `/api/atelier` répond déjà en prod. Ordre : `/etm_deploy` avant
  `/trm_deploy`, sans exception.
- **« dev · Régleur login » (2026-09-15, serveur de dev seulement)** : bouton en pied de
  l'Accueil → `components/atelier/RegleurDevSheet.tsx` (liste `?regleur=1`) → identité choisie
  avec `regleur: true`, non fixe (« Quitter » ramène à la grille). `BonnetierContext` n'accepte
  et ne relit `regleur: true` que sous `import.meta.env.DEV` : le bouton et la feuille sont
  absents du bundle prod (vérifié par grep de `dist/`). ⚠️ **Navigation seule** — `gateSaisie`
  refuse toujours les écritures (`appareil_non_enrole`) ; pour écrire en dev, enrôler le
  navigateur comme un téléphone de régleur. Pas de contournement côté API.
- Non fait : WebAuthn (plan §3.5, v2), renommage depuis l'UI (la route `PATCH` existe),
  `FEN_Historique`.

**Les trois pièges du portage**, tous vérifiés et tous invisibles dans le code seul :
- **Le libellé n'est pas la chaîne stockée.** La combo dit « Fin de pièce » et écrit
  `Fin du tricotage` ; « Interrompre OF » écrit `Interruption OF`. Tout l'historique de
  `evenement_piece` est clé là-dessus.
- **« Interrompre OF » et « Relancer OF » sont une paire choisie à l'exécution** selon
  `arret_prod`, les deux littéraux étant compilés. Le Java de mars ne montre que le second.
- **La liste des actions offertes est recalculée au serveur** : le client décide de ce
  qu'il affiche, la route décide de ce qui peut arriver (409 sinon). Les deux dérivations
  vivent dans `apps/atelier/src/lib/actions.ts` et `ETM/apps/api/src/routes/atelier.ts` —
  **les changer ensemble**, l'API faisant foi.

- **Une seule app pour les deux rôles** (le régleur est un bonnetier avec plus de droits :
  c'est déjà ce qu'exprime `permissions-trm.json`). Le legacy fait pareil — un seul projet,
  des configurations `Appli_Bonnetier` / `Appli_Regleur` — et **l'écart de rôle y tient en
  UNE entrée de combo**, à retenir avant de sur-concevoir les pouvoirs du régleur.
- **API** : `ETM/apps/api/src/routes/atelier.ts`, monté `/api/atelier`. Lecture seule.
  Réutilise `lib/production-trm.ts` (`selectMachines`, `selectBonnetiers`, `loadOf`,
  `parseDtMs`) — améliorer ce fichier, ne jamais en forker une copie.
- **Version propre** (`apps/atelier/package.json`, démarrée à 0.0.1), **pas** celle de la
  racine comme `apps/web` : les deux bundles se déploient indépendamment. **Affichée depuis
  le 2026-09-15** (demande de Vincent), discrètement, « Version X » comme le menu profil de
  l'ERP : sous la ligne du téléphone de l'Accueil, et sur une **fine barre blanche** en pied
  de l'écran Métiers (un `<footer>` de la colonne flex, qui porte aussi
  `safe-area-inset-bottom`) — ⚠️ plus jamais en `fixed` : épinglée par-dessus la liste,
  elle recouvrait les tuiles (retour de Vincent, 2026-09-15). Rendue, elle est désormais
  vérifiée dans le bundle servi par `deploy-web.mjs`.
- **Plein écran** (`display: 'fullscreen'` dans le manifeste, 2026-09-15) : la barre d'état
  du téléphone (heure, réseau, batterie) est masquée dans l'app installée, un glissement
  depuis le bord la ramène. ⚠️ Un téléphone déjà installé ne voit le changement qu'au
  rafraîchissement de sa WebAPK par Chrome (jusqu'à un jour) — **réinstaller** pour
  l'avoir tout de suite. ⚠️ **L'espace au-dessus d'un en-tête passe par `.safe-top`
  (`index.css`), jamais un `env(safe-area-inset-top)` en ligne** : en `fullscreen`, Chrome
  Android continue de rapporter la hauteur de la barre masquée comme inset, ce qui laissait
  une bande navy vide au-dessus de l'en-tête (photo de Vincent, 2026-09-15). La classe met
  l'espace à zéro sous `@media (display-mode: fullscreen)` et le garde dans un onglet ou en
  `standalone`. Écart assumé : un téléphone à caméra poinçonnée dans l'écran aurait le titre
  sous l'objectif — le parc actuel a la caméra dans la bordure.
- ⚠️ **Installer sur un Android Go (Ulefone Armor X12) : changer d'écran d'accueil d'abord**
  (2026-09-15). L'Armor X12 tourne sous Android 13 **Go** (`ro.config.low_ram=true`) avec
  le launcher `Launcher3QuickStepGo`, qui **n'accepte aucune icône épinglée** : rien ne
  répond à `CONFIRM_PIN_SHORTCUT` (`adb shell cmd package query-activities --brief -a
  android.content.pm.action.CONFIRM_PIN_SHORTCUT` → « No activities found »). Chrome retire
  alors « Installer l'application » **et** « Ajouter à l'écran d'accueil » de son menu, Edge
  grise « Ajouter au téléphone » — alors que le site est installable (Chrome bureau tire
  `beforeinstallprompt`). **Remède vérifié** : installer **Lawnchair** (`app.lawnchair.play`)
  depuis le Play Store, le mettre en écran d'accueil par défaut, relancer Chrome → « Installer
  et créer un raccourci » → vraie WebAPK (`org.chromium.webapk.*`, `displayMode fullscreen`),
  ouverte plein écran. Le parc est en navigation à trois boutons (`navigation_mode=0`), un
  launcher tiers n'y casse rien. ⚠️ **Pas de TWA / APK « app Chrome »** : Chrome vérifie
  `assetlinks.json` via `digitalassetlinks.googleapis.com`, et `atelier.intra.etsmalterre.com`
  résout en public vers l'IP privée `10.10.20.5` — Google répond « DNS name not found », la
  TWA garderait la barre d'adresse. La WebAPK partage le bocal à cookies de Chrome : un
  téléphone enrôlé dans Chrome l'est aussi dans l'app.
- **Service worker `injectManifest`** (`src/sw.ts`), pas le `generateSW` d'`apps/web` :
  c'est le seul endroit où un handler `push` peut vivre, et basculer après coup toucherait
  le chemin de mise à jour déjà corrigé une fois (`lib/sw-refresh.ts`). Éteint en dev.
- **Design** : `mps_designer` §45 « Poste », à l'échelle du téléphone — l'écran Action
  Machine remplit les trois tests du §45.1. **Pas un cinquième layout.** Le legacy est
  or-sur-crème ; on est navy + or comme toutes les apps Malterre (décision du 2026-08-27).
- ⚠️ **Le libellé d'un métier est `machine.emplacement`, l'INVERSE d'Atelier › Maintenance**
  (qui prend `nom`). Les 4 métiers à `emplacement` vide sont **archivés** et n'arrivent
  jamais ici : les 30 métiers vivants en portent tous un. Et deux ont un `nom` qui est une
  marque, pas une position (« Beck » = 1G, « Orizio » = 1H) — un bonnetier envoyé au 1G ne
  reconnaîtrait pas une tuile « Orizio ». Vérifié en base le 2026-08-27.
- ⚠️ **Le legacy Android n'est PAS PCS-compressé** : `C:\Mes Projets\MPS\Android\dbg\Compile\`
  contient les 45 fichiers Java générés, WLanguage en commentaires et SQL en clair. C'est la
  spec, sans sonde — la première chose à ouvrir (`GWDCPCOL_Appli.java` d'abord).
  **MAIS c'est un instantané du 24/03/2026 du build BONNETIER** : son `info.build` liste 12
  fenêtres et l'app qui tourne en a au moins une de plus. La « 4ᵉ icône ronde » et les
  fenêtres manquantes sont dans **`Android\gen\Compile\`, le build régleur** (25/05/2026,
  `FEN_Reglage_Machine`, `FEN_Historique`) — voir « Le côté régleur » plus haut. Autorité sur
  ce qu'ils contiennent, pas sur l'inventaire.
- ⚠️ **`bonnetier` n'a pas de colonne `IDutilisateur`** alors que les droits sont clés
  dessus. Décision du 2026-08-27 : le lien sera un **store JSON côté API**
  (`data/bonnetier-utilisateur.json`, à côté de `permissions-trm.json`), **pas un
  ALTER TABLE** — la table appartient à WinDev, le `.xdd` en est l'autorité, et ~15 lignes
  à mapper ne valent pas une modification de schéma partagée difficile à annuler.
- ⚠️ **`signUserId()` rend la même chaîne pour toujours, sur tout appareil** — c'est pourquoi
  le téléphone ne porte PAS `mps_uid` mais son propre cookie révocable (§ « Enrôlement des
  téléphones »). Ne jamais faire dépendre une écriture atelier d'un simple `mps_uid`.
- ⚠️ **`atelier.intra.etsmalterre.com` a son PROPRE bocal à cookies** : `res.cookie()` ne pose pas de
  `domain`, donc la session de `trm.intra.etsmalterre.com` ne suit pas. Bonne isolation, mais l'app porte
  son propre chemin d'identification depuis le premier jour.
- **L'identité bonnetier n'est PAS une authentification** : grille de visages +
  `localStorage`, exactement le modèle de confiance du legacy (`SauveParamètre`) et du poste
  de visitage (§45.4). Le garde-fou réel est l'enrôlement du téléphone (§ ci-dessus) : la
  grille n'offre que des bonnetiers, et l'API n'accepte un régleur que depuis son appareil.
- ⚠️ **`#root` est verrouillé à `100dvh` + `overflow: hidden` (`index.css`) : chaque écran
  porte SON conteneur de défilement** (`flex-1 min-h-0 overflow-y-auto`). L'Accueil ne
  l'avait pas : sur le téléphone de Nicolas (≈ 360×720) le 5ᵉ visage était coupé et rien
  en dessous — 6ᵉ bonnetier, lien régleur — n'était atteignable (2026-09-14). Corrigé, et
  la grille est calibrée pour **six visages + le lien sans défiler** à cette taille
  (logo `h-12`, photo 96 px, `gap-y-3`).
- **La barre poste (`PosteHeader.tsx`, décisions du 2026-09-14)** : à gauche le « M »
  Malterre (`public/logo-m.png`, le badge or des emails `malterre_email_report` **détouré**
  de sa tuile, précaché dans `includeAssets`), jamais une lettre typographique ; **pas de
  séparateurs** entre les cellules ; **les deux cellules font 64 px** pour que le titre soit
  centré sur l'écran ; à droite **le visage seul** (40 px, sans prénom — le nom reste dans
  l'`aria-label` et la feuille « Quitter votre poste »). ⚠️ **Rien ne parle de pointage** :
  le legacy imprimait « Pointage » + la date dans la feuille de sortie, retiré parce que le
  pointage a sa propre tablette dédiée.
- **Dev** : `cd apps/atelier && VITE_API_URL=http://localhost:808N/api pnpm exec vite --port 5176`
  (5176 est déjà dans le `CORS_ORIGIN` de l'API ; 5175 reste à l'ERP). `host: true` est
  activé pour qu'un vrai téléphone du parc puisse taper le serveur de dev sur le LAN.

