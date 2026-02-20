# Staging deployment

How to run the Slides backend in a **staging** environment (shared test environment before production).

---

## Overview

- Staging should mirror production **config** (Postgres, Redis, R2, env) with staging **data** (separate DB, bucket, secrets).
- Use **migrations** for schema changes; do not use `prisma db push` in staging/production.

---

## 1. Environment variables

Set these in your staging host (e.g. Railway, Render, Fly.io, or your own server). See [docs/ENV.md](./ENV.md) for full reference.

**Required:**

| Variable       | Staging value |
|----------------|----------------|
| `NODE_ENV`     | `production` (or unset if host sets it) |
| `PORT`         | Port your host expects (e.g. `8080`)    |
| `DATABASE_URL` | Staging Postgres URL (Neon or other)    |
| `JWT_SECRET`   | Long random secret (staging-only)       |

**Recommended for full behavior:**

| Variable | Notes |
|----------|--------|
| `REDIS_URL` | Staging Redis for video queue (BullMQ) |
| `CLOUDFLARE_ACCOUNT_ID` | Same R2 account OK; use staging bucket or prefix |
| `CLOUDFLARE_R2_ACCESS_KEY_ID` | R2 API key |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | R2 API secret |
| `CLOUDFLARE_R2_BUCKET_NAME` | Staging bucket (e.g. `slides-staging`) |
| `CLOUDFLARE_R2_PUBLIC_URL` | Staging CDN/public URL if needed |

---

## 2. Database (staging Postgres)

- Create a **separate** Postgres database for staging (e.g. Neon branch or new project).
- Set `DATABASE_URL` in staging to that instance.

**First-time or after adding migrations:**

```bash
# From CI or a one-off deploy step (with DATABASE_URL pointing at staging DB)
npx prisma generate
npx prisma migrate deploy
```

If the staging DB was created without Prisma Migrate and you get **P3005**:

```bash
npx prisma migrate resolve --applied 0_baseline
npx prisma migrate deploy
```

Optional: run seed or taxonomy seeds against staging DB (with staging `APP_ID`).

---

## 3. Redis (staging)

- Use a staging Redis instance (e.g. Upstash, Redis Cloud, or a small VM).
- Set `REDIS_URL` in staging (e.g. `rediss://...` for TLS).
- The app starts the **video process** and **tagging** workers on boot; no separate process needed if the same Node process runs workers.

---

## 4. Build and start

Typical staging deploy:

```bash
npm ci
npm run build
npx prisma generate
npx prisma migrate deploy   # or run in a release phase
npm start
```

Ensure the start command runs the built app (e.g. `node dist/index.js` or `npm start` that runs it). The server listens on `PORT` and binds to `0.0.0.0`.

---

## 5. Health and smoke checks

After deploy:

- `GET https://your-staging-host/health` → `{"ok":true}`
- Register/login and call `GET /api/feed?app_id=<stagingAppId>` to confirm DB and auth.
- Optionally create a video (with `videoUrl`) to confirm queue and R2 if configured.

---

## 6. Checklist

- [ ] Staging Postgres created and `DATABASE_URL` set
- [ ] Migrations applied (`prisma migrate deploy`)
- [ ] `JWT_SECRET` set (staging-specific, strong)
- [ ] Staging Redis and `REDIS_URL` set (recommended)
- [ ] R2 staging bucket and env vars set (recommended for uploads)
- [ ] `PORT` matches host (e.g. 8080)
- [ ] Build runs and start command uses built output

---

## Host-specific notes

- **Railway / Render / Fly.io:** Add env vars in dashboard; set build command to `npm run build` and start to `npm start`. Run migrations in a release phase or manually once per migration.
- **Docker:** Use a multi-stage build; run `prisma migrate deploy` before `npm start` in the container or in an init job.
- **Manual server:** Use a process manager (e.g. systemd, PM2); run migrations from a deploy script or CI before restarting the app.
