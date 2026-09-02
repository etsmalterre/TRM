# Qualité › Retour client + boucle FNC

> Dossier de fonctionnalité, sorti de `CLAUDE.md` le 2026-09-02 (le fichier dépassait la limite de 150 k caractères). Contenu repris tel quel ; `CLAUDE.md` n'en garde que le résumé et les pièges majeurs. **Le mettre à jour ici**, pas dans `CLAUDE.md`.

## Qualité › Retour client (`/qualite/retour-client`) — port de `FI_Retour_ClientTRM.wdw`

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

