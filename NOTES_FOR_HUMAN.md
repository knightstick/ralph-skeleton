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
- `git status --short`

If this is your first run in a fresh session, stop after status and continue from step 2.

Quick interpretation:
- `Ready: ...` = executable tasks the harness has validated from `TASKS.md`
- `Next: chosen fresh by agent at run time` = the next Codex session will choose from the ready set using current repo state
- `Pending > 0` = there is still work left
- `Blocked > 0` or `Failed > 0` = inspect `PROGRESS.md` before doing anything else

2) Understand the two run modes
- `npm run loop:run`:
  - refuses to start if the git worktree is already dirty
  - keeps selecting fresh ready tasks and running them one by one
  - stops only when `Ready: none` or the first failed iteration
  - creates one git commit per iteration before continuing
- `npm run once` only:
  - refuses to start if the git worktree is already dirty
  - computes the current ready task set
  - asks a fresh Codex session to choose one task from that set
  - runs Codex on that task using the hardcoded settings above
  - streams live Codex stdout/stderr while the task is running
  - runs that task's acceptance checks
  - updates `TASKS.md` and `PROGRESS.md`
  - creates a git commit for that iteration before exiting
- If Codex cannot complete the task, the run will fail and the failure will be recorded in `PROGRESS.md`.

3) The no-thinking loop
- Run `npm run loop:status`
- Run `git status --short` and confirm it is empty
- Read the `Ready:` line
- Run `npm run loop:run`
- If it finishes cleanly:
  - the harness kept going task by task until `Ready: none`
  - the loop left behind one commit per iteration
- If it stops on a failure:
  - open the newest entry in `PROGRESS.md`
  - inspect the failing task in `TASKS.md`
  - decide whether to retry immediately or patch the repo manually
  - use `npm run once` for a single retry or rerun `npm run loop:run`
- Repeat until `Ready: none`

4) Current expected workflow in this repo
- The harness-infrastructure tasks are already done.
- If `npm run loop:status` shows a non-empty `Ready:` line, `npm run loop:run` will keep invoking a fresh Codex selector and executing those ready tasks until the queue is exhausted or a task fails.

5) Manual app verification (when app tasks are available)
Run these only after the matching app tasks exist:
- `npm run app:typecheck`
- `npm run app:build`
- `npm run app:start`

6) Recovery
- If `npm run loop:run` or `npm run once` refuses to start because the worktree is dirty, commit or clean those changes first.
- If the last command line is `Usage: ...`, it usually means a check imported the CLI entrypoint instead of a library module.
- If you see `Validation error` from `loop:status`, inspect the task block in `TASKS.md` around the cited line.
  - Common YAML breakpoints: `command`/`notes` containing `:` or quotes, bad indentation, mixed block styles.
- If you see `RESULT` fail in `PROGRESS.md` but checks are blank, treat as command execution plumbing or parser regression.
- If blocked by environment/tooling (`validation`/`environment` category), fix tooling first (`node`, `tsx`) and rerun.

7) Commands you will actually use most
- Check state: `npm run loop:status`
- Check cleanliness before a run: `git status --short`
- Verify harness code: `npm run typecheck`
- Run the full Ralph loop: `npm run loop:run`
- Run one iteration only: `npm run once`

Keep commits small and focused; no extra files unless task requires them.
