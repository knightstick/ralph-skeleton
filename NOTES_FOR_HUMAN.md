# Notes for Human Operator

You are running a Ralph loop harness. Use this as your only source of progress.

1) Start here every time (idempotent)
- `npm install` (if node_modules is missing)
- `git pull` (only if you want remote updates)
- `npm run loop:status`

If this is your first run in a fresh session, stop after status and continue from step 2.

Quick interpretation:
- `Next: none` = queue is done or blocked; check `TASKS.md` for dependencies/status
- `Pending > 0` = runnable tasks exist or may need unblocked
- If `failed`/`blocked` counters are >0, continue with step 4 before retrying

2) Run the loop
- `npm run once`
- If a task passes, `STATUS` moves forward automatically.
- If a task fails:
  - Read `PROGRESS.md` (latest entry shows `result`, `failure_category`, and failing checks).
  - Fix only files for that task.
  - Re-run `npm run once`.
- Repeat `npm run once` until status moves.

3) Track queue
- Read `TASKS.md` for the active task:
  - pending tasks are blueprinted at the top of the block
  - in_progress is the currently executing task
- Read `PROGRESS.md` for failure context and previous agent prompts.
- Keep scope within the selected task only

4) Manual app verification (when app tasks are available)
Run these only after app tasks enter the queue:
- `npm run app:typecheck`
- `npm run app:build`
- `npm run app:start`

5) Recovery
- If the last command line is `Usage: ...`, it is usually a task check command failure (command itself, not a parser/runtime issue).
- If you see `Validation error` from `loop:status`, inspect the task block in `TASKS.md` around the cited line.
  - Common YAML breakpoints: `command`/`notes` containing `:` or quotes, bad indentation, mixed block styles.
- If you see `RESULT` fail in `PROGRESS.md` but checks are blank, treat as command execution plumbing or parser regression.
- If blocked by environment/tooling (`validation`/`environment` category), fix tooling first (`node`, `tsx`) and rerun.

Keep commits small and focused; no extra files unless task requires them.
