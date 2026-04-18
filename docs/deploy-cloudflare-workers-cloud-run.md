# Public launch with free domains

This repo is set up for the simplest free public deployment path:

- frontend on Cloudflare Workers using a free `*.workers.dev` subdomain
- backend on Cloud Run using the default `*.run.app` URL
- frontend proxies `/api/*` to Cloud Run so auth and API cookies stay same-origin on the frontend hostname

## Why this shape

- The web app is already configured for OpenNext on Cloudflare.
- The backend is a separate Express service with auth, uploads, streaming responses, and Postgres.
- Using a same-origin `/api` proxy avoids cross-site cookie issues between `workers.dev` and `run.app`.

## Repo changes already in place

- Production web builds now default API calls to same-origin `/api`.
- `apps/web/app/api/[...path]/route.ts` proxies API traffic to `API_PROXY_TARGET`.
- The backend now supports either:
  - `DATABASE_URL`
  - Cloud SQL Unix socket envs: `INSTANCE_CONNECTION_NAME`, `DB_USER`, `DB_PASS`, `DB_NAME`
  - direct TCP envs: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME`
- A root `Dockerfile` exists so Cloud Run source/GitHub deploys can build from repo root.

## Frontend deploy

Create a Cloudflare Worker from the GitHub repo.

Recommended Workers Builds settings:

- Worker name: `prof`
- Production branch: `master`
- Root directory: `.`
- Build command: `npm run build:cf:web`
- Deploy command: `npm run deploy:cf:web`

Runtime variables for the Worker:

- `API_PROXY_TARGET=https://YOUR_CLOUD_RUN_SERVICE_URL`

Optional build variables:

- Leave `NEXT_PUBLIC_API_BASE_URL` unset in production.

After deploy, Cloudflare will give you a free URL like:

- `https://prof.YOUR-SUBDOMAIN.workers.dev`

## Backend deploy

Deploy the backend to Cloud Run from the repo root so the root `Dockerfile` is used.

Example:

```bash
gcloud run deploy prof-api \
  --source . \
  --region YOUR_REGION \
  --allow-unauthenticated
```

Then set Cloud Run env vars and secrets.

Minimum required backend config:

```bash
PORT=8080
WEB_ORIGIN=https://prof.YOUR-SUBDOMAIN.workers.dev
AUTH_BASE_URL=https://prof.YOUR-SUBDOMAIN.workers.dev
AUTH_SECRET=YOUR_SECRET
```

Database options:

1. Single connection string

```bash
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/prof
DATABASE_SSL=true
```

2. Cloud SQL attached to Cloud Run with Unix socket

```bash
DB_USER=USER
DB_PASS=PASSWORD
DB_NAME=prof
INSTANCE_CONNECTION_NAME=PROJECT:REGION:INSTANCE
```

When using Cloud SQL:

- attach the Cloud SQL instance to the Cloud Run service
- grant the Cloud Run service account the `Cloud SQL Client` role
- keep Cloud Run and Cloud SQL in the same region when possible

Other backend vars depend on which features you want enabled:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `GEMINI_API_KEY` or Vertex config
- `REASONING_MODEL=gemini-3.1-pro-preview`
- `ELEVENLABS_AGENT_ID`
- `ELEVENLABS_API_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

## Auth notes

Set `AUTH_BASE_URL` to the frontend `workers.dev` URL, not the Cloud Run `run.app` URL.

That keeps auth endpoints under:

- `https://prof.YOUR-SUBDOMAIN.workers.dev/api/auth/*`

The frontend proxy forwards those requests to Cloud Run, and the browser stores cookies on the frontend hostname.

## Migrations

Run the production migration before public launch:

```bash
npm run db:migrate
```

Run it in an environment that can reach the production database.

## Smoke test

1. Open the frontend `workers.dev` URL.
2. Confirm public pages load.
3. Create an account or sign in.
4. Confirm `GET /api/config` succeeds from the browser.
5. Confirm `https://YOUR_CLOUD_RUN_SERVICE_URL/health` returns `ok: true`.

## Notes on previews

Branch preview URLs are enabled for the Worker, but auth will only work if the backend `WEB_ORIGIN` also allows that preview origin.
For the first launch, optimize for the production `workers.dev` URL first.

## GitHub Actions automation

The repo includes a production deploy workflow at `.github/workflows/deploy.yml`.

It runs on pushes to `master` and does:

- backend deploy to Cloud Run using Google Workload Identity Federation
- frontend deploy to Cloudflare Workers using Wrangler

Required GitHub repository variables:

- `CLOUDFLARE_ACCOUNT_ID`
- `GCP_PROJECT_ID`
- `GCP_REGION`
- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`
- `CLOUD_RUN_SERVICE`
- `CLOUD_SQL_INSTANCE_CONNECTION_NAME`
- `FRONTEND_URL`
- `API_PROXY_TARGET`
- `DATABASE_SSL`
- `DB_USER`
- `DB_NAME`
- `GOOGLE_CLIENT_ID`
- `VOICE_PROVIDER`
- `SEARCH_PROVIDER`
- `REASONING_PROVIDER`
- `URL2MD_API_BASE_URL`
- `SOURCE_MATERIAL_MAX_COUNT`
- `SOURCE_MATERIAL_MAX_PROMPT_CHARS`
- `SOURCE_MATERIAL_MAX_EXCERPT_CHARS`
- `FILE_UPLOAD_MAX_BYTES`
- `R2_ACCOUNT_ID`
- `R2_BUCKET`
- `GOOGLE_GENAI_USE_VERTEXAI`
- `GOOGLE_CLOUD_PROJECT`
- `GOOGLE_CLOUD_LOCATION`
- `REASONING_MODEL`
- `ATTACHMENT_IMAGE_MODEL`

Required GitHub repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `AUTH_SECRET`
- `DB_PASS`
- `GOOGLE_CLIENT_SECRET`
- `ELEVENLABS_AGENT_ID`
- `ELEVENLABS_API_KEY`
- `GEMINI_API_KEY`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

For `CLOUDFLARE_API_TOKEN`, Cloudflare's `Edit Cloudflare Workers` token template is the simplest option.

Set `CLOUDFLARE_ACCOUNT_ID` to the 32-character account ID for the target Cloudflare account. If you are already using R2 in the same account, this will usually match `R2_ACCOUNT_ID`.

This workflow passes `CLOUDFLARE_ACCOUNT_ID` directly to `cloudflare/wrangler-action@v3`. That avoids Wrangler trying to discover the account through the user memberships API, which is the most common cause of `A request to the Cloudflare API (/memberships) failed` errors when using narrower custom API tokens in CI.
