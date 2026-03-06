# RUNBOOK.md

Purpose
- Shared operating instructions for every Ralph loop invocation.
- Keep this concise and deterministic so a fresh context can recover immediately.

Loop startup sequence
1. Read `ARCHITECTURE.md`.
2. Read `RUNBOOK.md`.
3. Read `TASKS.md` and compute the executable candidate set:
   - `status in {pending, blocked, failed}`
   - all `dependencies` are `done`
4. Read `PROGRESS.md` for the latest failure or deploy context.
5. Let a fresh Codex selector choose exactly one task.
6. Execute the chosen task, verify it, record the outcome, and commit that iteration.
7. Repeat until `Ready: none` or a failed iteration stops the run.

Initial bootstrap
1. Install dependencies: `npm install`
2. Verify queue: `npm run loop:status`
3. Verify builds:
   - `npm run api:build`
   - `npm run web:build`
4. Execute the loop: `npm run loop:run`

Hardcoded agent settings
- agent: `codex exec`
- model: `gpt-5.4`
- reasoning effort: `high`

Task execution rules
- Start only from a clean git worktree.
- Keep scope atomic.
- Do not edit unrelated files.
- Do not mark a task complete until all required acceptance checks pass.
- Stream Codex stdout/stderr so execution progress is visible.
- Commit each completed loop iteration immediately.

Fresh context checklist
- Agent should only receive:
  - the selected task entry from `TASKS.md`
  - relevant acceptance checks from that task
  - this `RUNBOOK.md`
- Avoid scanning unrelated project files unless required by the task.

State update rules
- `TASKS.md` is mutable for `status` updates and queue expansion.
- `PROGRESS.md` is append-only.
- Successful direct user-requested work should still be recorded in `PROGRESS.md`.

Failure categories
- `validation`
- `unsupported_check`
- `execution`
- `environment`
- `agent`
- `human_decision`

Supported acceptance checks
- `command`
- `file_exists`
- `http_status`
- `http_json`
- `http_contains`

Default failure policy
- If `execution` fails: retry once if safe, otherwise mark `blocked`.
- If `validation` fails: stop and fix task format first.
- If `environment` fails: note remediation commands and mark `blocked`.
- If `human_decision` is required: pause and request review.

Command examples
- Check queue: `npm run loop:status`
- Run the full loop: `npm run loop:run`
- Run one iteration only: `npm run once`
- Legacy app typecheck: `npm run app:typecheck`
- Legacy app build: `npm run app:build`
- API typecheck: `npm run api:typecheck`
- API build: `npm run api:build`
- API start: `PORT=4010 npm run api:start`
- Web typecheck: `npm run web:typecheck`
- Web build: `npm run web:build`
- Web start: `API_BASE_URL=http://127.0.0.1:4010 PORT=4011 npm run web:start`
- Deploy smoke: `npm run smoke:deploy`

Production handoff
1. Confirm Railway uses `railway.json`.
2. Confirm Railway healthcheck is `/health`.
3. Confirm Vercel root directory is `apps/web`.
4. Confirm `API_BASE_URL` is set in Vercel.
5. Confirm GitHub secrets `BACKEND_PROD_URL` and `FRONTEND_PROD_URL` exist.
