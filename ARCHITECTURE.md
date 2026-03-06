# ARCHITECTURE.md

Current scope
- This document defines Ralph loop Harness v0.2: task-driven orchestration plus a deployable backend/frontend skeleton.

Core modules
- `Memory`
  - Reads and writes `TASKS.md` and `PROGRESS.md`.
- `Selector`
  - Computes executable tasks from status and dependencies.
  - Delegates final choice to a fresh Codex invocation.
- `AgentInvoker`
  - Executes the selected task in a fresh session.
- `Verifier`
  - Runs `command`, `file_exists`, `http_status`, `http_json`, and `http_contains` checks.
- `StateRecorder`
  - Persists status transitions and append-only progress.
- `Controller`
  - Orchestrates one iteration end to end.

Application surfaces
- `src/ralph-loop.ts`
  - Root CLI for loop status, single-iteration, and full-loop execution.
- `apps/api`
  - Fastify backend for Railway.
  - Exposes `/health` as the canonical public smoke endpoint.
- `apps/web`
  - Next.js frontend for Vercel.
  - Renders live backend status using `API_BASE_URL`.
- `scripts/deploy-smoke.mjs`
  - Polls the public Railway and Vercel URLs after deploy.

Execution stack
- Root package scripts handle the Ralph harness and workspace orchestration.
- `npm run api:*` targets the Railway backend workspace.
- `npm run web:*` targets the Vercel frontend workspace.
- GitHub Actions `ci` validates the repo before deploy.
- GitHub Actions `deploy-smoke` verifies the deployed URLs after `ci` on `main`.

Data flow
1. Controller reads `TASKS.md` and `PROGRESS.md`.
2. Selector computes executable candidates.
3. Fresh Codex chooses one candidate.
4. Agent executes the task.
5. Verifier runs task-declared checks.
6. StateRecorder persists status and progress.
7. Provider deploys are validated by public smoke checks.

State artifacts
- `TASKS.md`
  - durable planning queue and acceptance contract
- `PROGRESS.md`
  - append-only execution log
- `RUNBOOK.md`
  - operating procedure and recovery logic
- `railway.json`
  - Railway deployment configuration
- `.github/workflows/*.yml`
  - CI and post-deploy smoke automation

Control invariants
- No task is complete without all required checks passing.
- `TASKS.md` and `PROGRESS.md` remain the durable memory.
- Production deployment health must be mechanically verifiable.

Near-term non-goals
- Parallel task execution
- AI self-declared success without checks
- Multi-environment preview/staging parity
- Database-backed product features
