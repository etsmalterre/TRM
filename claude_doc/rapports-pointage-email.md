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
  - `lib/rapports-pointage-envoi.ts` — reads, recipients, sending, **the timer**.
  - `routes/notifications-trm.ts` → `/api/notifications-trm` (`keys`, `users`, `users/:id`,
    `apercu/:key?jour=`, `envoyer-test/:key?jour=`).
- Web: `apps/web/src/pages/SettingsUtilisateurs.tsx` → `NotificationsTab`.

## The timer

In the API process (`demarrerRapportsPointage()` from `index.ts`), a tick every minute.
⚠️ **Runs only when `NODE_ENV=production`** — a dev or worktree API never mails anyone
(`RAPPORTS_POINTAGE=off` disables it in prod, `=on` forces it). The journal
`data/rapports-pointage-envois.json` stores the day each report went out, **written before
sending**: at most once a day, and an API down at 09:00 sends when it comes back the same
day. No catch-up of a previous day. Sender `tricotbot@etsmalterre.com` (display « TRM -
Pointage »), impersonated through the Gmail domain-wide delegation;
`RAPPORTS_POINTAGE_FROM` overrides. No email when nobody clocked in / no balance.

## Recipients

Subscribed **and** holding the menu « Pointage » (`screen_pointage`, or the admin) **and** having an address in
`user-emails.json`. The tab locks the switch without the right (a lock line names it), the
PUT refuses a NEW subscription without it (409 `permission_requise`, switching off always
allowed), and the sender skips a subscriber who lost it (logged). No admin bypass on
subscriptions: nobody is subscribed by default.

## Daily report rules (decisions 2026-09-22)

Data = `lst_horaire` (the truth — n8n read the `lst_pointage` twin, buggy since Dec. 2025),
lines whose `DATE` is the day (a night shift sits on its evening). Covered days: the day
before; **on Monday, Friday + Saturday + Sunday** (n8n: Friday only). Stamps rounded to the
minute from 31 s up (n8n rule).

Two populations:
- **On shift** = the salarié's bonnetier (`lst_salarie.id_mps`) has a `planning_bonnetier`
  row starting that day. Late > planned start + 5 min, early < planned end − 5 min, total
  pause > **20 min**. The gap between two lines counts as pause. Planned but never clocked
  → listed, « aucun pointage ».
- **Day hours** = everyone else, expected **09:00–12:00 / 14:00–18:00** (18:00 assumed —
  Vincent wrote 20:00, the real departures are ~18:00; confirm). Late > 09:05, back from
  lunch > 14:05, leaving < 17:55, one line across 12:00–14:00 = « pause de midi non
  pointée ». The lunch gap is **not** a pause.
- Both: an open line followed by another line = « sortie non pointée entre X et Y » (n8n
  hid it and inflated the day); an open last line = « fin de poste non pointée ».

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
- Preview any past morning: `GET /api/notifications-trm/apercu/notif_rapport_pointage?jour=YYYYMMDD`
  (admin cookie), or the « Aperçu » link in the tab.
- « M’envoyer un test » sends the report to the viewing admin only (works in dev too: it is
  a real Gmail send).
