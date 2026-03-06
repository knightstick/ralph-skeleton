# RUNBOOK.md

Purpose
- Shared operating instructions for every Ralph loop invocation.
- Keep this concise and deterministic so a fresh context can recover immediately.

Loop startup sequence
1. Read `ARCHITECTURE.md` (how harness pieces fit together).
2. Read `RUNBOOK.md` (operating rules and recovery).
3. Read `TASKS.md` and identify the executable candidate set:
   - `status in {pending, blocked, failed}`
   - all `dependencies` are `done`
4. Read `PROGRESS.md` for last failure context.
5. Let a fresh Codex selector choose exactly one task from the candidate set using current repo state.
6. Execute the chosen task, verify it, record the outcome, and commit that iteration.
7. Repeat with a fresh selector until `Ready: none` or a failed iteration stops the run.
8. Run the full outer loop via `npm run loop:run`.
9. Use `npm run once` only when you explicitly want a single iteration.

Initial bootstrap
1. Install dependencies: `npm install`
2. Verify queue: `npm run loop:status`
3. Execute the full loop: `npm run loop:run`

Hardcoded agent settings
- agent: `codex exec`
- model: `gpt-5.4`
- reasoning effort: `high`

Task execution rules
- Start only from a clean git worktree.
- Keep scope atomic. If output becomes large or multi-step, split before tasking.
- Do not edit unrelated files.
- Do not mark task complete until all declared checks pass.
- Stream Codex stdout/stderr so execution progress is visible to the operator.
- Commit each completed loop iteration so repo state is checkpointed immediately.
- On failure:
  - log check name, exit code, and first failure detail
  - set task status to `failed` in `TASKS.md`
  - decide one fallback action in progress notes:
    - retry once
    - split into subtask ids
    - escalate for human review

Fresh context checklist
- Agent should only receive:
  - selected task entry from `TASKS.md`
  - relevant acceptance checks from that task
  - this `RUNBOOK.md`
- Avoid scanning unrelated project files unless explicitly needed by the task.
- The harness is responsible for invoking Codex; the human operator should not build a separate agent command for normal runs.

State update rules
- `TASKS.md` is mutable for `status` updates only.
- `PROGRESS.md` is append-only.
- A successful run must produce exactly one new progress entry.

Failure categories
- `validation`
  - malformed tasks or missing required fields
- `unsupported_check`
  - unsupported check type in TASKS.md
- `execution`
  - check command failed or timed out
- `environment`
  - missing binaries/dependencies
- `agent`
  - agent command failed
- `human_decision`
  - ambiguous scope or unsafe assumptions

Default failure policy
- If `execution` fails: retry once in operator's next cycle if command-level and safe, otherwise mark `blocked`.
- If `validation` fails: stop and fix task format first.
- If `environment` fails: note remediation commands and mark task `blocked`.
- If `human_decision` is required: pause with clear notes and request review.

Follow-up format
- Every progress entry must include:
  - ready task ids after the run
  - fallback if blocked
  - expected owner for follow-up

Command examples
- Check queue: `npm run loop:status`
- Run the full loop: `npm run loop:run`
- Run one iteration only: `npm run once`
