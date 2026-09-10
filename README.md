# prof

`prof` is an adaptive learning app that turns a goal and optional source material into structured study content and live tutoring.

It combines:
- learning plans, lessons, quizzes, flashcards, and saved courses
- chat and live tutoring flows
- auth, persistence, and source-material uploads

<img width="800" height="560" alt="icon" src="https://github.com/user-attachments/assets/83fef88d-e12e-40f2-959c-c61e7bf8b6e6" />

## Preview

<img width="1813" height="860" alt="Screenshot from 2026-04-03 00-31-10" src="https://github.com/user-attachments/assets/d92f259c-c908-448d-86f4-99438f4d07a9" />

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

Production uses Neon Postgres. For local development, either point `.env` at
Neon or run a local Postgres database.

### Neon

Use the pooled Neon connection string for app runtime:

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST-pooler.REGION.aws.neon.tech/prof?sslmode=verify-full
DATABASE_SSL=false
```

Use the direct, non-pooled Neon connection string when running migrations:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST.REGION.aws.neon.tech/prof?sslmode=verify-full" DATABASE_SSL=false npm run db:migrate
```

### Local Postgres

Use this if you want a fully local database instead of Neon:

```bash
DATABASE_URL=postgres://USERNAME:PASSWORD@127.0.0.1:5432/prof
DATABASE_SSL=false
```

Create a database named `prof`, create an app user, then run:

```bash
npm run db:migrate
```

Start the backend and frontend in separate terminals:

```bash
npm run dev:server
npm run dev:web
```

Open `http://localhost:3000`.

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
