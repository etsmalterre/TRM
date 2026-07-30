# Worktree Status Skill (TRM)

## When to use

Invoke with `/worktree-status` to see every active feature worktree at a glance — across
**both** projects (ETM and TRM), since they share one registry: which slot it's on
(TRM slots show as `trm:N`), its project, whether its servers are alive, whether the web
port is actually serving, how far the branch is ahead/behind `origin/master`, and which
slots are free per project (NG `300N`/`808N` vs TRM `517N`).

> The status script lives in the sibling **ETM** checkout (single source of truth), but
> it reads the shared registry at `~/.claude/mps-worktrees.json`, so it reports the same
> thing no matter which repo you call it from.

## Steps

1. **Run the status script** (hosted in ETM):
   ```bash
   node C:/dev/etsmalterre/ETM/scripts/worktree/status.mjs
   ```

2. **Relay the output** to the user: per-slot health (UP / PARTIAL / DOWN), URLs, branch
   divergence, and the free slots per project.

3. **If it flags stale entries** (servers dead or the worktree missing on disk), offer to
   clean them. For each stale slot/feature the user confirms:
   ```bash
   node C:/dev/etsmalterre/ETM/scripts/worktree/down.mjs <slot-or-feature> --remove
   ```
   (omit `--remove` to just free the slot while keeping the worktree on disk).
