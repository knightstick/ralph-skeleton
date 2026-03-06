# ARCHITECTURE.md

Current scope
- This document defines Ralph loop Harness v0.1 (state-first, task-driven, verification-first).

Core modules (target)
- `Memory`
  - Reads/writes `TASKS.md`, `PROGRESS.md`.
  - Validates task schema and status transitions.
- `Selector`
  - Computes the executable candidate set by status/dependencies.
  - Delegates final task choice to a fresh agent invocation.
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
  - `npm run once` → alias for single-iteration execution.
  - `npm run typecheck` → static validation of loop implementation.
  - `npm run loop:status` → queue inspection before execution.

Data flow
1. Controller reads `TASKS.md` and `PROGRESS.md`.
2. Selector computes executable candidates.
3. A fresh Codex selector chooses one candidate to run.
4. `src/ralph-loop.ts` runs only that chosen task.
5. Verifier evaluates declared checks.
6. StateRecorder persists status and progress entry.
7. Loop ends on queue exhaustion, hard failure threshold, or manual stop.

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
- Deployment-first branch of task types (local deploy, remote smoke-check).
