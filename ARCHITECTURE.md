# ARCHITECTURE.md

Current scope
- This document defines Ralph loop Harness v0.1 (state-first, task-driven, verification-first).

Core modules (target)
- `Memory`
  - Reads/writes `TASKS.md`, `PROGRESS.md`.
  - Validates task schema and status transitions.
- `Selector`
  - Selects the next executable task by status/priority/dependencies.
- `AgentInvoker`
  - Executes the selected task in a fresh, narrow context.
  - Provides strict minimal prompt and expected output.
- `Verifier`
  - Runs task-declared checks (`lint`, `typecheck`, `tests`, `build`, smoke endpoints, etc.).
  - Normalizes output to pass/fail plus reason.
- `StateRecorder`
  - Updates `TASKS.md` and appends to `PROGRESS.md`.
  - Never rewrites historical progress entries.
- `Controller`
  - Orchestrates one loop iteration end-to-end.
  - Enforces fail-fast rules and deterministic transitions.
- `src/ralph-loop.ts`
  - CLI entrypoint that implements the loop controller in TypeScript.
  - Supports `status` and `run` actions.

Execution stack
- `package.json` scripts:
  - `npm run loop:status` → `STATUS` view.
  - `npm run loop:run` → single-iteration execution.
  - `npm run typecheck` → static validation of loop implementation.

Data flow
1. Controller reads `TASKS.md` and `PROGRESS.md`.
2. Selector computes next task.
3. `src/ralph-loop.ts` runs only that task.
4. Verifier evaluates declared checks.
5. StateRecorder persists status and progress entry.
6. Loop ends on queue exhaustion, hard failure threshold, or manual stop.

State artifacts
- `TASKS.md`
  - durable planning queue + deterministic schema.
- `PROGRESS.md`
  - append-only execution log.
- `RUNBOOK.md`
  - operational procedure and recovery logic.
- `ARCHITECTURE.md`
  - this file.

Control invariants
- No task is considered complete without all required checks passing.
- `TASKS.md` and `PROGRESS.md` are the only long-lived state sources.
- Failures are explicit and machine-readable.

Non-goals (Phase 1)
- Parallel task execution.
- AI self-determined success checks.
- Fully dynamic task generation by agents.

Phase 2 targets
- Dependency DAG support beyond simple priority.
- Optional auto-commit on success.
- Deployment-first branch of task types (local deploy, remote smoke-check).
