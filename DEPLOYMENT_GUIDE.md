# Deployment Guide For Dumb Human And Smart AI

This guide is for deploying this repo for real:
- backend on Railway
- frontend on Vercel
- smoke verification from GitHub Actions

Use this guide exactly as written unless you intentionally want to change infrastructure.

## What this repo deploys

- Railway deploys the backend from [apps/api/src/index.ts](/Users/chris/Developer/ralph-skeleton/apps/api/src/index.ts)
- Vercel deploys the frontend from [apps/web/app/page.tsx](/Users/chris/Developer/ralph-skeleton/apps/web/app/page.tsx)
- GitHub Actions runs CI from [.github/workflows/ci.yml](/Users/chris/Developer/ralph-skeleton/.github/workflows/ci.yml)
- GitHub Actions runs post-deploy smoke checks from [.github/workflows/deploy-smoke.yml](/Users/chris/Developer/ralph-skeleton/.github/workflows/deploy-smoke.yml)
- Railway service settings are declared in [railway.json](/Users/chris/Developer/ralph-skeleton/railway.json)
- Public smoke verification script is [scripts/deploy-smoke.mjs](/Users/chris/Developer/ralph-skeleton/scripts/deploy-smoke.mjs)

## Preconditions

You need:
- Node.js 22+
- a GitHub repo for this code
- a Railway account
- a Vercel account
- permission to add GitHub repository secrets

Before touching providers, verify the repo locally:

```bash
npm install
npm run typecheck
npm run api:build
npm run web:build
```

If any of those fail, stop and fix the repo first.

## Fast path

Do these in order:

1. Push the branch you want to deploy to GitHub.
2. Create the Railway backend service from the repo.
3. Confirm Railway deploys and `/health` returns 200 JSON.
4. Create the Vercel frontend project from the same repo with root directory `apps/web`.
5. Set Vercel env var `API_BASE_URL` to the Railway production URL.
6. Confirm the Vercel site renders backend status and shows `ralph-api`.
7. Add GitHub secrets `BACKEND_PROD_URL` and `FRONTEND_PROD_URL`.
8. Push to `main`.
9. Wait for `ci`, then `deploy-smoke`.
10. Confirm `deploy-smoke` passes.

If you only remember one rule: Railway first, Vercel second, GitHub secrets after both URLs are known.

## Step 1: Push the repo

If this repo is not on GitHub yet:

```bash
git status
git add -A
git commit -m "Prepare production deployment"
git push -u origin <your-branch>
```

If `main` is the production branch, merge or push the final deployment commit to `main` when ready.

## Step 2: Create the Railway backend

### Human steps

1. Open Railway.
2. Create a new project from GitHub repo.
3. Pick this repository.
4. Select the service that should deploy from the repo root.
5. After import, open the service settings and verify:
   - build command: `npm run api:build`
   - start command: `npm run api:start`
   - health check path: `/health`
6. Turn on `Wait for CI`.
7. Trigger the first deploy if Railway does not do it automatically.

You want Railway to respect [railway.json](/Users/chris/Developer/ralph-skeleton/railway.json). Do not point Railway at `apps/web`.

### AI instructions

If an AI is helping, tell it:

```text
Create or verify the Railway service for this repo. The deploy target is the repo root, the backend is the api workspace, the expected health endpoint is /health, and the service is successful only if the public Railway URL returns HTTP 200 with service=ralph-api and status=ok.
```

### Success check

Once Railway gives you a production URL, verify:

```bash
curl -sSf <RAILWAY_BACKEND_URL>/health
```

Expected shape:

```json
{
  "service": "ralph-api",
  "status": "ok",
  "version": "...",
  "timestamp": "..."
}
```

If `service` is not `ralph-api` or `status` is not `ok`, do not continue.

## Step 3: Create the Vercel frontend

### Human steps

1. Open Vercel.
2. Create a new project from GitHub repo.
3. Choose this repository.
4. Set the project root directory to `apps/web`.
5. Before first production deploy, add environment variable:
   - name: `API_BASE_URL`
   - value: the Railway production backend URL, without a trailing slash
6. Save and deploy.

The frontend is successful only if it is reading the live Railway backend, not if it merely renders a static page.

### AI instructions

Tell the AI:

```text
Configure Vercel for this repo with root directory apps/web. Set API_BASE_URL to the Railway production backend URL. The deployment is only complete if the public page renders the live backend service name ralph-api and shows a healthy backend state.
```

### Success check

Verify the Vercel site:

```bash
curl -sSf <VERCEL_FRONTEND_URL>
```

The HTML must contain all of these:
- `Production skeleton is live.`
- `Backend status`
- `ralph-api`

If the page renders an unavailable or degraded state, check `API_BASE_URL` first.

## Step 4: Configure GitHub Actions smoke verification

Open GitHub repository settings and add these secrets:

- `BACKEND_PROD_URL`
  - example: `https://your-api-production-url.up.railway.app`
- `FRONTEND_PROD_URL`
  - example: `https://your-vercel-site.vercel.app`

These are consumed by [.github/workflows/deploy-smoke.yml](/Users/chris/Developer/ralph-skeleton/.github/workflows/deploy-smoke.yml).

### Success check

Push to `main` and verify these workflows:
- `ci`
- `deploy-smoke`

`deploy-smoke` is successful only if both public URLs are up and the frontend is rendering the backend signal.

## Step 5: Final production verification

Run these checks after both providers are live:

```bash
curl -sSf <RAILWAY_BACKEND_URL>/health
curl -sSf <VERCEL_FRONTEND_URL> | rg "Production skeleton is live.|Backend status|ralph-api"
```

You are done when:
- backend `/health` returns 200
- backend JSON includes `service=ralph-api`
- backend JSON includes `status=ok`
- frontend returns 200
- frontend shows `ralph-api`
- GitHub `deploy-smoke` passes

## Common failures

### Railway deploys but health fails

Check:
- Railway is using the repo root
- `railway.json` is present
- start command is `npm run api:start`
- healthcheck path is `/health`

### Vercel deploys but page shows unavailable backend

Check:
- Vercel root directory is `apps/web`
- `API_BASE_URL` is set
- `API_BASE_URL` points to the Railway production URL
- the Railway backend URL works from your browser or `curl`

### GitHub `deploy-smoke` fails

Check:
- `BACKEND_PROD_URL` secret is correct
- `FRONTEND_PROD_URL` secret is correct
- both URLs are production URLs, not local URLs
- Railway and Vercel finished deployment before smoke timeout

### CI fails on Node version

This repo expects Node 22 in CI and for deploy-like work. Use Node 22 locally as well.

## Exact commands for local preflight

Use these before blaming Railway or Vercel:

```bash
npm install
npm run typecheck
npm run app:typecheck
npm run app:build
npm run api:typecheck
npm run api:build
npm run web:typecheck
npm run web:build
```

Optional local end-to-end smoke:

Terminal 1:

```bash
PORT=4010 npm run api:start
```

Terminal 2:

```bash
API_BASE_URL=http://127.0.0.1:4010 PORT=4011 npm run web:start
```

Terminal 3:

```bash
BACKEND_PROD_URL=http://127.0.0.1:4010 FRONTEND_PROD_URL=http://127.0.0.1:4011 npm run smoke:deploy
```

## Copy/paste prompt for an AI operator

Use this if you want another AI to drive the deployment work:

```text
Deploy this repo to production with Railway for the backend and Vercel for the frontend. Use the existing repo configuration exactly unless a concrete provider constraint forces a change. The backend must be healthy at /health and return service=ralph-api and status=ok. The frontend must be deployed from apps/web and render the live backend status using API_BASE_URL. After both public URLs are known, configure GitHub Actions deploy smoke verification with BACKEND_PROD_URL and FRONTEND_PROD_URL, then verify ci and deploy-smoke both pass. Do not declare success until the public frontend shows ralph-api and the public backend /health returns 200 JSON.
```
