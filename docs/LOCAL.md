# Local development

Run the Slides backend on your machine for development and testing.

---

## Prerequisites

- **Node.js** 18+ (LTS recommended)
- **Postgres** (or a hosted Postgres such as [Neon](https://neon.tech))
- **FFmpeg** (optional; app can use `ffmpeg-static` from npm)
- **Redis** (optional; for background video queue; without it, processing runs in-process)

---

## 1. Clone and install

```bash
git clone <repo-url>
cd slides-backend
npm install
```

---

## 2. Environment

```bash
cp .env.example .env
```

Edit `.env` and set at least:

- **`DATABASE_URL`** — Postgres connection string (e.g. from Neon dashboard).
- **`JWT_SECRET`** — any string for local dev (e.g. `dev-secret-change-me`).

Optional for full features:

- **Redis:** `REDIS_URL` or `REDIS_HOST` / `REDIS_PORT` (and `REDIS_PASSWORD` if needed) for the video processing queue.
- **R2:** Cloudflare R2 vars (see [docs/ENV.md](./ENV.md)) if you want base64 video/thumbnail uploads to R2.

---

## 3. Database

Generate Prisma client and apply schema:

```bash
npx prisma generate
npx prisma db push
```

Or use migrations (if you use Prisma Migrate):

```bash
npx prisma generate
npx prisma migrate dev
```

If the DB already had tables created without Migrate and you see **P3005** on `prisma migrate deploy`:

```bash
npx prisma migrate resolve --applied 0_baseline   # once only
npx prisma migrate deploy
```

Optional seed (creates example apps):

```bash
npx prisma db seed
```

Seed taxonomy for an app (replace with your app id from `GET /api/apps` or DB):

```bash
APP_ID=your-app-id npx tsx scripts/seed-categories.ts
APP_ID=your-app-id npx tsx scripts/seed-topics-subjects.ts
```

---

## 4. Run

**Development (with Nodemon):**

```bash
npm run dev
```

Server listens on `http://localhost:3000` (or the `PORT` in `.env`).

**Production build (local run):**

```bash
npm run build
npm start
```

---

## 5. Verify

- **Health:** `curl http://localhost:3000/health` → `{"ok":true}`
- **API:** Register/login, then call `GET /api/feed?app_id=<appId>` or create a video (see README API section).

---

## Optional: Redis (video queue)

With Redis running locally (e.g. `redis-server`), set in `.env`:

```env
REDIS_URL=redis://localhost:6379
```

or:

```env
REDIS_HOST=localhost
REDIS_PORT=6379
```

Restart the server. Video processing will run in a BullMQ worker instead of in-process.

---

## Optional: FFmpeg

- The app uses **ffmpeg-static** when installed; no system FFmpeg needed in that case.
- If you prefer system FFmpeg: install it and ensure `ffmpeg` is on `PATH`.

---

## Troubleshooting

- **DB connection:** Ensure `DATABASE_URL` is correct and the DB allows connections from your IP (Neon: check IP allow list).
- **503 on video upload:** R2 env vars not set; use `videoUrl` for testing without R2, or add R2 credentials.
- **Queue not processing:** If Redis is not set or unreachable, processing still runs in-process; check logs for errors.
