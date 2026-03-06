# Ralph Loop Harness

## Requirements
- Node.js 22+
- npm
- Codex CLI (`codex`) authenticated locally
- Railway account for backend hosting
- Vercel account for frontend hosting

## Quickstart
1. Install dependencies:
   - `npm install`
2. Inspect current queue state:
   - `npm run loop:status`
3. Verify the harness and app surfaces:
   - `npm run typecheck`
   - `npm run api:build`
   - `npm run web:build`
4. Run the Ralph loop when you want task execution:
   - `npm run loop:run`

Each loop iteration still runs Codex automatically with hardcoded settings:
- agent: `codex exec`
- model: `gpt-5.4`
- reasoning effort: `high`
- live Codex stdout/stderr is streamed during execution
- the git worktree must be clean before `loop:run`
- every loop iteration auto-commits its resulting changes

## Core scripts
- `npm run loop:status`
- `npm run loop:run`
- `npm run once`
- `npm run typecheck`

## Workspace scripts
- `npm run api:dev`
- `npm run api:typecheck`
- `npm run api:build`
- `npm run api:start`
- `npm run web:dev`
- `npm run web:typecheck`
- `npm run web:build`
- `npm run web:start`
- `npm run smoke:deploy`

The legacy root app contract is still available:
- `npm run app:typecheck`
- `npm run app:build`
- `npm run app:health`
- `npm run app:start`

## Local runtime check
1. Start the backend:
   - `PORT=4010 npm run api:start`
2. Start the frontend in a second terminal:
   - `API_BASE_URL=http://127.0.0.1:4010 PORT=4011 npm run web:start`
3. Verify:
   - `curl http://127.0.0.1:4010/health`
   - `curl http://127.0.0.1:4011`

Expected backend payload includes:
- `service: "ralph-api"`
- `status: "ok"`

Expected frontend page includes:
- `Production skeleton is live.`
- `ralph-api`

## Deployment setup
Primary operator handoff doc:
- [DEPLOYMENT_GUIDE.md](/Users/chris/Developer/ralph-skeleton/DEPLOYMENT_GUIDE.md)

### Railway backend
1. Create a Railway service from this repo.
2. Keep the service rooted at the repository root so `railway.json` applies.
3. Ensure the backend uses:
   - build command: `npm run api:build`
   - start command: `npm run api:start`
   - healthcheck path: `/health`
4. Enable `Wait for CI`.

### Vercel frontend
1. Create a Vercel project from this repo.
2. Set the project root directory to `apps/web`.
3. Set `API_BASE_URL` in production and preview to the Railway production URL.

### GitHub smoke verification
Add these repository secrets:
- `BACKEND_PROD_URL`
- `FRONTEND_PROD_URL`

`deploy-smoke` runs after `ci` succeeds on `main` and polls both public URLs until the deployment is live or the timeout expires.

## Troubleshooting
- Validation or parse issues are recorded in `PROGRESS.md` under `failure_category: validation`.
- Execution issues are recorded as `failure_category: execution` or `environment`.
- If `loop:run` refuses to start, clean or commit existing local changes first.
- If `deploy-smoke` fails, verify Railway is healthy at `/health`, Vercel has `API_BASE_URL`, and the GitHub secrets point at the production URLs.
