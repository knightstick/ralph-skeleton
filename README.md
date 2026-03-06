# Ralph Loop Harness

## Requirements
- Node.js (npm)

## Quickstart
1. Install dependencies:
   - `npm install`
2. Inspect current state:
   - `npm run loop:status`
3. Run one loop iteration:
   - `npm run once`
4. Check progress file updates:
   - `cat PROGRESS.md`

## Core scripts
- `npm run loop:status`  
  Show queue and next task summary.
- `npm run loop:run`  
  Run one Ralph iteration (task selection + checks + state update).
- `npm run once`  
  Alias for one iteration.
- `npm run typecheck`  
  Run TypeScript type-check for harness code.

## Troubleshooting
- Validation or parse issues are recorded in `PROGRESS.md` under `failure_category: validation`.
- Execution issues are recorded as `failure_category: execution` or `environment`.
