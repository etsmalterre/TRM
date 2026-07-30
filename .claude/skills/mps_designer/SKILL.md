# MPS Designer Skill (TRM → pointer to ETM)

## This skill is a pointer, on purpose. Read the canonical file first.

The Malterre design system has **one** source of truth, in the ETM checkout:

```
../ETM/.claude/skills/mps_designer/SKILL.md
```

**Step 1, mandatory: `Read` that file now**, then apply it. The relative path works
from the TRM main checkout *and* from any TRM worktree, because both are siblings of
`ETM` under `C:\dev\etsmalterre\` — the same invariant the `@etm` import alias already
depends on (see `CLAUDE.md` § Shared screens). Absolute path if you need it:
`C:\dev\etsmalterre\ETM\.claude\skills\mps_designer\SKILL.md`.

Everything in it applies to TRM unchanged: the three named layouts (Fiche / Tableau /
Classeur), the colour palette, the header trio, the unsaved-changes guard, the
responsive doctrine — all of it. TRM replicates ETM's design exactly.

## Why a pointer and not a copy — do NOT "helpfully" re-copy it

This file used to be a full 3,700-line duplicate of ETM's document, with a written
instruction in `CLAUDE.md` to "re-sync when it changes". That obligation was never
met, and on **2026-07-30** the copy was measured **709 lines behind** ETM's. The
drift was not cosmetic — the stale copy was actively wrong:

- it described **two** gold-standard layouts instead of three (no Classeur);
- every reference pointed at **pre-rename ETM filenames** that no longer exist
  (`Fournisseurs.tsx`, `FournisseursStock.tsx`, `/fournisseurs/gestion` — ETM renamed
  that whole route family to `/fils/*` long before);
- it still taught the **hand-rolled auto-select-first `useEffect`**, with zero mention
  of the shared `useAutoSelectFirst` hook that replaced it — the exact hook whose
  absence from TRM's `src/hooks/` broke this repo's build the same day.

A duplicated document with a sync obligation and no mechanism will always drift, and a
silently-wrong design system is worse than none: it reads authoritative. So the copy is
gone. If you find yourself pasting ETM's content back into this file, you are
re-creating that bug — improve ETM's copy instead. Editing it through the path above
*is* editing the one real file.

## The only TRM-specific deltas

These are the genuine differences, and they are the entire reason this file still
exists rather than being deleted outright:

- **Reference screens live in ETM.** When the design system says "grep the gold-standard
  screens", it means `../ETM/apps/web/src/pages/` — `Entreprises.tsx`, `FilsGestion.tsx`,
  `FilsStock.tsx`, `FilsCommandes.tsx`, `EtudesColoris.tsx`. TRM has no local equivalents
  to grep.
- **`@/` inside a shared screen resolves to TRM's own `src`.** A screen imported from ETM
  via `@etm/pages/...` uses **TRM's** local copies of components / lib / hooks. So when
  ETM's design doc introduces a new shared component or hook, TRM needs its own copy of
  it before a shared screen can use it. Keep those copies in sync with ETM — this is the
  drift risk that remains after collapsing this file, and it is what bit
  `useAutoSelectFirst`.
- **Logos are placeholders.** `public/logo-full.png` / `logo-small.png` are still the ETM
  logos; swap them when TRM artwork exists.
- **Deploy is `/trm_deploy`** (web bundle only). The shared API ships from ETM via
  `/etm_deploy`, and when a feature spans both, the API goes first.
