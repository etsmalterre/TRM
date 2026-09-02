# Atelier — la PWA mobile de l'atelier (`apps/atelier`)

> Dossier de fonctionnalité, sorti de `CLAUDE.md` le 2026-09-02 (le fichier dépassait la limite de 150 k caractères). Contenu repris tel quel ; `CLAUDE.md` n'en garde que le résumé et les pièges majeurs. **Le mettre à jour ici**, pas dans `CLAUDE.md`.

## Atelier — la PWA mobile de l'atelier (`apps/atelier`)

Migration de l'app Android legacy des bonnetiers/régleurs. **Deuxième app du monorepo**,
hôte **`atelier.malterre`**, parc Android. Dossier de conception :
**`~/.claude/plans/atelier-malterre.md`** — décisions, pièges vérifiés, questions ouvertes.

**État au 2026-08-27** : Accueil (grille de visages) → Choix Métier (Actives / Inactives) →
Poste, **saisie comprise**. Les huit actions du legacy s'enregistrent (`POST
/api/atelier/of/:id/evenement`), sous le droit `saisie_atelier`.

**Ce qui manque encore, dans l'ordre où ça compte :**
- ⚠️ **Pas d'annulation**, alors que le legacy en a une (`IMG_Annuler` sur la dernière
  action). Une mauvaise « Terminer OF » n'est donc pas rattrapable depuis le téléphone :
  elle ferme la pièce, arrête l'OF et passe le métier au suivant via `AutoActivation()`.
- ⚠️ **Aucun téléphone ne peut écrire aujourd'hui** : le compte-poste n'existe pas et
  personne ne détient `saisie_atelier` (fermé par défaut). Voir « Identité » plus bas.
- Les trois écrans secondaires : Consigne (`message_of` + la consigne du régleur),
  Fils OF, Information (la checklist de nettoyage, littéraux récupérés verbatim).
- L'hôte de prod (nginx sur `10.10.2.165` + entrée Caddy sur `10.10.2.167`).

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
  **MAIS c'est un instantané du 24/03/2026** : son `info.build` liste 12 fenêtres et l'app
  qui tourne en a au moins une de plus (un écran Production/Visitage atteint par une 4ᵉ
  icône ronde). Autorité sur ce qu'il contient, pas sur l'inventaire.
- ⚠️ **`bonnetier` n'a pas de colonne `IDutilisateur`** alors que les droits sont clés
  dessus. Décision du 2026-08-27 : le lien sera un **store JSON côté API**
  (`data/bonnetier-utilisateur.json`, à côté de `permissions-trm.json`), **pas un
  ALTER TABLE** — la table appartient à WinDev, le `.xdd` en est l'autorité, et ~15 lignes
  à mapper ne valent pas une modification de schéma partagée difficile à annuler.
- ⚠️ **`signUserId()` rend la même chaîne pour toujours, sur tout appareil** — donc un cookie
  de compte privilégié serait copiable et irrévocable. La charge doit porter un `deviceId`
  avant qu'un compte régleur existe. `cookieOptions()` est aussi `secure: false` : à épingler
  sur `Secure` pour ce hôte le jour où le cookie porte un privilège.
- ⚠️ **`atelier.malterre` a son PROPRE bocal à cookies** : `res.cookie()` ne pose pas de
  `domain`, donc la session de `trm.malterre` ne suit pas. Bonne isolation, mais l'app porte
  son propre chemin d'identification depuis le premier jour.
- **L'identité bonnetier n'est PAS une authentification** : grille de visages +
  `localStorage`, exactement le modèle de confiance du legacy (`SauveParamètre`) et du poste
  de visitage (§45.4). Le garde-fou réel viendra de l'enrôlement d'appareil côté régleur.
- **Dev** : `cd apps/atelier && VITE_API_URL=http://localhost:808N/api pnpm exec vite --port 5176`
  (5176 est déjà dans le `CORS_ORIGIN` de l'API ; 5175 reste à l'ERP). `host: true` est
  activé pour qu'un vrai téléphone du parc puisse taper le serveur de dev sur le LAN.

