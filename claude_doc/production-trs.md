# Production › TRS (le tableau de bord d'équipe)

> Dossier de fonctionnalité, sorti de `CLAUDE.md` le 2026-09-02 (le fichier dépassait la limite de 150 k caractères). Contenu repris tel quel ; `CLAUDE.md` n'en garde que le résumé et les pièges majeurs. **Le mettre à jour ici**, pas dans `CLAUDE.md`.

## Production › TRS (`/production/trs`) — port de `FI_TRS.wdw`

Le tableau de bord d'équipe de l'atelier : une équipe (Matin 5–13 / Après-midi 13–21 /
Nuit 21–5, navigation ◀ ▶), ses bonnetiers **pointés** et leurs heures, quatre KPI
(Production · Visitage · Second choix · Non visitées à `<fin>`H) chacun dépliable en
table de pièces → cartes d'événements de la pièce sélectionnée, et la **timeline par
métier** avec Vitesse · Arrêts/h · TRS + ⓘ. Écran `apps/web/src/pages/ProductionTrs.tsx`
+ `components/trs/*` ; lib `src/lib/trs-equipe.ts` (types miroir, échelle temps,
formatteurs, testés) ; API `GET /api/trs/equipe?debut=YYYYMMDDHHMMSS`
(`ETM/apps/api/src/routes/trs.ts`, chargeurs `lib/trs-equipe-trm.ts`, calcul pur
`lib/trs-trm.ts` — **le même `calculerTrs` que la tablette**, donc le même TRS). Dossier :
`~/.claude/plans/curried-nibbling-wave.md`.

- **Spec récupérée dans le cache de compilation** (`FI_TRS.B086A5CC.wdw.wcw/.wbw`,
  2026-08-28) : les 20 requêtes SQL, tous les libellés, l'inventaire des contrôles ; la
  fonction d'équipe `HorairesEquipeEnCours` verbatim dans le Java Android. KPI legacy,
  bornes `]debut, fin]` : Production = `piece_production` finies (`date_fin`), **poids
  nominal** ; Visitage / Second choix = `stock_ecru.date_saisie` (poids pesé, `second_choix`) ;
  « Non visitées à 21H » = pièces finies sans rouleau à la **fin d'équipe** (l'heure est
  calculée — 13H le matin, 5H la nuit). Cartes d'événements = `evenement_piece` (par
  `IDpiece_production` OU `IDstock_ecru`) ∪ `defaut_qualite` rendu « Défaut » (rouge).
- ⚠️ **Les bonnetiers viennent de `pointage`, pas du planning.** Le legacy lit la table de
  la pointeuse (`IDbonnetier, DATE, en_poste`), vivante (~200 lignes/mois, régleurs compris,
  pauses visibles) ; `planning_bonnetier` ne couvre que 3–4 personnes par jour. Algorithme
  `presenceEquipe` : état à l'ouverture = dernier pointage ≤ début, puis chaque bascule →
  intervalles, pauses, « Total : N Heures N min ». **Delta assumé : les régleurs sont
  affichés** (chip « régleur »), le legacy les filtrait.
- **Deux autres deltas** : la carte Production a **sa propre table** (le legacy n'en a pas —
  4 volets pour 5 états) ; la navigation ne saute **pas** les équipes vides (le legacy
  sondait `COUNT(piece_production)` avant d'adopter une équipe, boucle non récupérable).
- **Une seule réponse par équipe** (~50 Ko dense, ~1 s sur le pilote Windows) : machines
  avec segments + événements + `detail` des déductibles, les 4 listes, **les cartes
  d'événements de toutes les pièces** (2 requêtes batchées), le roster. ~15 requêtes
  bornées à l'équipe, jamais N par métier (le legacy en faisait 4 par métier + 1 par
  événement pièce). Équipe passée : cache API 10 min (`cacheEquipes`) + `staleTime` 10 min
  côté web ; équipe en cours : refetch 60 s, jamais cachée ; l'équipe précédente est
  **préchargée** dès que la courante est connue. Les états initiaux (dernier événement
  avant l'équipe) sont lus en UNE requête (48 h avant, dernier par métier) puis cachés par
  équipe (`Map` LRU 8, plus le slot unique d'avant — feuilleter le passé n'évince plus
  l'entrée de la tablette).
- **Timeline** : SVG maison par piste (`TimelineMetiers.tsx`, patron de
  `PoidsPiecesChartDialog`) sur une échelle mesurée — **les 8 h tiennent dans la largeur,
  sans zoom** (décision utilisateur du 2026-08-28). Marche = vert, **le blanc EST l'arrêt**
  (comme le legacy), événements pièce = 7 min (`420 s` legacy) navy sous le rail, lancement
  d'OF (pièce n° 1) noir, fin d'OF rouge foncé, fenêtres d'OF en filet ardoise au-dessus,
  trait « maintenant » or. Chaque marque est sa propre cible de survol **élargie à ≥ 24 px**
  (`rectCible`), même lecture au focus clavier ; légende obligatoire ; la colonne de
  valeurs et le ⓘ sont la « table jumelle » du dessin. ⚠️ Les cellules de la grille
  portent `min-w-0 overflow-hidden` : sans ça un SVG large fige la colonne à son ancienne
  largeur (min-width auto) et le `ResizeObserver` ne voit jamais le rétrécissement.
- **Barèmes = FI_TRS verbatim** (`SEUILS_FI_TRS`, API) : vitesse `< 20` rouge / `< 25`
  ambre (absolu — pas le relatif de la tablette), arrêts/h `0–1` vert / `2` ambre, TRS
  `≤ 0,8` / `≤ 0,9` (les deux seuls réels du cache). `lib/trs-equipe.test.ts` **importe le
  fichier de l'API** pour épingler `REGLES` ; depuis une worktree appairée :
  `ETM_API_TRS_TRM=<ETM-xxx>/apps/api/src/lib/trs-trm.ts pnpm test`.
- **Le ⓘ = dialogue bandé §18.D** (`TrsMetierDialog`) : trois tuiles-verdict, puis le
  calcul ligne à ligne (fenêtres, P, marche, déductibles **détaillés** via
  `calculerTrs().detail`, production possible, TRS, arrêts anormaux) — le legacy n'avait
  qu'une bulle irrécupérable.
- **Tuile KPI = onglet** (`KpiTile`, décision utilisateur) : cliquer remplace la timeline par
  la table §27.3 de la carte + les cartes `EventTimeline` de la pièce sélectionnée ; re-clic
  ou « Timeline » revient au plan. Pas de tiroir.
- **Droit `view_trs`** (catégorie Production, **fermé par défaut, accordé à la main** —
  décision utilisateur) : masque l'entrée de menu (`SubMenuItem.permission`, comme
  Finance), « Accès restreint » sur la page, 401/403 sur `/trs/equipe`. **`/trs/atelier`
  (tablette) reste ouvert.** Sonde : `probe-trs-equipe-trm.ts --debut …` (signe le cookie
  admin comme les `check-*`) — **à rejouer sur la prod** contre la capture du 28/08 13 h
  (Production 11 / 212 kg, Visitage 14 / 244 kg, 2ᵉ choix 1,64 %, non visitées 3 ; TRS 1G
  85 %, 2E 99 %, 2F 89 %, 2I 28 %, 3B 63 %, 3C 90 %, 3D 97 %, 3E 65 %, 3H 9 %).
- `useMinuteClock` est sorti de `PiecesAVisiterWidget` vers `hooks/` (le trait
  « maintenant ») ; `SectionBand` (le bandeau §43 de Prime) vit dans `components/shared/`.

