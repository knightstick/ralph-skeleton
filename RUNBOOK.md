# RUNBOOK.md

Purpose
- Shared operating instructions for every Ralph loop invocation.
- Keep this concise and deterministic so a fresh context can recover immediately.

Loop startup sequence
1. Read `ARCHITECTURE.md` (how harness pieces fit together).
2. Read `RUNBOOK.md` (operating rules and recovery).
3. Read `TASKS.md` and identify next executable task:
   - `status == pending`
   - all `dependencies` are `done`
   - lowest `priority` first.
4. Read `PROGRESS.md` for last failure context.
5. Execute only that task.
6. Record outcome in `PROGRESS.md`.

Task execution rules
- Keep scope atomic. If output becomes large or multi-step, split before tasking.
- Do not edit unrelated files.
- Do not mark task complete until all declared checks pass.
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

State update rules
- `TASKS.md` is mutable for `status` updates only.
- `PROGRESS.md` is append-only.
- A successful run must produce exactly one new progress entry.

Failure categories
- `validation`
  - malformed tasks or missing required fields
- `execution`
  - check command failed or timed out
- `environment`
  - missing binaries/dependencies
- `human_decision`
  - ambiguous scope or unsafe assumptions

Default failure policy
- If `execution` fails and no code change was attempted: retry once then mark `blocked` (manual review).
- If `validation` fails: stop and fix task format first.
- If `environment` fails: note remediation commands and mark task `blocked`.
- If `human_decision` is required: pause with clear notes and request review.

Next action format
- Every progress entry must include:
  - next best task id
  - fallback if blocked
  - expected owner for follow-up
