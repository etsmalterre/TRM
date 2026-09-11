# Tombé Métier › Stock

> Dossier de fonctionnalité, sorti de `CLAUDE.md` le 2026-09-02 (le fichier dépassait la limite de 150 k caractères). Contenu repris tel quel ; `CLAUDE.md` n'en garde que le résumé et les pièges majeurs. **Le mettre à jour ici**, pas dans `CLAUDE.md`.

## Tombé Métier › Stock data model — why it is NOT a shared screen

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
never edited from here. **Une exception : le tiroir réimprime l'étiquette Dymo du
rouleau** (bouton imprimante de l'en-tête), sur le même
`GET /visitage-trm/etiquettes?ids=<IDstock_ecru>` que le poste appelle à la validation —
une étiquette se déchire ou se mouille des mois après la visiteuse, et le seul chemin de
retour était de revalider une pièce. Ça n'écrit rien, donc ça reste dans un écran en
lecture seule et sans droit (mêmes raisons qu'au poste). Le bouton est **désactivé quand
`IDordre_fabrication` est nul** : c'est le garde-fou de partition de l'endpoint, donc ces
rouleaux-là 404 au lieu d'imprimer.
⚠️ **`GET /visitage-trm/etiquettes` a donc DEUX appelants maintenant**, plus le
`?demo=N` sans appelant — le toucher demande de vérifier le poste *et* ce tiroir.

**Seconde exception, depuis le 2026-09-02 (LIVA #1108) : les observations du rouleau
s'écrivent depuis le tiroir**, sous le droit **`edit_stock_ecru`** (catégorie « Tombé
Métier » de `permission-keys-trm.ts` — sa première clé ; même nom que la clé ETM du même
écran : même acte, store séparé). « Modifier » dans le bandeau du tiroir (or, §6.1, la
tuile passe au blanc), les cinq cartes prennent le liseré or, la carte Notes devient un
textarea, et `PATCH /api/stock/ecru-trm/:id` écrit `{ observations }` (`z.strict` :
un `poids` dans le corps fait 400, jamais ignoré en silence). Poids et réservation
restent ce que le poste de visitage a pesé ; le choix a sa propre voie depuis le
2026-09-11 (§ ci-dessous). Le garde-fou de partition est `IDsociete = 2`
sur la ligne même : un rouleau réceptionné par ETM (basculé en société 1) n'est plus
annotable d'ici, c'est le stock d'ETM. La valeur passe par `sqlText` (les notes de la
visiteuse portent des accents ; les tirets typographiques y sont repliés en `-`, ce n'est
pas une perte). L'impression de l'étiquette se retire du bandeau le temps de l'édition
(440 px : Annuler + Enregistrer + fermer doivent tenir à côté du titre). Garde §28 par
refs (§28.3.c, le patron de Fils › Stock) : changer de rouleau, fermer le tiroir ou changer
d'écran avec un brouillon demande d'abord. Garde HTTP :
`ETM/apps/api/src/scripts/check-stock-ecru-trm-observations.ts` (aller-retour accentué
restauré, 401 / 403 / 404 partition / 400 whitelist — écrit une valeur de sondage, **jamais
contre la prod**). API : ETM master `6c8de8c`. ⚠️ **Fermé par défaut : à accorder dans
Paramètres › Utilisateurs après le déploiement** (Nicolas Antonino l'a demandé).

## Le choix d'un rouleau se change depuis le tiroir (2026-09-11, LIVA #1150)

Nicolas Antonino a demandé à pouvoir « switcher des pièces en choix 1 / choix 2 » : un
rouleau re-visité à l'atelier, ou déclassé par erreur au poste. Décision du 2026-09-11
(Vincent Malterre) : oui, depuis le mode édition du tiroir, sous **sa propre clé
`edit_choix_stock_ecru`** (catégorie « Tombé Métier », fermée par défaut — à accorder à
Nicolas après déploiement). Pas repliée dans `edit_stock_ecru` : une note est
inoffensive, un changement de choix déplace de l'argent (déclassements de la Prime, poids
porté par l'avis et la facture, transfert ETM). Le même `PATCH /api/stock/ecru-trm/:id`
prend maintenant `{ observations?, second_choix? }` (toujours `z.strict`, corps vide =
400), **chaque champ vérifié contre sa clé** — le tiroir n'envoie que les champs que les
clés de l'utilisateur autorisent, sinon 403 sur un champ inchangé. La ligne « 2ᵉ choix »
de la carte Qualité devient un segmenté Non / Oui (§5, `h-7`, dans la fente valeur §27.5).

- ⚠️ **Le numéro de pièce n'est PAS renuméroté** (`num_piece_OF` reste `< 1000` ou
  `1000+` selon le choix d'origine). C'est l'identité du rouleau — sur l'étiquette collée,
  sur les défauts, sur l'avis — et tout notre code lit le drapeau `second_choix`, jamais
  la plage du numéro (rapport de production, Prime, TRS, freinte, valorisation ; seul
  l'allocateur de séquence du visitage regarde la plage, pour les rouleaux futurs). Le
  legacy ne renumérotait pas non plus : 3 % des lignes vivantes ont déjà drapeau ≠ plage.
  Un aller-retour serait impossible une fois le numéro libéré réutilisé. Renuméroter est
  une proposition écartée, pas un oubli.
- **L'étiquette est donc fausse après un basculement** (un déclassé imprime le pavé noir
  « DÉCLASSÉ », un 1er choix non) : la réponse porte `choix_change: true` et le tiroir
  affiche un bandeau ambre §7 « l'étiquette collée dessus est à réimprimer » avec le
  bouton d'impression, jusqu'à l'impression ou l'ouverture d'un autre rouleau.
- **La réservation suit** (règle #1129) : 1er → 2ᵉ met `IDLigne_Commande_TRM = 0` (sinon
  le rouleau part avec le prochain « Expédier » à plein poids comme du 1er choix) ;
  2ᵉ → 1er reprend la ligne de l'OF (`ordre_fabrication.IDligne_commande_client`), comme
  le poste l'aurait tamponnée — TRM n'a pas d'« affecter des pièces disponibles », sans
  ça un rouleau repromu ne s'expédierait que depuis le legacy. Une valeur identique est un
  no-op : ni ligne re-dérivée, ni trace.
- **Verrou** : 409 `rouleau_expedie` si `IDligne_expedition_TRM > 0` — son choix est déjà
  sur un avis et une facture, peut-être dans le grand livre d'ETM. Sans état UI : la
  liste ne sert que des rouleaux en stock, le tiroir ne s'ouvre jamais sur un expédié.
- **Trace** : une ligne `evenement_piece` positionnelle (`DATE` réservé, PK MAX+1, même
  forme que le poste) `Passage en 2nd choix` / `Passage en 1er choix`, `IDbonnetier = 0`,
  `observation = « par Prénom Nom »` de l'utilisateur — visible dans la timeline de la
  pièce (`PieceEvents`, icône par défaut). Libellés ASCII (pas de « ᵉ », hors Latin-1).
  L'échec de la trace ne fait pas échouer le basculement (l'UPDATE est fait).
- Le fil ne bouge pas (les déclassés sont déjà comptés dans le décrément) ; Prime,
  rapports et widgets recalculent depuis le drapeau.
- Garde HTTP : la même `check-stock-ecru-trm-observations.ts` (403 par clé, 400 corps
  vide, aller-retour du drapeau avec ligne suivie, numéro immobile, une trace par
  basculement, no-op, 409 expédié — restaure drapeau et ligne **par SQL** et supprime les
  traces de sondage, **jamais contre la prod**). ⚠️ Le script prend le secret cookie
  dans `AUTH_COOKIE_SECRET` : sur un worktree, `SECRET=$(grep AUTH_COOKIE_SECRET
  apps/api/.env.development | cut -d= -f2-)`, sinon tout est 401.
