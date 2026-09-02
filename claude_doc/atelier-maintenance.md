# Atelier › Maintenance

> Dossier de fonctionnalité, sorti de `CLAUDE.md` le 2026-09-02 (le fichier dépassait la limite de 150 k caractères). Contenu repris tel quel ; `CLAUDE.md` n'en garde que le résumé et les pièges majeurs. **Le mettre à jour ici**, pas dans `CLAUDE.md`.

## Atelier › Maintenance (`/atelier/maintenance`) — port de `FI_Maintenance.wdw`

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
