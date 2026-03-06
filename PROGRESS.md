# PROGRESS.md

Purpose
- Append-only execution log used by the Ralph loop.
- Each iteration should record attempt, check outcomes, and explicit next action.

Entry schema (append one entry per loop iteration)
- `timestamp_utc` — ISO-8601 timestamp.
- `task_id` — task identifier from `TASKS.md`.
- `agent_prompt` — concise task statement passed to the agent.
- `checks` — each check name + command + status (`pass` / `fail` / `skip`) + exit code.
- `stdout_excerpt` — short excerpt of key output if failed (or successful verification summary).
- `result` — `success` or `fail`.
- `next` — chosen next task id.
- `notes` — human notes and follow-up.

Format
```yaml
- timestamp_utc: 2026-03-06T12:00:00Z
  task_id: T-002
  agent_prompt: "Run T-002 with strict validation."
  result: success
  checks:
    - name: lint
      status: pass
      exit_code: 0
      command: pnpm lint
  stdout_excerpt: |
    All checks passed.
  next: T-003
  notes: |
    Parser strict validation added; one edge case deferred for T-003.
```

Log
- Start with one bootstrap entry for the repository-memorialization step.

- timestamp_utc: 2026-03-06T00:00:00Z
  task_id: T-001
  agent_prompt: "Create loop memory contract files and task schema."
  result: success
  checks:
    - name: file_presence
      status: pass
      exit_code: 0
      command: "test -f TASKS.md && test -f PROGRESS.md && test -f RUNBOOK.md && test -f ARCHITECTURE.md"
  stdout_excerpt: |
    Required files created: TASKS.md, PROGRESS.md, RUNBOOK.md, ARCHITECTURE.md.
  next: T-004
  notes: |
    Baseline memory files initialized.

- timestamp_utc: 2026-03-06T09:25:45Z
  task_id: unknown
  agent_prompt: TASKS.md validation
  result: fail
  failure_category: validation
  checks:
  stdout_excerpt: |
    Invalid task block near line 56: not a mapping
  next: none
  notes: |
    Failed while parsing TASKS.md


- timestamp_utc: 2026-03-06T09:26:54Z
  task_id: unknown
  agent_prompt: TASKS.md validation
  result: fail
  failure_category: validation
  checks:
  stdout_excerpt: |
    Invalid task block near line 56: not a mapping
  next: none
  notes: |
    Failed while parsing TASKS.md


- timestamp_utc: 2026-03-06T09:27:19Z
  task_id: unknown
  agent_prompt: TASKS.md validation
  result: fail
  failure_category: validation
  checks:
  stdout_excerpt: |
    bad indentation of a mapping entry (16:23)
    
     13 |     - type: file_exists
     14 |       path: src/app/health.ts
     15 |       required: true
     16 |   notes: Atomic change: only introduces two concrete  ...
    ----------------------------^
  next: none
  notes: |
    Failed while parsing TASKS.md


- timestamp_utc: 2026-03-06T09:29:06Z
  task_id: T-002
  agent_prompt: Task T-002 | Design minimal loop task parser | Define and implement a parser in the harness for TASKS.md task objects with strict field validation.
  result: fail
  failure_category: execution
  checks:
    - name: command
      status: fail
      exit_code: 2
      failure_category: execution
      command: npx tsx -e "import { parseTasks } from './src/ralph-loop.ts'; const [tasks] = parseTasks('TASKS.md'); if (tasks.length < 4) process.exit(1); if (!tasks.some((task) => task.id === 'T-002')) process.exit(1);"
      required: true
  stdout_excerpt: |
    Usage:
      npm run loop:status
      npm run loop:run
      npm run loop:run -- --task-id T-002
      npm run loop:run -- --agent-cmd "echo done"
    
    Command failed: npx tsx -e "import { parseTasks } from './src/ralph-loop.ts'; const [tasks] = parseTasks('TASKS.md'); if (tasks.length < 4) process.exit(1); if (!tasks.some((task) => task.id === 'T-002')) process.exit(1);"
  next: none
  notes: |
    Execution failed; automatically retried once.


- timestamp_utc: 2026-03-06T09:39:45Z
  task_id: T-002
  agent_prompt: Task T-002 | Design minimal loop task parser | Define and implement a parser in the harness for TASKS.md task objects with strict field validation.
  result: fail
  failure_category: execution
  checks:
    - name: command
      status: fail
      exit_code: 1
      failure_category: execution
      command: npx tsx -e "import { parseTasks } from './src/ralph-loop-core.ts'; const [tasks] = parseTasks('TASKS.md'); if (tasks.length < 4) process.exit(1); if (!tasks.some((task) => task.id === 'T-002')) process.exit(1);"
      required: true
  stdout_excerpt: |
    node:internal/errors:496
        ErrorCaptureStackTrace(err);
        ^
    
    Error: listen EPERM: operation not permitted /var/folders/z3/y6wys29d36v24b98ws5dt7t40000gn/T/tsx-501/20475.pipe
        at Server.setupListenHandle [as _listen2] (node:net:1800:21)
        at listenInCluster (node:net:1865:12)
        at Server.listen (node:net:1964:5)
        at file:///Users/chris/Developer/ralph-skeleton/node_modules/tsx/dist/cli.mjs:53:31537
        at new Promise (<anonymous>)
        at createIpcServer (file:///Users/chris/Developer/ralph-skeleton/node_modules/tsx/dist/cli.mjs:53:31515)
        at async file:///Users/chris/Developer/ralph-skeleton/node_modules/tsx/dist/cli.mjs:55:459 {
      code: 'EPERM',
      errno: -1,
      syscall: 'listen',
      address: '/var/folders/z3/y6wys29d36v24b98ws5dt7t40000gn/T/tsx-501/20475.pipe',
      port: -1
    }
    
    Node.js v18.20.8
    
    Command failed: npx tsx -e "import { parseTasks } from './src/ralph-loop-core.ts'; const [tasks] = parseTasks('TASKS.md'); if (tasks.length < 4) process.exit(1); if (!tasks.some((task) => task.id === 'T-002')) process.exit(1);"
    node:internal/errors:496
        ErrorCaptureStackTrace(err);
        ^
    
    Error: listen EPERM: operation not permitted /var/folders/z3/y6wys29d36v24b98ws5dt7t4000
  next: none
  notes: |
    Execution failed; automatically retried once.


- timestamp_utc: 2026-03-06T09:40:09Z
  task_id: T-002
  agent_prompt: Task T-002 | Design minimal loop task parser | Define and implement a parser in the harness for TASKS.md task objects with strict field validation.
  result: success
  failure_category: none
  checks:
    - name: command
      status: pass
      exit_code: 0
      failure_category: none
      command: npx tsx -e "import { parseTasks } from './src/ralph-loop-core.ts'; const [tasks] = parseTasks('TASKS.md'); if (tasks.length < 4) process.exit(1); if (!tasks.some((task) => task.id === 'T-002')) process.exit(1);"
      required: true
  stdout_excerpt: |
    command=pass
  next: T-003
  notes: |
    Completed via ralph-loop.ts


- timestamp_utc: 2026-03-06T09:40:37Z
  task_id: T-003
  agent_prompt: Task T-003 | Add deterministic check runner | Add command execution with structured exit-code reporting and timeout handling for lint/typecheck/tests/build.
  result: success
  failure_category: none
  checks:
    - name: command
      status: pass
      exit_code: 0
      failure_category: none
      command: npx tsx -e "import { runCheck } from './src/ralph-loop-core.ts'; const ok = runCheck({type: 'command', command: 'exit 0', timeout_seconds: 1, required: true}); if (ok.status !== 'pass') process.exit(1); const timeoutFail = runCheck({type: 'command', command: 'sleep 2', timeout_seconds: 1, required: true}); if (timeoutFail.status !== 'fail' || timeoutFail.failure_category !== 'execution') process.exit(1);"

      required: true
  stdout_excerpt: |
    command=pass
  next: T-005
  notes: |
    Completed via ralph-loop.ts


- timestamp_utc: 2026-03-06T09:53:55Z
  task_id: unknown
  agent_prompt: Simplify harness to fixed Codex execution with hardcoded model and minimal operator surface.
  result: success
  failure_category: none
  checks:
    - name: typecheck
      status: pass
      exit_code: 0
      failure_category: none
      command: npm run typecheck
      required: true
    - name: loop_status
      status: pass
      exit_code: 0
      failure_category: none
      command: npm run loop:status
      required: true
  stdout_excerpt: |
    Hardcoded Codex execution is active with gpt-5.4 and high reasoning effort.
    Harness CLI reduced to status/run only.
    Queue remains ready at T-005.
  next: T-005
  notes: |
    Removed manual agent/task override paths, aligned docs with fixed Codex execution, and kept queue state unchanged.
