# Notes for Human Operator

You are running a Ralph loop harness.

This harness now runs Codex itself for each task.

Hardcoded agent settings for this experiment:
- agent: `codex exec`
- model: `gpt-5.4`
- reasoning effort: `high`

Use this file as the short, practical checklist.

1) Start here every time (idempotent)
- `npm install` (if node_modules is missing)
- `git pull` (only if you want remote updates)
- `npm run typecheck`
- `npm run loop:status`

If this is your first run in a fresh session, stop after status and continue from step 2.

Quick interpretation:
- `Next: T-XXX` = that is the next task the harness will hand to Codex
- `Next: T-XXX (retry blocked)` = re-run or fix that task first
- `Next: none` = queue is done, or something is inconsistent enough that you should inspect `TASKS.md`
- `Pending > 0` = there is still work left
- `Blocked > 0` or `Failed > 0` = inspect `PROGRESS.md` before doing anything else

2) Understand what `npm run once` now does
- `npm run once` only:
  - selects the next task
  - runs Codex on that task using the hardcoded settings above
  - runs that task's acceptance checks
  - updates `TASKS.md` and `PROGRESS.md`
- If Codex cannot complete the task, the run will fail and the failure will be recorded in `PROGRESS.md`.

3) The no-thinking loop
- Run `npm run loop:status`
- Read the `Next:` line
- Run `npm run once`
- If it passes:
  - the harness marks the task done
  - the next task appears in `npm run loop:status`
- If it fails:
  - open the newest entry in `PROGRESS.md`
  - inspect the failing task in `TASKS.md`
  - decide whether to retry immediately or patch the repo manually
  - run `npm run once` again
- Repeat until `Next: none`

4) Current expected workflow in this repo
- The harness-infrastructure tasks are already done.
- If `npm run loop:status` shows `Next: T-005`, that means you are now at the first real app-building task.
- At that point, `npm run once` will invoke Codex automatically against `T-005`.

5) Manual app verification (when app tasks are available)
Run these only after the matching app tasks exist:
- `npm run app:typecheck`
- `npm run app:build`
- `npm run app:start`

6) Recovery
- If the last command line is `Usage: ...`, it usually means a check imported the CLI entrypoint instead of a library module.
- If you see `Validation error` from `loop:status`, inspect the task block in `TASKS.md` around the cited line.
  - Common YAML breakpoints: `command`/`notes` containing `:` or quotes, bad indentation, mixed block styles.
- If you see `RESULT` fail in `PROGRESS.md` but checks are blank, treat as command execution plumbing or parser regression.
- If blocked by environment/tooling (`validation`/`environment` category), fix tooling first (`node`, `tsx`) and rerun.

7) Commands you will actually use most
- Check state: `npm run loop:status`
- Verify harness code: `npm run typecheck`
- Run one full Codex + verify iteration: `npm run once`

Keep commits small and focused; no extra files unless task requires them.
