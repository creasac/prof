# Database setup

`prof` now supports:
- Better Auth user accounts backed by Postgres
- persisted learn-session snapshots per signed-in user
- local-first browser state with account sync when auth is enabled

## Required env

Add these to the root `.env`:

```bash
DATABASE_URL=postgres://USERNAME:PASSWORD@HOST:5432/prof
DATABASE_SSL=false
AUTH_SECRET=replace-this-with-a-long-random-secret
AUTH_BASE_URL=http://localhost:8080
```

Optional Google OAuth:

```bash
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

## Local or Cloud SQL bring-up

1. Create a Postgres database named `prof`.
2. Create an app user for the database.
3. Set `DATABASE_URL`.
4. Run the first migration:

```bash
npm run db:migrate
```

5. Start the apps:

```bash
npm run dev:server
npm run dev:web
```

## Local Cloud SQL proxy flow

For local development against Cloud SQL, use the Cloud SQL Auth Proxy.

1. Make sure the Google Cloud CLI is installed.
2. Authenticate application-default credentials:

```bash
gcloud auth application-default login
```

3. Start the proxy in a separate terminal and leave it running:

```bash
./cloud-sql-proxy --port 5432 PROJECT_ID:REGION:INSTANCE_NAME
```

4. Point `.env` at the proxy:

```bash
DATABASE_URL=postgres://USERNAME:PASSWORD@127.0.0.1:5432/prof
DATABASE_SSL=false
```

5. Verify the connection before running migrations:

```bash
PGPASSWORD='YOUR_PASSWORD' psql -h 127.0.0.1 -p 5432 -U 'YOUR_USERNAME' -d prof -c 'select current_user, current_database();'
```

6. Run the first migration:

```bash
npm run db:migrate
```

7. Start the apps:

```bash
npm run dev:server
npm run dev:web
```

## Initial tables

- `user`
- `session`
- `account`
- `verification`
- `learn_session`
