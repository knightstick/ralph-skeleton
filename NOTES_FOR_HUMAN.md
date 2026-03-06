# Notes for Human Operator

You are running a Ralph loop harness. Use this as your only source of progress.

1) One-time setup
- `npm install`
- `git pull` (if you expect remote updates)
- `npm run loop:status`

2) Run the loop
- `npm run once`
- If a task fails, fix only files for that task and re-run `npm run once`
- Repeat until queue moves forward

3) Track queue
- Read `TASKS.md` for next pending task
- Read `PROGRESS.md` for last failure context
- Keep scope within the selected task only

4) Manual app verification (when app tasks are available)
- `npm run app:typecheck`
- `npm run app:build`
- `npm run app:start`

5) Recovery
- If parser/check fails, inspect command output and rerun task once after fix
- If blocked by env/binary issues, resolve tooling first (`node`, `tsx`) then continue

Keep commits small and focused; no extra files unless task requires them.
