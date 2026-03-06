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

## Troubleshooting
- Validation or parse issues are recorded in `PROGRESS.md` under `failure_category: validation`.
- Execution issues are recorded as `failure_category: execution` or `environment`.
- If `loop:run` refuses to start, clean or commit existing local changes first.
