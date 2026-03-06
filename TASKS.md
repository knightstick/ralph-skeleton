# TASKS.md

Purpose
- Canonical queue and contract for all Ralph loop work.
- This file is the machine-readable + human-readable source of truth for what should be done next.

Status values
- `pending`
- `in_progress`
- `blocked`
- `done`
- `failed`

Task schema (required fields)
- `id` — stable unique task ID (`T-001`, `INFRA-01`).
- `title` — short title.
- `status` — one of the status values above.
- `priority` — advisory integer for the selector agent.
- `dependencies` — list of other task ids that must be `done`.
- `owner` — intended executor (`agent` by default).
- `objective` — exact outcome to deliver.
- `acceptance` — list of deterministic checks required for completion.
- `notes` — optional context.

Selection rule
- The harness computes executable candidates as tasks whose `status` is `pending`, `blocked`, or `failed` and whose `dependencies` are all `done`.
- A fresh selector agent chooses one candidate to run based on current repo state.

Format
```yaml
- id: T-000
  title: Short task title
  status: done
  priority: 10
  dependencies: [T-000]
  owner: agent
  objective: |
    Specific, testable outcome in one sentence.
  acceptance:
    - type: command
      command: pnpm test
      required: true
      timeout_seconds: 120
    - type: file_exists
      path: src/main.ts
      required: true
  notes: Optional context for this task.
```

Task lifecycle rules
- The loop must set `status: in_progress` before execution.
- On success, set `status: done` and add outputs/references to `PROGRESS.md`.
- On failure, set `status: failed` and log failure reason + failing checks in `PROGRESS.md`.
- Tasks should be atomic: independent, narrow, one session in scope.

Tasks
- id: T-001
  title: Create loop memory contract files
  status: done
  priority: 1
  dependencies: []
  owner: agent
  objective: |
    Add the canonical loop memory files and task contract so future agent sessions can resume with stable state.
  acceptance:
    - type: command
      command: test -f TASKS.md && test -f PROGRESS.md && test -f RUNBOOK.md && test -f ARCHITECTURE.md
      required: true
      timeout_seconds: 10
    - type: file_exists
      path: TASKS.md
      required: true
    - type: file_exists
      path: PROGRESS.md
      required: true
    - type: file_exists
      path: RUNBOOK.md
      required: true
    - type: file_exists
      path: ARCHITECTURE.md
      required: true
  notes: Seed task completed now to establish baseline memory.

- id: T-002
  title: Design minimal loop task parser
  status: done
  priority: 10
  dependencies: [T-001]
  owner: agent
  objective: |
    Define and implement a parser in the harness for TASKS.md task objects with strict field validation.
  acceptance:
    - type: command
      command: npx tsx -e "import { parseTasks } from './src/ralph-loop-core.ts'; const [tasks] = parseTasks('TASKS.md'); if (tasks.length < 4) process.exit(1); if (!tasks.some((task) => task.id === 'T-002')) process.exit(1);"
      required: true
      timeout_seconds: 10
  notes: Follow-up task for Phase 2.

- id: T-003
  title: Add deterministic check runner
  status: done
  priority: 20
  dependencies: [T-002]
  owner: agent
  objective: |
    Add command execution with structured exit-code reporting and timeout handling for lint/typecheck/tests/build.
  acceptance:
    - type: command
      command: |
        npx tsx -e "import { runCheck } from './src/ralph-loop-core.ts'; const ok = runCheck({type: 'command', command: 'exit 0', timeout_seconds: 1, required: true}); if (ok.status !== 'pass') process.exit(1); const timeoutFail = runCheck({type: 'command', command: 'sleep 2', timeout_seconds: 1, required: true}); if (timeoutFail.status !== 'fail' || timeoutFail.failure_category !== 'execution') process.exit(1);"
      required: true
      timeout_seconds: 20
  notes: Follow-up task for Phase 2.

- id: T-004
  title: Implement bootstrap runbook and failure playbook
  status: done
  priority: 30
  dependencies: [T-001]
  owner: agent
  objective: |
    Publish operational instructions for loop starts, context loading, and recovery from failed checks.
  acceptance:
    - type: command
      command: test -f RUNBOOK.md && test -f ARCHITECTURE.md
      required: true
      timeout_seconds: 10
  notes: Provides operator guidance while harness matures.

- id: T-005
  title: Add runnable app scaffold
  status: done
  priority: 40
  dependencies: [T-003, T-004]
  owner: agent
  objective: |
    Create a minimal TypeScript app skeleton under `src/app/` with a single entrypoint and a named health contract file.
  acceptance:
    - type: file_exists
      path: src/app/index.ts
      required: true
    - type: file_exists
      path: src/app/health.ts
      required: true
  notes: "Atomic change: only introduces two concrete files for app entry and health contract."

- id: T-006
  title: Add app-level TypeScript config and scripts
  status: done
  priority: 50
  dependencies: [T-005]
  owner: agent
  objective: |
    Add `tsconfig.app.json` and app scripts in `package.json` for typecheck, build, and start.
  acceptance:
    - type: file_exists
      path: tsconfig.app.json
      required: true
    - type: command
      command: node -e "const fs=require('node:fs'); const pkg=JSON.parse(fs.readFileSync('package.json','utf8')); const scripts=pkg.scripts||{}; ['app:typecheck','app:build','app:start'].forEach((name)=>{ if(!scripts[name]) process.exit(1); });"
      required: true
      timeout_seconds: 20
    - type: command
      command: node -e "const fs=require('node:fs'); const cfg=JSON.parse(fs.readFileSync('tsconfig.app.json','utf8')); if (!cfg.compilerOptions || !Array.isArray(cfg.include) || !cfg.include.includes('src/app/**/*')) process.exit(1);"
      required: true
      timeout_seconds: 20
  notes: Ensures deterministic app toolchain exists before executing app logic tasks.

- id: T-007
  title: Add deterministic app typecheck and build verification
  status: done
  priority: 60
  dependencies: [T-006]
  owner: agent
  objective: |
    Wire app scripts to actual verifier-compatible checks so typecheck and build are machine-asserted each iteration.
  acceptance:
    - type: command
      command: npm run app:typecheck
      required: true
      timeout_seconds: 60
    - type: command
      command: npm run app:build
      required: true
      timeout_seconds: 120
  notes: Deterministic checks are command-based and directly validate TypeScript correctness/bundling.

- id: T-008
  title: Add executable health smoke contract
  status: done
  priority: 70
  dependencies: [T-007]
  owner: agent
  objective: |
    Add a small scriptable health check check that can be run without external services or credentials.
  acceptance:
    - type: command
      command: npx tsx -e "import('./src/app/health.ts').then(() => process.exit(0)).catch(() => process.exit(1))"
      required: true
      timeout_seconds: 20
    - type: command
      command: npx tsx -e "import('./src/app/index.ts').then(() => process.exit(0)).catch(() => process.exit(1))"
      required: true
      timeout_seconds: 20
  notes: Keeps smoke validation close to the declared app contract and lightweight.

- id: T-009
  title: Publish app runbook for operator handoff
  status: done
  priority: 80
  dependencies: [T-008]
  owner: agent
  objective: |
    Update README with a short operator runbook for running app typecheck/build and startup checks from the CLI.
  acceptance:
    - type: command
      command: npx tsx -e "const fs=require('node:fs'); const text=fs.readFileSync('README.md','utf8'); if (!text.includes('app')) process.exit(1);"
      required: true
      timeout_seconds: 20
    - type: command
      command: test -f RUNBOOK.md && grep -q 'app:typecheck' RUNBOOK.md
      required: true
      timeout_seconds: 20





