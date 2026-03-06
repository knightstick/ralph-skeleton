# Ralph Loop Harness

## Requirements
- Node.js (npm)
- Codex CLI (`codex`) authenticated locally

## Quickstart
1. Install dependencies:
   - `npm install`
2. Inspect current state:
   - `npm run loop:status`
3. Run the full Ralph loop:
   - `npm run loop:run`
4. Check progress file updates:
   - `cat PROGRESS.md`

Each iteration now runs Codex automatically with hardcoded settings:
- agent: `codex exec`
- model: `gpt-5.4`
- reasoning effort: `high`
- live Codex stdout/stderr is streamed during execution
- the git worktree must be clean before `loop:run`
- every loop iteration auto-commits its resulting changes

## Core scripts
- `npm run loop:status`  
  Show queue state plus the current ready task set.
- `npm run loop:run`  
  Run the outer Ralph loop until `Ready: none` or the first failed iteration.
- `npm run once`  
  Run exactly one Ralph iteration.
- `npm run typecheck`  
  Run TypeScript type-check for harness code.

## App Operator Runbook
Run these from the repository root when handing the app off or validating a local startup path:

1. Verify app types:
   - `npm run app:typecheck`
2. Produce the app build output:
   - `npm run app:build`
3. Run the app health smoke check:
   - `npm run app:health`
   - expected output: `ralph-app:ok`
4. Start the app from the CLI:
   - `npm run app:start`
   - expected output: `ralph-app:ok`

If any command fails, stop the handoff and capture the failing command plus output in `PROGRESS.md`.

## Troubleshooting
- Validation or parse issues are recorded in `PROGRESS.md` under `failure_category: validation`.
- Execution issues are recorded as `failure_category: execution` or `environment`.
- If `loop:run` refuses to start, clean or commit existing local changes first.
