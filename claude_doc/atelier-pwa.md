# Atelier — la PWA mobile de l'atelier (`apps/atelier`)

> Dossier de fonctionnalité, sorti de `CLAUDE.md` le 2026-09-02 (le fichier dépassait la limite de 150 k caractères). Contenu repris tel quel ; `CLAUDE.md` n'en garde que le résumé et les pièges majeurs. **Le mettre à jour ici**, pas dans `CLAUDE.md`.

## Atelier — la PWA mobile de l'atelier (`apps/atelier`)

Migration de l'app Android legacy des bonnetiers/régleurs. **Deuxième app du monorepo**,
hôte **`atelier.intra.etsmalterre.com`**, parc Android. Dossier de conception :
**`~/.claude/plans/atelier-malterre.md`** — décisions, pièges vérifiés, questions ouvertes.

**État au 2026-08-27** : Accueil (grille de visages) → Choix Métier (Actives / Inactives) →
Poste, **saisie comprise**. Les huit actions du legacy s'enregistrent (`POST
/api/atelier/of/:id/evenement`), sous le droit `saisie_atelier`.

**Ce qui manque encore, dans l'ordre où ça compte :**
- ⚠️ **Pas d'annulation**, alors que le legacy en a une (`IMG_Annuler` sur la dernière
  action). Une mauvaise « Terminer OF » n'est donc pas rattrapable depuis le téléphone :
  elle ferme la pièce, arrête l'OF et **le termine** (`terminerOf()` de
  `lib/of-queue-trm.ts` — `est_termine = 1`, re-rang, activation du suivant s'il a
  « Activation auto » : la même voie que le bouton de l'ERP). Jusqu'au 2026-09-07 elle
  reproduisait l'`AutoActivation()` legacy, qui ne bascule qu'`est_actif` (LIVA #1128).
- ⚠️ **Aucun téléphone ne peut écrire aujourd'hui** : le compte-poste n'existe pas et
  personne ne détient `saisie_atelier` (fermé par défaut). Voir « Identité » plus bas.
- Les trois écrans secondaires : Consigne (`message_of` + la consigne du régleur),
  Fils OF, Information (la checklist de nettoyage, littéraux récupérés verbatim).
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
  - `SaisieBand` laisse tomber une action choisie que l'OF rafraîchi **ne propose plus**
    (et ferme la feuille de confirmation) avec la raison en ligne, plutôt que de l'envoyer
    pour que le serveur la refuse. `actions` est mémoïsé sur l'objet OF, que React Query
    garde stable tant que la charge utile ne change pas : la garde ne tire que sur un vrai
    changement.
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

## Le côté régleur (2026-09-08)

**Décision du 2026-09-08 : le côté régleur se développe avec le bascule dev de l'Accueil
(« dev · voir la grille régleur ») ; la couche de sécurité (enrôlement
d'appareil, charge du cookie avec `deviceId`, refus des comptes privilégiés au login) se
construit au moment de déployer.** ⚠️ **Depuis le 2026-09-14 le bascule est LIVRÉ en prod**
(il était compilé hors prod, `import.meta.env.DEV`) : Vincent veut voir les écrans régleur
sur `atelier.intra.etsmalterre.com` pendant qu'ils se construisent. Il reste discret (lien
gris sous la grille) et sans danger tant que l'API tient la règle ci-dessous et que
`saisie_atelier` n'est accordé à personne — **à retirer le jour où l'enrôlement arrive**,
jamais à promouvoir en réglage utilisateur. Le rôle vient donc de `identite.regleur` (auto-déclaré),
et **c'est l'API qui tient la règle** : chaque écriture régleur vérifie `bonnetier.regleur = 1`
sur l'`IDbonnetier` nommé, en plus du droit `saisie_atelier` du cookie.

⚠️ **La spec du régleur n'est PAS `Android\dbg\Compile` (build bonnetier du 24/03/2026) mais
`Android\gen\Compile`** : `GWDPMPS.getNomConfiguration()` y renvoie `"Appli_Regleur"`, il
date du **2026-05-25** et il contient deux fenêtres absentes du build bonnetier,
`FEN_Reglage_Machine` et `FEN_Historique`. Les blocs `<COMPILE SI Configuration="Appli_Regleur">`
du build bonnetier sont **vides** (le code est retiré à la compilation) — c'est pour ça que
« Interrompre OF » n'y apparaissait pas. Lire `gen` pour tout ce qui touche au régleur.

Ce que le build régleur ajoute, et ce qui en est porté :

| Legacy (gen) | Porté | Où |
|---|---|---|
| Combo : « Interrompre OF » / « Relancer OF » | oui (dès le 27/08) | `actionsFor()` / `actions.ts` |
| Choix Métier : icône d'état (réglage / pause / marche), fréquence d'arrêt, % 2nd choix, **alerte** ; Inactives = métiers **sans OF** | oui | `GET /atelier/machines?regleur=1`, `lib/atelier-regleur-trm.ts` (pur, testé), `ChoixMetier.tsx` |
| Choix Métier : taper un OF non lancé → contrôle d'éligibilité → `FEN_Reglage_Machine` | oui | route `/metier/:id/reglage`, `GET /atelier/of/:id/reglage`, `ReglageMachine.tsx` |
| `FEN_Reglage_Machine` : repères par tour (LFA précédente / LFA / repère), réglages, fils, consigne, **« Lancer OF »** | oui — le lancement passe par l'événement `Lancement OF` existant (une seule voie d'écriture) | idem |
| `FEN_Consigne` plan 3 : le régleur **écrit** `ordre_fabrication.observations` | oui — **et depuis la fiche de réglage** (2026-09-15 : Modifier / Supprimer / Ajouter, `ConsigneSheet`) | `PUT /atelier/of/:id/consigne`, `Consigne.tsx`, `ReglageMachine.tsx` |
| `FEN_Consigne` plan 2 : fil `message_of` (les deux rôles), suppression de **ses** messages | oui | `GET/POST/DELETE /atelier/of/:id/messages[/:msgId]` |
| Icône Historique → `FEN_Historique` (pièces, durée, productivité vs durée mini ; événements d'une pièce ; rouleaux visités) | **non porté** | — |
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
  `SEUIL_ARRETS_PIECE`) ; le % est **remis à 0** sans alerte, comme la tuile legacy — donc
  un 1,2 % ne s'affiche que sous une cloche allumée par les arrêts, jamais seul — et
  **jamais sous 1 %** (`SEUIL_PCT_DEFAUT`, 2026-09-14). Le chiffre d'arrêts n'est jamais
  remis à 0 et **sa pastille porte la couleur de la tablette** (≤ 1 vert · ≤ 3 ambre · > 3
  rouge, `lib/teinte-arrets.ts`, test de parité qui importe `apps/trs/src/lib/affichage.ts`
  — décision 2026-09-14). C'est l'état d'attention §41 de la liste (liseré rouge).
- Le calcul n'est fait que sur `?regleur=1` : le lecteur arrêts/pièce (cache par OF, une
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
`Segment` et `lib/erreurs.ts` sont désormais partagés entre les écrans.

### La consigne se tient depuis la fiche de réglage + l'onglet « Notes » (2026-09-15)

Demande de Vincent sur la fiche de réglage (OF 3395 sur 1F) : le régleur doit pouvoir
**voir, modifier ou supprimer la consigne sans quitter la fiche**, et avoir **un accès à tout
l'historique des notes de l'OF**. Le legacy y arrivait par l'icône `IMG_Consigne` de
`FEN_Reglage_Machine` (→ `FEN_Consigne` plan 3, puis retour).

- **Le callout §46 reste le seul rendu de la consigne** ; sous lui, pour un régleur sur un OF
  non terminé, deux boutons de 44 px « Modifier » / « Supprimer » (ou le fantôme « + Ajouter
  une consigne » quand il n'y en a pas). L'éditeur est un **bottom sheet** (`components/of/
  ConsigneSheet.tsx`) — champ neutre, commit or de 64 px, échec en ligne. **Supprimer =
  écrire la chaîne vide** derrière un `ConfirmSheet` destructif : c'est le même
  `PUT /atelier/of/:id/consigne`, pas une route de plus. La mutation et ses invalidations
  (OF, réglage, liste des métiers) vivent une fois dans **`lib/consigne.ts`**
  (`useEcrireConsigne`), partagée avec l'éditeur plein écran de `Consigne.tsx`.
- **« Historique »** (rangée `Lien`, compteur « n notes · n messages ») ouvre l'écran Consigne
  sur un **troisième segment « Notes »** : les observations durables de la référence
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

**Identité — le point à trancher avant la mise en service.** Le téléphone porte le cookie
d'un **compte-poste** (le modèle du PC de visitage, `Visitage` IDutilisateur 10), et *qui*
travaille voyage dans `IDbonnetier`, comme le legacy l'écrit. La grille de visages +
`localStorage` n'est **pas** une authentification : c'est le modèle de confiance de
l'atelier, et il ne garde rien. Reste donc à faire : créer ou choisir le compte-poste, lui
accorder `saisie_atelier` dans Paramètres › Utilisateurs, et poser son cookie sur chaque
appareil.

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
  racine comme `apps/web` : les deux bundles se déploient indépendamment.
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
- ⚠️ **`signUserId()` rend la même chaîne pour toujours, sur tout appareil** — donc un cookie
  de compte privilégié serait copiable et irrévocable. La charge doit porter un `deviceId`
  avant qu'un compte régleur existe. `cookieOptions()` est aussi `secure: false` : à épingler
  sur `Secure` pour ce hôte le jour où le cookie porte un privilège.
- ⚠️ **`atelier.intra.etsmalterre.com` a son PROPRE bocal à cookies** : `res.cookie()` ne pose pas de
  `domain`, donc la session de `trm.intra.etsmalterre.com` ne suit pas. Bonne isolation, mais l'app porte
  son propre chemin d'identification depuis le premier jour.
- **L'identité bonnetier n'est PAS une authentification** : grille de visages +
  `localStorage`, exactement le modèle de confiance du legacy (`SauveParamètre`) et du poste
  de visitage (§45.4). Le garde-fou réel viendra de l'enrôlement d'appareil côté régleur.
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

