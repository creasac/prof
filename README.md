# prof

`prof` is an adaptive learning app that turns a goal and optional source material into structured study content and live tutoring.

It combines:
- learning plans, lessons, quizzes, flashcards, and saved courses
- chat and live tutoring flows
- auth, persistence, and source-material uploads

## Stack

- `apps/web`: Next.js 15 and React 19 frontend
- `apps/server`: Express API for auth, orchestration, uploads, and provider integration
- `packages/contracts`: shared schemas and app contracts
- Postgres + Drizzle for persistence
- Google GenAI for reasoning/search, ElevenLabs for voice, Cloudflare R2 for uploaded files

## Local development

1. Copy `.env.example` to `.env`.
2. Set the minimum app config:

```bash
PORT=8080
WEB_ORIGIN=http://localhost:3000
AUTH_BASE_URL=http://localhost:8080
AUTH_SECRET=replace-this-with-a-long-random-secret
GEMINI_API_KEY=...
```

Optional Google OAuth: set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

3. Install dependencies:

```bash
npm ci
```

## Database

Choose one database setup.

### Local Postgres

Use this for the simplest local setup.

```bash
DATABASE_URL=postgres://USERNAME:PASSWORD@HOST:5432/prof
DATABASE_SSL=false
```

Create a database named `prof`, create an app user, then run:

```bash
npm run db:migrate
```

### Cloud SQL via proxy

Use this when the database lives in Google Cloud but the app runs locally.

1. Authenticate local Google credentials:

```bash
gcloud auth application-default login
```

2. Start the Cloud SQL Auth Proxy in a separate terminal:

```bash
./cloud-sql-proxy --port 5432 PROJECT_ID:REGION:INSTANCE_NAME
```

3. Point `.env` at the proxy:

```bash
DATABASE_URL=postgres://USERNAME:PASSWORD@127.0.0.1:5432/prof
DATABASE_SSL=false
```

4. Run migrations:

```bash
npm run db:migrate
```

5. Start the backend and frontend in separate terminals:

```bash
npm run dev:server
npm run dev:web
```

6. Open `http://localhost:3000`.

Voice, uploads, and some search flows need additional provider env vars from `.env.example`. The backend health endpoint is available at `http://localhost:8080/health`.

## Useful scripts

- `npm run dev:web`
- `npm run dev:server`
- `npm run typecheck`
- `npm run build:web`
- `npm run build:cf:web`
- `npm run deploy:cf:web`

## Deployment

The web app is configured for OpenNext on Cloudflare Workers. In production, the frontend can proxy `/api/*` to the backend so auth stays same-origin.

## Docs

- [docs/architecture.md](docs/architecture.md)
- [docs/deploy-cloudflare-workers-cloud-run.md](docs/deploy-cloudflare-workers-cloud-run.md)
- [integrations/elevenlabs/README.md](integrations/elevenlabs/README.md)
