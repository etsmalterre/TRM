# Pointage — le menu « Pointage » de l'ERP (port d'Admin Pointage)

Porte l'app WinDev **Admin Pointage** (`C:\Mes Projets\Admin Pointage\`, v3.0.9.0, exe Windows
**sans aucune authentification**) dans l'ERP TRM, sous le menu **« Pointage »**. Deuxième volet
du chantier pointage : la tablette (`apps/pointage`, dossier `pointage-pwa.md`) écrit, le bureau
corrige ici. Conception, décisions datées et **code legacy récupéré** (requêtes SQL et événements
WLanguage, captures WinDev de Vincent du 2026-09-21) : `~/.claude/plans/admin-pointage.md` § 7–8.
Commencé le 2026-09-21 (worktrees `TRM-admin-pointage` + `ETM-admin-pointage`).

## Données

Même base HFSQL **`pointage`** que la tablette (`pointageDb`, jamais le client par défaut) —
tables, colonnes et pièges dans `pointage-pwa.md` § « Les données ». Ce qu'Admin Pointage y
ajoute : `lst_salarie.login` (3 car., **clé unique sur toutes les lignes, supprimées comprises**)
; `lst_message` (un message = **un salarié**, texte + `date_fin`) ; `lst_lissage`,
`lst_prev`, `lst_info_sal_annee` (phases 2–3, non portées).

## Livré : Horaires · Semaines · Prévisionnel · Paie · Salariés (+ messages)

| Écran | Route | Legacy fusionné |
|---|---|---|
| Horaires | `/pointage/horaires` (`PointageHoraires.tsx`) | `FEN_Accueil` (table « En poste »), `FEN_Horaires` (grille éditable), `FEN_Nouvel_horaire` |
| Semaines | `/pointage/semaines` (`PointageSemaines.tsx`) | `FEN_Contrôles` (grille de l'année + « Détail »), `FEN_Lissage` (la semaine) |
| Prévisionnel | `/pointage/previsionnel` (`PointagePrevisionnel.tsx`) | `FEN_Prévisionnel`, `FEN_MAJ_prévisionnel`, `FEN_Initialisation_prévisionnel`, `FEN_Variables` |
| Paie | `/pointage/paie` (`PointagePaie.tsx`) | `FEN_Données_paie` (+ export xlsx que le legacy n'avait pas) |
| Salariés | `/pointage/salaries` (`PointageSalaries.tsx`) | `FEN_Salariés`, `FEN_Nouveau_salarié`, `FEN_Messages`, `FEN_Message` |

Patron §27 (tableau + tiroir), pièces partagées `components/pointage/parts.tsx`, client
`lib/pointage-admin.ts`, formats et périodes `lib/pointage-heures.ts` (testé).

- **Horaires** : **un seul sélecteur** (2026-09-22) qui s'ouvre sur « Maintenant » (toutes les lignes ouvertes, quel que soit le jour, non fermées en rouge) puis les périodes —
  périodes prédéfinies (semaine lun→dim, mois, 30 jours, libre), **pas de filtre salarié : la recherche (nom, prénom) suffit** (décision 2026-09-22).
  Colonnes = celles de `FEN_Horaires_1$Requête` : date, salarié, début, pause 1, pause 2, fin,
  pauses (**terminées seules**, min), **présence = fin − début BRUTE** (le legacy ne déduit pas
  les pauses ; le totaliseur ajoute « Hors pauses »). Tiroir : six heures en `<input type="time">`
  sous « Modifier » (`edit_pointage`), bilan, « Supprimer le poste » (confirmation §33), bandeau
  rouge sur un poste ouvert > 14 h. « Nouvel horaire » = dialogue §18.A.
- **Semaines** (2026-09-22, code legacy lu, plan § 9.2–9.4) : salarié + année → une tuile par semaine
  ISO (**rouge « à valider »** = dans la fenêtre `semMin < n ≤ semMax` sans ligne `lst_lissage`, verte
  = validée avec son total, grise = hors plage), bandeau « Solde annuel » = le « Détail » du legacy
  (Σ prev ≤ N, Σ lissage ≤ N, ajustements, total). Tiroir = `FEN_Lissage` : 7 jours lun→dim, horaires
  = les postes fermés du jour (`fin − début` **brut**, pauses non déduites), cumul, **lissé proposé =
  cumul arrondi au quart d'heure INFÉRIEUR** (`cumul − cumul mod 15`, le code, pas « le plus proche »
  dit en réunion), **type proposé d'après l'heure du premier début** (< 07:00 M, < 11:00 J, < 16:00 A,
  sinon N ; jour vide J), lettres M/A/N/J/E (repas : M, A, E = jour, N = nuit, J = aucun), les deux
  corrigibles, « Valider » = `PUT /lissage/semaine` (création ou **mise à jour** : une semaine validée se
  rouvre, comme le `HEnregistre` du legacy). Règles pures + tests : `lib/pointage-admin.ts`
  (`lundiIso`, `semaineMaxControle`, `semaineMinControle`, `semaineDetail`, `typePropose`, `lissePropose`,
  `cumulJourMin`).
- **Prévisionnel** (2026-09-22, plan § 9.5–9.6) : salarié + année (l'année suivante offerte) → une tuile par
  semaine ISO avec `lst_prev.prev` (« — » sans ligne, liseré or = commentaire), bandeau « Objectif annuel »
  = Σ prev + Σ info (le « Détail » du legacy). Tiroir = `FEN_MAJ_prévisionnel` : total « HH:MM » +
  commentaire, boutons « − 1 jour / − 2 jours » (7:00 par jour : les données réelles montrent 28:00 « 1 CP »,
  21:00 « 1 CP + 1 JF » sur une base 35:00), `PUT /previsionnel/semaine` (création ou mise à jour).
  « Initialiser l'année » (année **vide** seulement, comme le bouton legacy ; l'API refuse sinon) : même total
  chaque semaine (défaut 35:00) ou recopie d'un salarié qui a un prévisionnel cette année-là (semaines
  trouvées seules — le legacy ré-ajoutait le dernier tampon lu). **Variables** (`lst_info_sal_annee`) en
  dialogue : ⚠️ **saisies comme EFFET sur le solde** (+10:00 = dix heures de crédit) et stockées
  `info = −effet`, le signe du legacy (« -10:00 » tapé pour un report de +10 h, Détails affichant
  `info × −1`) ; solde = Σ lissage − Σ prev − Σ info.
- **Paie** (2026-09-22, plan § 9.7) : salarié, année, plage de semaines (défaut : les semaines ISO du **mois
  précédent**), lecture seule sur les **semaines validées** : par semaine les 7 cumuls lissés + lettre, total,
  **heures de nuit = Σ des jours N**, **repas jour = jours M / A / E de ≥ 6 h**, **repas nuit = jours N de
  ≥ 6 h** (le `>= 360` du legacy ; J ne donne rien), ligne Totaux ; quatre tuiles (ce que Leticia reporte
  en paie), bandeau ambre listant les semaines de la plage **non validées** (le legacy les ignorait en
  silence), « Exporter » = classeur xlsx de la même table. Règles pures + tests : `paieSemaine`,
  `totauxPaie` (API). **Tableau annuel : pas porté** (Vincent, 2026-09-22).
- **Salariés** : liste (supprimés masqués par défaut), tiroir = fiche éditable (nom, prénom,
  login, **bonnetier lié** = `id_mps`, choisi parmi `mps.bonnetier`) + carte « Messages
  sur la pointeuse » (créer / modifier / supprimer, expirés grisés) + « Supprimer le salarié ».

## L'API — `/api/pointage-admin` (`ETM/apps/api/src/routes/pointage-admin.ts`)

Routeur **séparé** de `/api/pointage` (la tablette garde son cookie `mps_pointeuse` et ses deux
gardes) : session `mps_uid` + clés TRM **`view_pointage`** (toute lecture) / **`edit_pointage`**
(toute écriture), `trmUserHasPermission`, admin effectif compris. Routes en tête du fichier.
Un refus métier répond **400 `saisie_invalide` + message français**, affiché tel quel.

- Règles pures dans **`lib/pointage-admin.ts`** (testé) : `appliquerSaisie` = la règle du legacy
  (`FEN_Horaires` › `Sortie de COL_*` et `FEN_Nouvel_horaire`) — **une heure « HH:MM » qui n'est
  pas strictement après le début (comparaison de texte) tombe au lendemain**, le début est
  toujours sur la date de la ligne et **ne peut pas être vidé**, une case vidée écrit 0 (vider la
  fin **rouvre le poste**) ; **plus** le contrôle d'ordre des heures que le legacy n'avait pas
  (écart assumé, message nommant l'heure fautive).
- Lectures dans `lib/pointage.ts` (`lignesPeriode` filtre sur `DATE`, `messagesDuSalarie`
  sans filtre de date, `loginPris` sur toutes les lignes).
- **Écritures des postes dans `lib/pointage-ecritures.ts`** (même verrou, même `jumelle()`,
  même contrat `Issue` que la tablette) : `creerLigneAdmin`, `corrigerLigneAdmin`,
  `supprimerLigneAdmin`. ⚠️ **Décision A (2026-09-21)** : contrairement au legacy, une
  correction **suit dans la jumelle `lst_pointage` et dans le journal `mps.pointage`** — une heure
  déplacée déplace la ligne du journal (IDbonnetier + ancien instant + `en_poste`), une heure
  ajoutée en insère une (fermer un poste oublié = un départ), une heure effacée retire la
  sienne ; **supprimer un poste flague la vérité et la jumelle, ne touche pas le journal**. La
  jumelle est retrouvée sur l'**ancien** début (un début déplacé ne matche plus rien après).
  Un poste né dans l'ancien Admin n'a pas de jumelle : `introuvable`, jamais inventée, le tiroir
  le dit (`SyncNote`).
- Salariés et messages dans `lib/pointage-admin-ecritures.ts` : soft delete partout, login
  normalisé majuscules, texte en `sqlTextCp1252` (un emoji est **refusé**, jamais un `?`), message
  stocké en **texte** (le legacy stockait du HTML ; la tablette le dépouille de toute façon).
- Garde : **`scripts/check-pointage-admin.ts`** (cycle complet nuit → fermeture → déplacement →
  effacement → refus → suppression + salarié/message, sur la copie de dev, nettoie ; le jour
  test est en 2001).

## Droits et menu

- Menu `screen_pointage` (grant, fermé par défaut, **pas de seed** : s'accorde à la main) déclaré
  dans `navigation.ts` **et** `ETM/.../screen-keys-trm.ts` ; les deux entrées portent
  `permission: 'view_pointage'`, donc sans la clé le menu disparaît (précédent Rapports).
- Catalogue `permission-keys-trm.ts`, catégorie « Pointage » : `view_pointage`, `edit_pointage`
  (sous-clé). Après déploiement : accorder les trois clés aux personnes du bureau.

## Deltas assumés vis-à-vis du legacy

- Période filtrée (le legacy listait tout l'historique) ; contrôle d'ordre des heures ; jumelle
  et journal suivis (décision A) ; un message exige un salarié (le legacy affichait « TOUS » pour
  un orphelin que la pointeuse ne montrait jamais) ; colonnes de la fiche salarié éditables (le
  legacy les affichait seulement) ; pas de « temps hors prod » (table abandonnée le 2026-09-21).

## Reste à faire

Rien du legacy : les cinq écrans de Leticia sont portés (Tableau annuel et Ratio abandonnés). Pistes
proposées non tranchées : liste « À valider » toutes personnes confondues en tête de Semaines ; jours
fériés proposés dans le prévisionnel.
**Le ratio de production est abandonné** (Vincent, 2026-09-22) : `useInRatio` n'est ni affiché ni
modifiable (écrit à 1 à la création, colonne conservée). Chacune attend du code WinDev à coller (plan § 1, liste datée) ; la
plus haute valeur est **l'alphabet des lettres de type** de `lst_lissage` (nuit, paniers, absences).
