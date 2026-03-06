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
