# TRS — la tablette murale de l'atelier (`apps/trs`)

> Dossier de fonctionnalité, sorti de `CLAUDE.md` le 2026-09-02 (le fichier dépassait la limite de 150 k caractères). Contenu repris tel quel ; `CLAUDE.md` n'en garde que le résumé et les pièges majeurs. **Le mettre à jour ici**, pas dans `CLAUDE.md`.

## TRS — la tablette murale de l'atelier (`apps/trs`)

Port de l'app WinDev `Appli_TRS` (`FEN_Main_App_TRS.wdw`) : **une tablette au mur de
l'atelier** qui montre le plan du parc, une tuile par métier, avec l'état lu **dans la
base** — jamais l'automate en direct. **Troisième app du monorepo**, hôte **`trs.malterre`**,
port dev **5177**, version propre (`apps/trs/package.json`, démarrée à 0.0.1). Dossier de
conception : **`~/.claude/plans/trs-atelier.md`** — la spec du calcul y est citée verbatim.

**Ce n'est PAS `apps/atelier`** (l'app de saisie des bonnetiers) : écran passif, lecture
seule, **aucune identité, aucun droit, aucun cookie** — le même statut que consulter le
poste de visitage. Décision `TRS/CLAUDE.md` du 2026-08-28 : le collecteur Modbus reste dans
le dépôt TRS, la vitrine vit ici.

- **API** : `GET /api/trs/atelier`, route `ETM/apps/api/src/routes/trs.ts`, calcul pur et
  testé dans `lib/trs-trm.ts` (18 tests). Sonde `scripts/probe-trs-trm.ts`
  (`TRS_API_URL=…`, lecture seule — **à rejouer sur la prod après `/etm_deploy`**, c'est
  le seul exercice du chemin Linux). La tablette interroge toutes les 10 s.
- **La formule est celle de `FI_TRS`** (procédure `MAJAffichageAtelier`), fournie par
  l'utilisateur le 2026-08-28 — la fenêtre de la tablette est PCS-compressée et son
  `TRSEquipeEnCours` irrécupérable. Par métier, sur **l'équipe en cours** (5–13 / 13–21 /
  21–5, les bornes de `equipeAt`) bornée à maintenant : `TRS = temps en marche /
  (temps de production − arrêts déductibles)`, où le temps de production est le temps
  d'OF en cours, le temps en marche vient d'`evenement_machine`, et les déductibles sont
  `min(60 s, arrêt)` par arrêt machine + **3 min par Nettoyage (6 avec lycra) + 5 min par
  fin de pièce (8 avec lycra)** — lycra = `asso_fil_matiere.IDMatière IN (4, 13)`. Les
  « arrêts » sont les arrêts machine **moins un par événement pièce**. ⚠️ **Le TRS dépasse
  100 %** quand les forfaits dépassent l'arrêt réel — c'est le 106 % / 115 % de la
  tablette legacy, pas un bug.
  - **Trois deltas assumés** (dossier §4.2) : le temps de production est l'**union** des
    fenêtres d'OF (ce que dit le commentaire du code legacy, « 2 + 3 = 5 h », alors que le
    code n'en gardait qu'une) ; l'état à l'ouverture de l'équipe vient du **dernier
    événement avant l'équipe** (un métier qui tourne 8 h sans transition est à 100 %, le
    legacy le mettait à 0) ; tout arrêt commencé en production compte.
  - Cet état initial est **caché par équipe** côté API (30 `TOP 1` une fois par équipe,
    pas à chaque poll).
- **Le plan du parc est le dessin de l'utilisateur, pas la tablette legacy** — qui
  dessinait un 1B inexistant et oubliait 3K. Au sol : rangée 3 (3A…3K, onze), une allée
  transversale, puis 2A…2J et 1A…1J avec deux allées longitudinales après B et avant I ;
  **1B est un emplacement vide** (la place existe, pas le métier — vérifié en base : 30
  métiers vivants, `adresse_automate` 2 inutilisée). `apps/trs/src/lib/plan.ts`, clé
  `machine.emplacement` ; un métier hors plan n'est pas perdu, le pied de page le nomme.
  - ⚠️ **À l'écran le plan est TOURNÉ de 180°** (correction utilisateur du 2026-08-28) :
    la tablette est au mur que l'opérateur regarde, l'allée transversale dans son dos,
    donc il voit le sol depuis l'autre côté — **1A en haut à droite**, rangées 1 puis 2
    en haut lues de droite à gauche (1J … 1A), l'allée transversale sous elles (vers le
    spectateur), rangée 3 le long du bas (3K … 3A), allées longitudinales **après I et
    après C** dans ce sens de lecture. La rotation vit dans `plan.ts` (`RANGEES_HAUT` /
    `RANGEE_BAS`), jamais en CSS — un `rotate` retournerait aussi le texte.
- **Tuile = le jeu legacy** (décision du 2026-08-28) : tr/min en marche ou **« 7 min
  arrêté » à l'arrêt** (le libellé est `arrêté` sous la durée — le « depuis » du legacy se
  lisait comme un mot égaré, correction utilisateur du 2026-08-28), TRS, **arrêts / pièce** ;
  métier sans OF démarré = tuile grisée, libellé seul.
  - ⚠️ **La pastille « arrêts » n'est PAS le compte d'équipe de FI_TRS** (`calculerTrs.arrets`,
    ce qu'elle affichait jusqu'au 2026-08-28, gardé dans le payload comme `arretsEquipe`).
    C'est le **`NombreArrets` de la tablette legacy**, récupéré dans le cache de
    compilation (`FEN_Main_App_TRS.CB86C13A.wdw.wcw`, trois requêtes en clair) : **par
    pièce**, les arrêts machine (`evenement_machine.etat = 0` entre `date_debut` et
    `date_fin` de la pièce) **moins les événements déclarés sur la pièce** (tout
    `evenement_piece` sauf « Début du tricotage »), plancher 0. Le legacy prenait les
    2 dernières pièces (`LIMIT 2`) et son WLanguage est compressé (somme ou moyenne :
    inconnu). Décision utilisateur du 2026-08-28 : **la MOYENNE par pièce sur les 3
    dernières pièces TERMINÉES de l'OF actif** (`ARRETS_PIECES`, `lib/trs-trm.ts`
    § Arrêts par pièce) — une fréquence comparable entre métiers ; pièces terminées
    seulement (une pièce ouverte a moins d'arrêts parce qu'elle n'est pas finie) ; dans
    l'OF, comme le legacy (un nouvel OF est une vraie remise à zéro) ; **aucun filtre de
    faux arrêts** (la tablette n'en avait pas). « — » et pastille grise tant que l'OF n'a
    pas de pièce terminée. Côté API la moyenne est **cachée par (OF, ids des dernières
    pièces)** : elle ne peut changer qu'à une fin de pièce, donc elle n'est recalculée
    qu'à ce moment-là, pas à chaque poll.
  - En dev la pastille est à 0 partout : les pièces des OF actifs sont celles de mars (ou
    celles du seed de visitage) et `evenement_machine` n'a rien dans ces fenêtres. Sur
    octobre 2025 (données denses) le calcul donne 1,7 / 2,7 / 4,7 / 8 / 11 arrêts par
    pièce selon l'OF — donc le barème ≤ 1 / ≤ 3 / > 3 est à rejuger sur la prod.
  **L'état machine colore TOUTE la carte** (bord 2 px, bandeau 20 %, corps 10 % — le
  patron des cartes de rouleau du visitage ; décision utilisateur du 2026-08-28, un simple
  liseré §41 était trop discret pour un mur lu à travers l'atelier), et donc **les
  pastilles de valeur sont pleines** (blanc sur la couleur du barème, comme le legacy) :
  rien de posé sur ce corps ne peut être un lavis de la même teinte. Barème TRS = legacy
  (≤ 0,8 rouge, ≤ 0,9 ambre). ⚠️ **Trois barèmes sont des approximations** (dossier
  §4.3, à trancher) : la vitesse est colorée **relativement à `ref_ecru.vitesse_cible`**
  (90 % / 75 % — la photo montre 18 vert et 14 rouge, donc pas l'absolu `< 20 / < 25`
  de FI_TRS), les arrêts par pièce (≤ 1 / ≤ 3 / > 3 — la photo montrait 0 vert, 4–5 ambre,
  9 rouge sur le `NombreArrets` legacy à 2 pièces, relu par pièce), « arrêté » rouge
  à 5 min. Tout est dans `lib/affichage.ts`, testé.
  - **Deux seuils tranchés le 2026-08-28, à ne pas « harmoniser » entre eux** : la minute
    d'intervention du TRS reste à **1 min** (le « temps de production possible » est celui
    d'un atelier de bonnetiers idéaux qui réparent aussi vite qu'il est pratiquement
    possible — le temps de diagnostic est précisément ce que le TRS mesure), et le
    « depuis » rouge à **5 min** est un seuil de **fiabilité** contre les fausses cartes
    rouges (micro-arrêts, parasites automate), pas un temps accordé. Le dialogue ⓘ le
    formule ainsi (« passe au rouge au bout de 5 minutes », jamais « vous avez 5 minutes »).
- **Le pied de page est un instrument, pas une décoration** : il donne l'heure du dernier
  événement du parc et passe en ambre au-delà d'une heure de silence — le recorder n'a
  aucun battement surveillé (`TRS/docs/recorder.md`), et un automate éteint ressemble
  exactement à un atelier arrêté. Une lecture qui échoue garde le dernier plan à l'écran
  et le dit (« Hors ligne »), jamais un écran blanc.
- ⚠️ **En dev, les chiffres sont faux et c'est la base** : `ordre_fabrication` y est
  l'instantané de mars alors qu'`evenement_machine` est vivante — d'où des « depuis
  291 j » et des OF à 0 %. Juger la parité sur la prod, avec la sonde.
- **Tout est dimensionné en `--u`** (`index.css`, `min(1vw, 1.6vh)` — 12,8 px à
  1280 × 800) : tailles de texte, paddings, allées, bandeau. C'est ce qui fait tenir le
  même plan sur une Galaxy Tab A9+ (~960 × 600 px CSS) et sur une 12" — les paliers
  Tailwind ne servent à rien ici, il n'y a qu'un écran et il doit remplir la dalle. Les
  petits libellés ont un plancher de 9 px (`max(9px, …)`).
- **Bandeau** : le mot-symbole, l'équipe au centre, le TRS atelier à droite, puis le ⓘ — rien d'autre. Le nom « TRS · Atelier » et les trois compteurs du parc ont été retirés (demande utilisateur du 2026-08-28) ; le `parc` de l'API les porte toujours.
- **Le ⓘ ouvre « Comment le TRS est calculé »** (`components/InfoTrsDialog.tsx`, dialogue
  bandé §18.D fait main — pas de Radix ici — en `--u`), écrit pour les gens de l'atelier :
  la formule (une seule ligne, « TRS = temps de marche réel ÷ temps de production
  possible », rien dessous — décision utilisateur), **« Temps de production géré depuis le
  téléphone »** (un **flux**, pas une liste : Démarrer l'OF → Interrompre ⇄ Relancer →
  Terminer, chaque étape avec son moment en petit et ses **étiquettes de rôle** dessous,
  RÉGLEUR partout et BONNETIER en or sur Terminer seulement — précision utilisateur du
  2026-08-28 : le bonnetier peut aussi terminer l'OF en fin de production ; la carte disait
  « géré par les régleurs » avec trois chips, puis une phrase posée en ligne après les
  chips, refusée comme « particulièrement moche » — + la note : un OF oublié en cours fait
  baisser le TRS — sa propre carte, en premier après la formule), ce qui est déduit (trois lignes nues + la pastille « > 100 % »
  designée), **« Les arrêts »** (UNE phrase disant ce qu'est la valeur — « arrêts anormaux
  par pièce, en moyenne sur les 3 dernières pièces terminées de l'OF » — et une note « mis
  à jour à chaque fin de pièce » ; **pas de mécanique +1 / −1**, retirée à la demande de
  l'utilisateur le 2026-08-28 ; posée à côté de « Ce qui est déduit » pour tenir sur un
  écran 1280 × 800), l'équipe, les couleurs de la tuile (quatre pastilles, arrêts / pièce
  compris) — six cartes, pas plus : « TRS atelier » a été retirée, **et il n'y a pas de
  pied de dialogue** (pas de
  « Fermer » : le ✕ du bandeau, Échap et le fond suffisent — rien à confirmer). **Aucun
  chiffre n'y est un littéral** : tout vient de `lib/regles.ts`, dont
  `regles.test.ts` importe **directement le fichier de l'API**
  (`ETM/apps/api/src/lib/trs-trm.ts`, sans import, ETM étant déjà un frère obligatoire) et
  épingle les barèmes de `affichage.ts` — changer l'API d'abord, le test dit quand suivre.
  Le dialogue montre les forfaits **bruts** que vit le bonnetier (nettoyage 4 / 7 min, fin
  de pièce 6 / 9 min, la minute d'intervention comprise — les chiffres du commentaire
  legacy), l'API stockant les nets (3 / 6, 5 / 8).
- **Logo** : le seul mot-symbole blanc `logo-full.png` dans le bandeau — le vrai logo
  Malterre, pas la lettre M en texte, et pas le badge M non plus (décisions utilisateur
  du 2026-08-28, en deux temps). **En dev (`import.meta.env.DEV`) c'est le badge DEV**
  (`public/logo-dev.webp`, celui de la sidebar de l'ERP), centré dans une cellule de la
  largeur du mot-symbole (8u) pour que le centre du bandeau ne bouge pas entre dev et prod.
- **Le plan est un sol** : `main` en `bg-sand-darker` (le béton chaud), les cartes
  opaques dessus (blanc cassé pour un métier sans OF, `emerald-50` / `red-50` en
  production), et **les allées en ardoise OPAQUE (`bg-slate-400`), continues** — opaques parce qu'elles se chevauchent aux jonctions, et qu'un lavis y imprimait le recouvrement plus foncé — le bloc bas est
  UN seul grid (depuis la rotation : le bloc du HAUT, rangées 1 et 2) où l'allée
  transversale occupe la dernière ligne et les deux allées longitudinales s'étendent sur
  les trois lignes, du bord haut jusque dans la transversale, pour que les traits du
  dessin se rejoignent (`BlocHaut` dans `pages/Atelier.tsx`, correction utilisateur du
  2026-08-28). Ne pas revenir à une allée par rangée : c'est ce qui les coupait.
- **Dev** : `cd apps/trs && pnpm exec vite --port 5177`, `.env.local` (gitignoré) portant
  `VITE_API_URL=http://localhost:808N/api`. 5176 et 5177 sont dans `TRM_PWA_PORTS` de
  `ETM/scripts/worktree/lib.mjs`, donc dans le CORS de toute API de worktree.
- **Reste à faire** : l'hôte de prod `trs.malterre` (même travail que `atelier.malterre`,
  ni l'un ni l'autre n'est fait) et la tablette en mode kiosque.

