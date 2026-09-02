# Ticket widget (LIVA issue tracker)

> Dossier de fonctionnalité, sorti de `CLAUDE.md` le 2026-09-02 (le fichier dépassait la limite de 150 k caractères). Contenu repris tel quel ; `CLAUDE.md` n'en garde que le résumé et les pièges majeurs. **Le mettre à jour ici**, pas dans `CLAUDE.md`.

## Ticket widget (LIVA issue tracker) — feature version 1.3.0

In-app bug/feature reporting to the LIVA tracker (product **`trm-erp`**), same widget as
ETM's (spec + upgrade path: the `issue_tracker_integration` skill):

- **Widget**: `apps/web/src/components/tickets/` + trigger/unread badge in
  `components/layout/Header.tsx`, screenshot via lazy `html-to-image`. The files are
  verbatim mirrors of ETM's `components/tickets/` — improve them **in ETM** and re-copy.
  The single deliberate delta is `useTickets.ts` calling `/api/tickets-trm` instead of
  `/api/tickets`.
- **Proxy**: the MPS API's `routes/tickets.ts` router factory, mounted at
  `/api/tickets-trm` and scoped by env `ISSUE_TRACKER_PRODUCT_SLUG_TRM=trm-erp` —
  a **prod deploy requirement** on the shared API's env (`ETM/claude_doc/dev_setup.md` §4).
  Never point the widget at `/api/tickets`: the tracker key is company-scoped and the
  per-mount slug is what keeps ETM's and TRM's "Mes tickets" apart.
- Read state (unread badge) is `localStorage`-only, keyed per user — no HFSQL change.
- **Un compte sans email envoie quand même des tickets (v1.3.0)** — décision utilisateur du
  2026-08-28 : c'était le poste de visitage (compte-poste `Visitage`) et Mickael Grivelet,
  qui n'a pas d'adresse société et n'en a pas besoin. Le proxy les identifie sous une
  adresse synthétique stable `utilisateur-<id>@mps.malterre.invalid`
  (`ETM/apps/api/src/lib/tickets-reporter.ts` — le tracker clé le rapporteur par email mais
  n'y *envoie* que le suivi par email), force `follow_up` à faux, refuse `PATCH /:id/follow`,
  et `GET /tickets-trm/reporter` → `{ name, can_follow }` dit au widget de cacher la case et
  l'interrupteur de suivi. Avant, le proxy répondait 400 et ces comptes ne pouvaient rien
  envoyer.
  - **Le poste nomme la visiteuse** : `ProductionVisitage.tsx` pose son nom dans
    `components/tickets/reporterHint.ts` (store module, effacé en quittant l'écran) et le
    widget l'envoie en `reporter_name` ; le proxy ne l'honore que pour un rapporteur
    synthétique, **accolé** au nom du compte — « Isabelle Dupont (Visitage) » — jamais
    substitué, et l'ignore pour un compte personnel (l'identité reste la session).
  - ⚠️ **Associer un email plus tard change l'identité tracker du compte** : les tickets
    antérieurs restent sous l'adresse synthétique et sortent de « Mes tickets ». Assumé —
    ne pas fusionner deux identités à chaque poll pour le masquer. Et ne jamais mettre
    l'adresse d'une vraie personne sur le compte-poste : le tracker réécrit `display_name`
    à chaque création, ses propres tickets se renommeraient « Visitage ».
- **Suivi par email (v1.2.0)** — « Me tenir informé par email » : une case **décochée par
  défaut** sur le formulaire, et un interrupteur (§35) dans la fiche du ticket. Le drapeau
  vit côté tracker (`bugs.follow_up`), pas ici : rien à stocker dans HFSQL. Une fois activé,
  **chaque changement de statut** du ticket envoie un email au rapporteur, aux couleurs
  Malterre et en français (la marque du client pilote la langue) — y compris la clôture
  automatique quand LIVA publie la version corrective. Une réponse du développeur qui ne
  bouge pas le statut n'envoie rien : elle voyage dans l'email du prochain changement, et
  la pastille non-lu du widget couvre déjà ce cas.
  - Route proxy `PATCH /api/tickets-trm/:id/follow` (même contrôle de propriété que le
    détail : la clé API du tracker est *company*-scoped, pas *reporter*-scoped).
  - Garde HTTP : `ETM/apps/api/src/scripts/check-tickets-follow.ts`
    (`TICKETS_MOUNT=tickets-trm` par défaut) — elle crée un vrai ticket `[CHECK]` sur le
    tracker visé, donc pointer l'API dev sur un tracker local avant de la lancer.
  - ⚠️ **Le tracker doit être déployé avec la migration `follow_up` avant le web TRM**,
    sinon la case part avec le POST sans effet et l'interrupteur 404.

