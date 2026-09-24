# Pointage — la tablette pointeuse (`apps/pointage`)

Remplace la pointeuse WinDev (`C:\Mes Projets\Pointage\`, exe Windows sur un PC) par une
PWA sur **une tablette murale partagée et enrôlée**. Quatrième app du monorepo, port dev
**5178**, hôte prévu **`pointage.intra.etsmalterre.com`** (pas encore en ligne), version
propre (`apps/pointage/package.json`, 0.0.1). Conception d'ensemble et décisions de
Vincent : `~/.claude/plans/pointage-pwa.md`. Commencé le 2026-09-15.

## Les données — une AUTRE base HFSQL

La pointeuse vit dans la base **`pointage`** (même serveur et identifiants que `mps`), pas
dans `mps`. L'API y accède par **`pointageDb`** (`ETM/apps/api/src/lib/hfsql-pointage.ts`),
chaîne = la principale avec `Database=pointage` (ou `HFSQL_POINTAGE_CONNECTION_STRING`).
⚠️ Le `mps` de dev contient de vieux `lst_horaire` / `lst_salarie` / `hors_prod` /
`pointage` : toujours `pointageDb`. Base de dev : `node --import tsx
src/scripts/copy-pointage-prod-to-dev.ts --write` depuis `ETM/apps/api` (SELECT seuls sur la
prod, `--replace` pour reconstruire). Détails pilote : `ETM/claude_doc/hfsql_odbc.md`
§ « A second database ».

| Table | Rôle |
|---|---|
| `lst_salarie` | la grille (`is_deleted = 0` : 7 salariés en septembre 2026) ; `id_mps` → `mps.bonnetier` (photo, journal TRS). Lier un salarié : `scripts/link-salarie-bonnetier.ts --salarie N --bonnetier M [--write]` (MARIE BOURSIER 46 → 30 fait sur dev et prod le 2026-09-15) |
| `lst_horaire` | **la vérité** : une ligne par poste, six heures en **epoch secondes UTC**, 0 = vide ; seule table d'Admin Pointage |
| `lst_pointage` | jumelle DATETIME (heure de Paris, NULL = vide), lue par TricoBot |
| `mps.pointage` | journal `en_poste` 1/0 lu par les TRS, écrit seulement si `id_mps > 0` |
| `lst_message` | messages au salarié (`date_fin >= aujourd'hui`), HTML → texte côté API |

## L'API — `/api/pointage` (`ETM/apps/api/src/routes/pointage.ts`)

- **Enrôlement** : même store que les téléphones (`lib/appareils-atelier.ts`), appareil de
  **type `pointeuse`** ; code émis par un admin (Paramètres › Utilisateurs › Appareils ›
  « Enrôler une pointeuse », `POST /atelier/appareils/codes {type:'pointeuse'}`) ; la tablette
  le saisit sur `POST /pointage/appareil/enroler`. ⚠️ **Cookie propre `mps_pointeuse`**, pas
  `mps_appareil` : sur `localhost` les cookies ignorent le port, enrôler la tablette en dev
  remplacerait celui du téléphone d'atelier. Un code n'enrôle que son type ; `gateSaisie`
  (atelier) refuse une pointeuse.
- **Lectures** (tablette enrôlée ou admin) : `/en-poste`, `/salaries`, `/salaries/:id/photo`,
  `/salaries/:id/etat`. **Écritures** (tablette seulement) : `POST /salaries/:id/pointage
  { action, ligneId }`.
- **Les boutons sont calculés au serveur** (`lib/pointage-etat.ts`, port de
  FEN_PointageSalarié, testé) : Début du travail → Début de la pause / Fin du travail → Fin
  de la pause / Fin de la pause et fin du travail → (2ᵉ pause) → Fin du travail. La tablette
  affiche `actions` telles quelles et renvoie la `ligneId` affichée : écran périmé ou double
  tap → **409 `etat_change`** avec l'état frais.
- ⚠️ **Poste ouvert depuis plus de 14 h = non continué** (décision de Vincent) : avertissement
  « poste du … non fermé » + « Commencer aujourd'hui » (nouvelle ligne, l'ancienne reste à
  Admin Pointage). Une nuit 21 h → 5 h reste continuée.
- **Un seul écrivain** (`lib/pointage-ecritures.ts`) : `lst_horaire` → jumelle `lst_pointage`
  retrouvée par `debut` ±2 s (jamais `fin = 0`, le bug du legacy qui décalait d'une ligne
  depuis déc. 2025) → `mps.pointage`. Heure du **serveur**, Paris explicite. INSERT
  positionnel + MAX+1 sous verrou. Garde : `scripts/check-pointage.ts` (cycle complet sur
  la copie de dev, nettoie).

## La tablette

- **Paysage, plein écran.** Garde d'enrôlement (`contexts/AppareilContext.tsx`, miroir
  localStorage) : non enrôlée → logo + horloge + « Enrôler cette pointeuse » **seulement si
  un code attend** (et sur erreur : fail-open, patron de l'atelier).
- **Accueil** : horloge en bandeau navy ; à gauche les visages (anneau vert « Au travail »,
  ambre « En pause ») — **toucher sa photo, c'est pointer** : le bouton « Pointage » +
  FEN_Choix_salarié du legacy disparaissent (7 salariés tiennent sur l'accueil) ; à droite
  la table **« En poste »** = TABLE_Pointage du legacy (requête donnée par Vincent le
  2026-09-15) : **toutes les lignes ouvertes** (`fin = 0 AND is_deleted = 0`, quel que soit
  le jour, salariés supprimés compris) ; ⚠️ le
  cumul ne compte **que les pauses terminées** (`ROUND(secondes / 60)`, `cumulPausesMin`),
  **pas de colonne Départ** (une ligne fermée quitte la table). Arrivée d'un autre jour =
  date dans le libellé ; poste de plus de 14 h = carte **rouge** « Non fermé » (le legacy la
  listait sans rien dire). Plus récente arrivée en haut. **Rendu (2026-09-21, itéré avec
  Vincent)** : mêmes règles que les visages — petit titre « En poste · N salariés », **cartes
  posées sur le fond de page**, sans panneau ni en-têtes de colonnes ; **sans photo** (elle
  doublait la tuile de gauche) ; deux lignes par carte, toujours la même hauteur (nom, puis
  Arrivée · Pauses · Cumul des pauses libellés, `Stat`) ; état porté par la carte : liseré
  §41 vert au travail, **carte ambre** en pause, **carte rouge** non fermée ; puces de pause
  côte à côte, la pause en cours en ambre. Ne pas réintroduire la photo, la pastille « Au
  travail / En pause » ni les en-têtes de colonnes (essayés, retirés).
- **Plein écran** : `display: fullscreen` au manifeste **et** `lib/plein-ecran.ts` — sur écran
  tactile le premier tap demande `requestFullscreen` (redemandé après rechargement ou geste
  retour), no-op en WebAPK et à la souris. ⚠️ **Chrome ne fabrique pas de WebAPK pour
  `localhost`** : « Installer » depuis un serveur de dev donne un raccourci legacy
  (`WebappActivity`) qui garde la barre d'état — d'où le fallback. Vérifié sur la Galaxy
  Tab A7 (SM-T500) le 2026-09-21.
- **Écran salarié** (§45 Poste) : photo, nom, semaine ISO, phrase d'état (« Au travail
  depuis 08:02 »), récap de la ligne, messages ; à droite **un ou deux boutons**
  (le premier or, le second navy — écart assumé au §45.3 : le legacy offre deux gestes).
  Pas de confirmation (comme le legacy) ; après un pointage, grand « enregistré à HH:MM »
  puis retour aux visages en 4 s ; écran laissé seul → retour en 30 s (`INACTIVITE_MS`).
  Erreurs en texte sous les boutons (`lib/erreurs.ts`).
- Poll 10 s, mise à jour du bundle seule (`lib/mise-a-jour.ts`, copie de l'atelier), SW
  `injectManifest`. Pas de vibration (tablette).
- **« Semaine N : » et « Solde annuel »** (SAI_Semaine / SAI_Cumul ; code de la fenêtre et des
  trois requêtes donnés par Vincent le 2026-09-15, `soldeHeures` dans `lib/pointage.ts`).
  Le legacy disait « Cumul » ; depuis le 2026-09-21 l'écran dit **« Solde annuel »** (compteur
  d'annualisation du temps de travail des accords d'entreprise), **toujours signé** et coloré
  (`soldeSigne` / `soldeClasse`, testés : vert en crédit, ambre en heures dues) :
  - ⚠️ **la semaine est la PRÉCÉDENTE** : `NuméroDeSemaine(DateSys()) - 1`, dans l'**année
    civile** du jour (`semaineDeReference`, testé) ; masqués en semaine 1 et quand
    `lst_lissage` n'a pas de ligne (salarié, année, semaine, non supprimée) ;
  - « Semaine N : » = `lst_lissage.cumul_semaine` de cette semaine (minutes travaillées) ;
  - « Cumul » = Σ `cumul_semaine` (semaines ≤ N) − Σ `lst_prev.prev` (semaines ≤ N) −
    Σ `lst_info_sal_annee.info` (l'année), tout `is_deleted = 0`, en minutes ;
  - format = `MinToFormat` du legacy (`heuresMinutes`) : « HH:MM », heures sur deux
    chiffres au moins, négatif « -HH:MM » (« 36:15 », « -02:30 »).

### « 7 derniers jours » (2026-09-24, pas dans le legacy)

Sous le statut (colonne de gauche, après les messages), `components/DerniersJours.tsx` : les
derniers jours travaillés du salarié **jugés par les règles du rapport de pointage email**
(`rapports-pointage-email.md`), rouge là où l'email rougit, la raison en mots dessous.
`GET /api/pointage/salaries/:id/journees` (même garde que `/etat`) → `analyserJours(jours, id)`
de `lib/rapports-pointage-envoi.ts`, **le lecteur de l'email lui-même** — ne jamais recopier la
boucle. Décisions de Vincent : jour travaillé = une ligne pointée **ou** une ligne de planning
(un jour de semaine sans rien n'est pas listé, l'email non plus) ; 30 jours de recherche ;
**jusqu'à hier** (le poste du jour n'est pas jugé). Lu une fois par visite
(`refetchInterval: false`, les jours passés ne bougent pas en 30 s).
- ⚠️ Les cartes de la colonne portent `flex-shrink-0` : sans lui, messages + tableau se
  compriment l'un l'autre au lieu de laisser la colonne défiler.
- ⚠️ Premier essai posé par erreur dans le tiroir ERP Pointage › Salariés, retiré le jour
  même : **c'est un écran de la tablette**, pour le salarié qui vient de pointer.
- Données de dev : `seed-journees-pointage-dev.ts --write` (API, scripts) pose 8 jours de
  semaine + le planning des trois postés, chaque défaut de l'email au moins une fois.

## Deltas assumés vis-à-vis du legacy

- **pas de « temps hors prod du jour »** (COMBO_Temps_hors_prod_du_jour, table `hors_prod`) :
  mesure de productivité abandonnée, retirée le 2026-09-21 sur décision de Vincent — la
  tablette ne lit ni n'écrit `hors_prod` (le legacy y ouvrait la ligne du jour) ;
- messages en texte, pas en HTML ;
- visages sur l'accueil (un appui de moins) ;
- poste de plus de 14 h non continué.

## Dev

```bash
# API (worktree NG) : 5178 doit être dans CORS_ORIGIN (TRM_PWA_PORTS de ETM/scripts/worktree/lib.mjs)
cd apps/pointage && VITE_API_URL=http://localhost:808N/api pnpm exec vite --port 5178
```

**Pas d'enrôlement en dev** (décision de Vincent, 2026-09-15) : sur une API hors production
dont la base `pointage` est sur `localhost`, tout navigateur est la pointeuse
(`ETM/apps/api/src/lib/pointage-dev.ts`, testé) — `/appareil/moi` répond « Pointeuse de dev ».
Double garde : `NODE_ENV !== 'production'` **et** serveur HFSQL local, donc impossible en prod
même sans `NODE_ENV`, et coupé pour une API locale branchée sur la prod. Pour travailler sur
l'enrôlement lui-même : `POINTAGE_DEV_ENROLEMENT=1` dans `apps/api/.env.development`, puis
générer un code « Pointeuse » dans l'ERP et « Enrôler cette pointeuse » sur `localhost:5178`.
⚠️ Écart assumé avec l'atelier (« pas de contournement côté API ») : la pointeuse n'a pas
d'identité à usurper.

## Reste à faire

Hôte `pointage.intra.etsmalterre.com` (DNS Unbound + Caddy + nginx), déploiement, réparation de
l'historique `lst_pointage` depuis `lst_horaire`, sonde de parité, formule du Cumul,
rollout en parallèle de l'ancienne pointeuse puis bascule.
