# Environment variables

Reference for **local**, **staging**, and **production**. Copy `.env.example` to `.env` and fill values for your environment.

---

## Required (all environments)

| Variable       | Description                    | Local example                    | Staging / Production      |
|----------------|--------------------------------|----------------------------------|---------------------------|
| `DATABASE_URL` | Postgres connection string     | From [Neon](https://neon.tech)   | Staging/prod Postgres URL |
| `JWT_SECRET`   | Secret for signing JWTs        | `dev-secret-change-me`           | Long random string        |

---

## Optional (server)

| Variable           | Description              | Default   | Notes                          |
|--------------------|--------------------------|-----------|---------------------------------|
| `NODE_ENV`         | `development` / `production` | `development` | Staging/prod: `production` |
| `PORT`             | HTTP port                | `3000`    | Set in staging/prod (e.g. `8080`) |
| `BODY_LIMIT_BYTES` | Max request body (bytes) | `104857600` (100MB) | For large base64 video uploads |

---

## Optional (video pipeline)

Video upload/processing works without these; with them you get R2 storage and background jobs.

| Variable                         | Description                    | When needed                          |
|----------------------------------|--------------------------------|--------------------------------------|
| `REDIS_URL`                      | Redis connection URL           | Background video jobs (BullMQ)        |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | Redis (if not using `REDIS_URL`) | Same as above                    |
| `CLOUDFLARE_ACCOUNT_ID`         | Cloudflare account ID          | R2 uploads (video/thumbnails)        |
| `CLOUDFLARE_R2_ACCESS_KEY_ID`   | R2 API access key              | R2 uploads                            |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | R2 API secret                | R2 uploads                            |
| `CLOUDFLARE_R2_BUCKET_NAME`     | R2 bucket name                 | R2 uploads                            |
| `CLOUDFLARE_R2_PUBLIC_URL`      | Optional public base URL for R2 | If you use a custom domain/CDN     |

- **No Redis:** video processing runs in-process after create; no separate worker.
- **No R2:** `videoUrl` still works (encode from URL); `videoBase64` and thumbnail uploads return 503 until R2 is set.

---

## Optional (MRSS / Content Provider ingestion)

Used by MRSS ingest jobs (e.g. VideoElephant) to authenticate when fetching the feed. See README § MRSS and Content Provider feeds.

| Variable                         | Description                    | Notes |
|----------------------------------|--------------------------------|--------|
| `MRSS_VIDEOELEPHANT_USERNAME`    | VideoElephant MRSS username    | Basic auth; do not commit. |
| `MRSS_VIDEOELEPHANT_PASSWORD`   | VideoElephant MRSS password    | Basic auth; do not commit. |

---

## Optional (hourly MRSS ingest cron)

When the server starts, it can run MRSS ingest **every hour** in the background (10 new videos per run, one-at-a-time until ready). Enable with:

| Variable                 | Description                          | Notes |
|--------------------------|--------------------------------------|--------|
| `MRSS_INGEST_ENABLED`    | `1`, `true`, or `yes`                | Enables the hourly cron. Omit or leave empty to disable. |
| `MRSS_INGEST_APP_ID`     | App UUID to ingest into              | Required if cron is enabled. |
| `MRSS_INGEST_SOURCE_KEY` | Content provider source key          | Default: `videoelephant`. |

- Ensure the app already has the content provider and ingest rule (e.g. run `npm run ingest:mrss` once or create via API). Cron only runs `runMrssIngestForProvider`; it does not create the provider.
- Each run processes up to 10 new items and waits for each video to finish processing before moving to the next so none are left in "processing".

---

## By environment

### Local

- **Required:** `DATABASE_URL`, `JWT_SECRET` (can use a simple dev value).
- **Optional:** `REDIS_URL` or `REDIS_HOST`/`REDIS_PORT` for queue; R2 vars for uploads. `PORT` if you don’t want 3000.

### Staging

- **Required:** `DATABASE_URL` (staging Postgres), `JWT_SECRET` (staging-specific secret), `NODE_ENV=production` (or leave unset if your host sets it).
- **Recommended:** `REDIS_URL` (staging Redis), full R2 set for video uploads. `PORT` as required by host (e.g. 8080).

### Production

- Same as staging; use production DB, Redis, R2 and a strong `JWT_SECRET`.

---

## Example `.env` (local, minimal)

```env
NODE_ENV=development
PORT=3000
JWT_SECRET=dev-secret-change-in-production
DATABASE_URL="postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require"
```

## Example `.env` (staging, full)

```env
NODE_ENV=production
PORT=8080
JWT_SECRET=<staging-long-random-secret>
DATABASE_URL="postgresql://..."
REDIS_URL="redis://..."
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_R2_ACCESS_KEY_ID=...
CLOUDFLARE_R2_SECRET_ACCESS_KEY=...
CLOUDFLARE_R2_BUCKET_NAME=...
CLOUDFLARE_R2_PUBLIC_URL=https://...
```
