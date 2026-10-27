# Agents IA (TRM) — `/agents-ia/agents`, `/agents-ia/automates`

> ⚠️ **Since 2026-10-27 these screens live in the Console Administration**
> (`admin.intra.etsmalterre.com/agents/trm`, `/automates/trm`, repo `admin-malterre`), no longer in
> TRM's menu; the old URLs redirect. The API side below is unchanged (same mounts, same
> TRM keys, read from TRM's store by the console's TRM sections), plus the console gate
> (`exigerConsole`, ETM `lib/console-acces.ts`).

TRM's own « Agents IA » menu since 2026-10-01: the same two screens as ETM's, over
TRM's own agents and automates. Today TRM has **one agent**, « Planning atelier »
(LIVA #1296, started from Atelier › Planning only — dossier `atelier-planning.md`), and **two automates**, the
pointage report emails (dossier `rapports-pointage-email.md`), which moved here from
ETM's menu the same day. Vidéosurveillance stays ETM's (it reads the TRM planning, but
it drives the factory's NVR and was ETM's from the start).

## Where it lives

- **Screens = ETM's files**, imported in `router.tsx`: `@etm/pages/AgentsIa` with
  `basePath="/agents-ia-trm"`, `@etm/pages/Automates` with `basePath="/automates-trm"`.
  `basePath` is the only per-app difference (the page hands it to its tabs and dialogs
  through `BaseApiProvider` / `useBaseApi()` in ETM's `components/agents-ia/commun.tsx`).
  Edit them in ETM. `src/components/agents-ia/commun.tsx` here is a one-line shim
  (`export * from '@etm/…'`) — keep it a shim, or the page and its tabs would read two
  different contexts.
- **API = one route set per screen, mounted once per app** (`ETM/apps/api/src/index.ts`):
  `/api/agents-ia` + `/api/automates` for ETM, `/api/agents-ia-trm` + `/api/automates-trm`
  for TRM (`createAgentsIaRouter(scope)` / `createAutomatesRouter(scope)`). The scope
  (`lib/agents/app-scope.ts`) decides which catalog entries a mount lists and which
  permission store it checks. **An entry of the other app answers 404.**
- **Which app owns a job = `app: 'trm'` on its catalog entry** (`lib/agents/catalog.ts`,
  `lib/automates/catalog.ts`; absent = ETM). Moving a job between apps is that one word:
  slug, stored state, runs and retours stay where they are. The engine
  (`lib/agents/scheduler.ts`) runs every job regardless of app.

## Rights

- Menu `screen_agents_ia` in TRM's Écrans axis, **`seed: false`** (granted person by
  person — `seed-screen-access-trm.ts --menu screen_agents_ia --write` would hand it to
  everyone, don't). Reading needs only the menu.
- `edit_agents_ia` (piloter : mode, « Lancer maintenant », retours) and
  `evaluer_agents_ia` (noter un run d'agent) in **TRM's** catalog
  (`permission-keys-trm.ts`), checked server-side on every write of the TRM mounts. An
  ETM grant of the same key gives nothing here, and vice versa.
- The subscribers of the two emails are chosen in the automate's **« Destinataires »** right-sidebar
  tab (2026-10-02 — Paramètres › Utilisateurs › Notifications before, removed from TRM).
  Generic: an automate declaring `abonnement` in its catalog entry gets the tab
  (`lib/automates/abonnement.ts`, routes `/:slug/destinataires`, `/apercu`, `/envoyer-test`
  in `routes/automates.ts`); the switches need `edit_agents_ia`, the preview and the test
  send need the right to read the report (`peutLire` = the Pointage menu). A run keeps subject, counts and addresses, never the salariés' hours —
  so an Agents IA reader needs no Pointage menu.

## Notes

- `/agents-ia` lands on **Automates** here (ETM lands on Agents).
- An agent with `declenchement: { type: 'ecran' }` (Planning atelier) has no « Lancer
  maintenant » and no mailbox card; its runs open `PlanningRunDialog` (ETM `AgentsIa.tsx`), and
  a run nobody validated reads « Non validé » (a réussite by default), never « À évaluer ».
- Modes and history of the two automates did not move or reset — same slugs, same
  `data/automates/` state.
