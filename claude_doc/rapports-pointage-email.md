# Rapports de pointage par email (notifications TRM)

Built 2026-09-22 (worktrees `TRM-email-pointage` + `ETM-email-pointage`, branch
`feat/email-pointage`). Replaces two **n8n** workflows on VM 105 (`n8n.malterre`),
deactivated by Vincent the same day:

| n8n workflow | Schedule | Data (WebDev `localapi.malterre`) | Now |
|---|---|---|---|
| « pointage » | Mon–Fri 09:00 | `get_pointage` + `get_planning`, joined **by first name** | `notif_rapport_pointage` |
| « Bilan des Heures Annualisées » | Tue 09:00 | `get_bilan_horaire` | `notif_bilan_heures` |
| « claude_pointage » | (inactive since Jan.) | same as « pointage » | — |

Recipients used to be hardcoded (vincent, isabelle, l.tellier; Vincent got the daily one
twice — a second Gmail node). They are now **subscriptions**, ticked per user.

⚠️ n8n itself stays: « BL Processing (Gemini) » is active and uses `localapi`
(`load_bl_doc` / `load_bl_data`). Only the three pointage endpoints of `localapi` become dead.

## Where the code lives

⚠️ **The daily rules have a second reader** (2026-09-24): the pointage tablet shows a
salarié's last 7 worked days judged by them (`GET /api/pointage/salaries/:id/journees`). Both
go through `analyserJours(jours, idSalarie?)` in `lib/rapports-pointage-envoi.ts` — change a
rule once, both follow. Dossier `pointage-pwa.md` § « 7 derniers jours ».

- API (`ETM/apps/api/src`):
  - `lib/notification-keys-trm.ts` — TRM's catalog; each entry may `require` a stored TRM key,
    permission or menu grant (both reports: the menu `screen_pointage`, LIVA #1196).
  - `lib/notifications-trm.ts` — TRM's store `data/notifications-trm.json`, built by
    `createNotificationStore()` in `lib/notifications.ts` (ETM's store is the same factory).
  - `lib/rapport-pointage.ts` — **pure rules**, tested (`rapport-pointage.test.ts`).
  - `lib/rapport-pointage-email.ts` — markup, inside the standard card (`notification-email.ts`
    gained `appName` + `sections`, pre-rendered blocks with their text twin).
  - `lib/rapports-pointage-envoi.ts` — reads, recipients, sending.
  - `lib/automates/rapports-pointage/` — the schedule: two automates (TRM › Agents IA › Automates, `app: 'trm'`).
  - `abonnementRapport(key)` (same file) — the automate's « Destinataires » tab: candidates,
    switch, preview, test send (`lib/automates/abonnement.ts`, routes in `routes/automates.ts`:
    `/:slug/destinataires`, `/:slug/destinataires/:userId`, `/:slug/apercu?jour=`,
    `/:slug/envoyer-test`). `routes/notifications-trm.ts` is gone (2026-10-02).
- Web: ETM's `pages/Automates.tsx` → `DestinatairesPanel` (right-sidebar tab) (shared through `@etm`). TRM's
  Paramètres › Utilisateurs passes `NotificationsTab={null}`: no Notifications tab any more.

## The schedule

Since 2026-09-30 both reports are **automates** « Rapport de pointage » and « Bilan des
heures annualisées » (TRM › Agents IA › Automates since 2026-10-01, ETM's menu before — dossier
`agents-ia.md`) on the agents' engine: off / essai / actif,
« Lancer maintenant », every send listed with its recipients. ⚠️ **Runs only when
`NODE_ENV=production`** (`AGENTS_IA=off` disables it in prod). The day is written before
sending: at most once a day, and an API down at 09:00 sends when it comes back the same day.
No catch-up of a previous day. (2026-09-22 → 09-30 they had their own timer and journal
`data/rapports-pointage-envois.json`, read once by the automates so the deploy day never
sends twice; `RAPPORTS_POINTAGE` is gone.) Sender `tricotbot@etsmalterre.com` (display « TRM -
Pointage »), impersonated through the Gmail domain-wide delegation;
`RAPPORTS_POINTAGE_FROM` overrides. No balance → no weekly email.

**Anomalies only (2026-10-02, automate version 2).** Vincent: the rules are trusted now, a
daily mail listing everyone goes unread. The daily report lists only the salariés with at
least one alert (whole line kept, wrong times in red, « Aucun pointage » included) and the
days that have one; **no email at all when everything is in order** — the run says « Rien à
signaler » with no recipients, so silence is never confused with a dead automate. The
subject keeps the whole covered period; the intro reads « N pointages à vérifier sur M
salariés pointés ». The filter lives in `contenuRapportPointage` only: `analyserJours()`
still returns every line, the tablet's « 7 derniers jours » needs the days in order. The
Tuesday balance is unchanged (full table) — decided the same day.

## Recipients

Chosen in the automate's **« Destinataires »** tab (right sidebar, next to « Aperçu ») since 2026-10-02 (Paramètres ›
Utilisateurs › Notifications before; same store `data/notifications-trm.json`, nothing
migrated). The tab lists TRM's active person accounts that hold the menu « Pointage »
(`screen_pointage`, or the admin), plus anyone still subscribed without it (marked « n'a
plus le droit », can only be switched off). Switches need `edit_agents_ia`; « Aperçu » and
« M'envoyer un test » need the Pointage menu (the body carries hours). A NEW subscription
without the right is refused (409), and the sender skips a subscriber who lost it or has no
address (named in the run). No admin bypass on subscriptions: nobody is subscribed by default.

## Daily report rules (decisions 2026-09-22)

Data = `lst_horaire` (the truth — n8n read the `lst_pointage` twin, buggy since Dec. 2025),
lines whose `DATE` is the day (a night shift sits on its evening). Covered days: the day
before; **on Monday, Friday + Saturday + Sunday** (n8n: Friday only). Stamps rounded to the
minute from 31 s up (n8n rule).

Two populations:
- **On shift** = the salarié's bonnetier (`lst_salarie.id_mps`) has a `planning_bonnetier`
  row starting that day. Late > planned start + 5 min, early < planned end − 10 min, total
  pause > **20 min**. The gap between two lines counts as pause. Planned but never clocked
  → listed, « aucun pointage ».
- **Day hours** = everyone else, expected **09:00–12:00 / 14:00–18:00** (18:00 assumed —
  Vincent wrote 20:00, the real departures are ~18:00; confirm). Late > 09:05, back from
  lunch > 14:05, leaving < 17:50, one line across 12:00–14:00 = « pause de midi non
  pointée ». The lunch gap is **not** a pause.
- Both: an open line followed by another line = « sortie non pointée entre X et Y » (n8n
  hid it and inflated the day); an open last line = « fin de poste non pointée ».
- Both, **since 2026-09-24**: arriving more than **10 min early** or leaving more than
  **10 min late** is red too (`DEBORD_MAX_MIN`, « 15 min d’avance » / « 15 min plus tard »)
  — Vincent: the overlap is time the company pays for and does not need, and shift workers
  who hand over early are meant to change the habit. Exactly 10 min is in order (like 5
  min late).
- **Since 2026-10-05** (the 02/10 report, Mickael): leaving early gets **10 min**, not 5
  (`DEPART_AVANCE_MAX_MIN`; arriving late stays at 5), and a day-hours lunch more than
  **10 min shorter or longer** than `reprise − midi` is red (`REPAS_ECART_MAX_MIN`,
  « repas de 1 h 49 au lieu de 2 h 00 (11 min de moins) »). The lunch = the gap before the
  first line starting after noon. A too-long lunch replaces the « reprise » line (it says
  more); a 6–10 min late return on a normal-length lunch keeps it. ⚠️ **The two are never
  offset against each other**: Vincent wants 11 min early flagged even after a lunch 10 min
  short. Daunovan 16 min early and Marie 21 min of pause, same report, stay flagged.
  That change is the automate's **version 3**. ⚠️ Every rule change in
  `lib/rapport-pointage.ts` bumps `VERSION_RAPPORT` + a `VERSIONS_RAPPORT` note
  (`lib/automates/rapports-pointage/rapports-pointage.ts`) in the same commit — the 10-05
  rules first shipped without it and the « Retours » tab still read v2.

« Vincent: we'll improve as we go » — expect these to move. Known gap: a bonnetier on shift
missing from the planning is judged on day hours (the report then shows odd alerts).

## Weekly balance

`soldeHeures(id, semaineDeReference(now))` — the same « Solde annuel » as the tablet and
Pointage › Semaines (Σ lissage − Σ prev − Σ info up to last week). Parity with n8n's
`get_bilan_horaire` checked on prod data on 2026-09-22: 7/7 identical (Angelique +34:30 …
Nicolas +0:15). Thresholds: |x| > 10 h red, > 5 h amber, else green.

## Design

Validated by Vincent after three rounds (2026-09-22): no KPI tiles, no timeline — the red
« À vérifier » note in words, then one line per salarié: Début · Pause 1 · Pause 2 · Fin as
app-style pills (grey time, gold pause, red when wrong) · total pause. Names come in capitals
from `lst_salarie` → `prenomAffiche()`. No em / en dash in content (skill rule, tested).

## Checks

- `pnpm test` in `apps/api` (rules + content).
- Preview any past morning: `GET /api/automates-trm/rapport-pointage/apercu?jour=YYYYMMDD`
  (cookie with the Pointage menu), or « Aperçu » in the Destinataires tab.
- « M’envoyer un test » sends the report to the caller only (works in dev too: it is
  a real Gmail send).
