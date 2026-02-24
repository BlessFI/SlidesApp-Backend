# Slides Backend

Node.js backend with **TypeScript**, **Fastify**, **Prisma**, **Postgres/NeonDB**, **JWT** email/password auth, and **multi-tenant** isolation.

## Multi-tenant

- **Per-app user profiles** (`user_app_profiles`): each user has one profile per app (role, displayName).
- **app_id enforced on every request**: JWT includes `appId`; all user queries are scoped by it. App A cannot access App B data.
- **Test**: run `npm test` to verify tenant isolation (App A token cannot see App B users).

## Docs (env / local / staging)

- **[docs/ENV.md](docs/ENV.md)** — Environment variables (required vs optional, by environment)
- **[docs/LOCAL.md](docs/LOCAL.md)** — Local development setup (clone, env, DB, run)
- **[docs/STAGING.md](docs/STAGING.md)** — Staging deployment (env, migrations, Redis, checklist)

---

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Environment**
   - Copy `.env.example` to `.env`
   - Set `DATABASE_URL` to your Postgres/NeonDB connection string (e.g. from [Neon](https://neon.tech))
   - Set `JWT_SECRET` for production
   - See [docs/ENV.md](docs/ENV.md) for all variables (local / staging / production)

3. **Database**
   ```bash
   npx prisma generate
   npx prisma db push
   npx prisma db seed   # optional: creates App A / App B
   ```
   Or use migrations: `npx prisma migrate dev`

   **If you get P3005 (database schema is not empty)** when running `npx prisma migrate deploy`, the DB was created without Migrate. One-time baseline, then deploy:
   ```bash
   npx prisma migrate resolve --applied 0_baseline   # once only; skip if you get P3008 (already applied)
   npx prisma migrate deploy
   ```

4. **Run**
   - Development (with Nodemon): `npm run dev`
   - Production: `npm run build && npm start`

## API

- **Health:** `GET /health`
- **Apps** (for setup)
  - `POST /api/apps` — body: `{ "name", "slug" }` — create app
  - `GET /api/apps` — list apps
- **Auth** (`/api/auth`)
  - `POST /api/auth/register` — body: `{ "email", "password", "appId", "name?" }` → returns `{ user, token }`
  - `POST /api/auth/login` — body: `{ "email", "password", "appId" }` → returns `{ user, token }`
  - `POST /api/auth/refresh` — issue a new JWT from an existing (non-expired) token (requires `Authorization: Bearer <token>`)
  - `GET /api/auth/me` — current user in this app (requires `Authorization: Bearer <token>`)
  - `POST /api/auth/logout` — client discards token (stateless JWT; returns `{ ok: true }`)
- **Users** (require `Authorization: Bearer <token>`; scoped by app from JWT)
  - `GET /api/users/me` — current user’s profile in this app (same as `GET /api/auth/me`)
  - `GET /api/users` — list users in this app
  - `GET /api/users/:id` — user profile in this app (404 if user has no profile in this app)
- **Feed** (app-scoped video feed; app via `app_id` query, `X-App-Id` header, or JWT)
  - `GET /api/feed` — list ready videos for the app. Query: `?app_id=`, `?category_id=` (primary category UUID(s): “Same Category” filter), `?topic_id=`, `?subject_id=`, `?limit=`, `?cursor=`. Returns `{ request_id, items, nextCursor, hasMore }`; each item includes `rank_position` (0-based). Optional query `?request_id=` for event correlation (if omitted, backend generates one). Use `request_id` and `rank_position` when posting events. Full item shape: `id`, `guid`, `title`, `url`, `mp4Url`, `thumbnailUrl`, `thumbnailUrls`, `durationMs`, `primaryCategory` (single `{ id, name, slug }`), `secondaryLabels` (string[]), `categories`, `topics`, `subjects`, vote counts, `like_by_you`, `upvote_by_you`, `supervote_by_you`.
- **Categories** (app-scoped; app via `app_id`, `X-App-Id`, or JWT)
  - `GET /api/categories` — list taxonomy categories for the app. Returns `{ categories: [{ id, name, slug }] }`.
- **Taxonomy** (controlled vocabulary; app via `app_id`, `X-App-Id`, or JWT)
  - `GET /api/taxonomy?kind=category|topic|subject` — list taxonomy nodes for the app. Returns `{ categories }`, `{ topics }`, or `{ subjects }`. Only predefined IDs are valid for video tags (no free-text).
- **Ingest default rules** (deterministic defaults; require `Authorization: Bearer <token>`; app from JWT)
  - `GET /api/ingest-default-rules` — list rules (source_key → default category/topic/subject IDs).
  - `POST /api/ingest-default-rules` — create/update rule. Body: `sourceKey`, optional `defaultCategoryIds`, `defaultTopicIds`, `defaultSubjectIds`.
  - `DELETE /api/ingest-default-rules/:ruleId` — delete rule.
- **Video create/get/update** (require `Authorization: Bearer <token>`)
  - `POST /api/videos` — create video. **Required:** `durationMs`, `primaryCategoryId` (single category UUID from taxonomy; powers “Same Category” and feed), and either `videoUrl` or `videoBase64`. **Optional:** `title`, `description`, `secondaryLabels` (e.g. `["Weather", "Fashion"]`), `ingestSource`, `aspectRatio`, `thumbnailBase64`; `topicIds`/`subjectIds` are optional (for future derivation; MRSS typically omits them). Tags are validated against app taxonomy. The source MP4 is uploaded to R2 immediately and the video is set to **`status: "ready"`** so it appears in the feed (playable as MP4). In the background, the job transcodes to HLS and generates thumbnails. **Requires FFmpeg** and Cloudflare R2 env vars.
  - `GET /api/videos` — list videos you posted (same app as token). Query: `?limit=`, `?cursor=`. Returns `{ videos, nextCursor, hasMore }` with `primaryCategory`, `secondaryLabels` per video.
  - `GET /api/videos/:videoId` — fetch a single video (same app as token). Use the `id` from the create response to poll until `status` is `"ready"`. Response includes `primaryCategory`, `secondaryLabels`.
  - `PATCH /api/videos/:videoId` — update video metadata and/or upload new primary/thumbnail (same app, creator only). Optional: `primaryCategoryId`, `secondaryLabels`, `taggingSource` (`manual` | `rule` | `ai_suggested` | `ai_confirmed`).
  - `POST /api/videos/bulk-tag` — bulk update tags. Body: `videoIds` (required), optional `categoryIds`, `topicIds`, `subjectIds`, `taggingSource`. For admin/ingestion UI.

**Upload (create) video payload example**

```json
{
  "durationMs": 60000,
  "primaryCategoryId": "uuid-from-GET-api-taxonomy-kind-category",
  "secondaryLabels": ["Weather", "Crypto"],
  "title": "Market update",
  "videoUrl": "https://example.com/video.mp4"
}
```

- **Required:** `durationMs`, `primaryCategoryId` (one category UUID), and either `videoUrl` or `videoBase64`.
- **Optional:** `title`, `description`, `secondaryLabels` (string[]), `ingestSource`, `aspectRatio`, `thumbnailBase64`. Omit `topicIds`/`subjectIds` for MRSS; they can be derived later.

- **Video interactions** (like, up_vote, super_vote; require `Authorization: Bearer <token>`)
  - `POST /api/videos/:videoId/vote` — body: `{ "voteType": "like" | "up_vote" | "super_vote", "gestureSource?", "requestId?", "rankPosition?", "feedMode?" }`. Records vote and increments video counts. Returns `{ vote, counts }`.
- **Events** (M2 event logging; app-scoped via `app_id` in body/header or JWT)
  - `POST /events` — store event. Body: `type`, `event`, optional `schema_version` (integer; default 1), optional `request_id`, `rank_position`, `feed_mode`, `item_id`, `direction_key`, `gesture_action`, `gesture_source`, `ts`, … App: `app_id` in body or `X-App-Id` header (or JWT). Returns `{ ok: true, id }`. See [docs/EVENT-SCHEMA-VERSIONING.md](docs/EVENT-SCHEMA-VERSIONING.md).
  - **Gesture direction_key → gesture_action (all supported):** up→Next, down→Previous, left→Back, right→Same topic, upLeft→Restart, upRight→Same category, downLeft→Inform, downRight→Same subject.
  - `GET /events` — query. Params: `?type=`, `?event=`, `?request_id=`, `?item_id=`, `?gesture_direction=`, `?schema_version=`, `?limit=`. App: `app_id` query, `X-App-Id` header, or JWT. Returns `{ events: [...] }` (each event includes `schema_version`, `request_id`, `rank_position` when stored).

## Client configuration (EVENT_API_BASE)

Point the app at this backend for event logging. In the client (e.g. `App.tsx`):

```ts
const EVENT_API_BASE = 'https://your-backend-domain.com';  // no trailing slash
// POST /events → fetch(`${EVENT_API_BASE}/events`, { method: 'POST', body: JSON.stringify(payload) })
// GET  /events → fetch(`${EVENT_API_BASE}/events?request_id=...&limit=100`)
```

Use **HTTPS** in production. Local dev: `http://localhost:3000` (or your server port). Events are stored in Postgres (multi-tenant by `app_id`).

## Tagging system (M2) and AI tagging (M3)

- **M2 (current):** Controlled vocabulary only. Categories, topics, and subjects must be predefined per app (`GET /api/taxonomy`). Create/update video and bulk-tag validate IDs. `tagging_source` is set to `manual` or `rule` (when ingest defaults apply). Optional `ingestSource` on create uses **ingest default rules** for deterministic defaults. After a video becomes ready, a **tagging queue** job runs (currently just sets `tagging_source` to `manual` if null). Video model stores fields for M3: `ai_suggested_category_ids`, `ai_suggested_topic_ids`, `ai_suggested_subject_ids`, `ai_confidence`, `ai_model_version` (all optional; not used yet).
- **M3 (later):** AI tagging can be added behind a feature flag. The tagging worker will populate suggestions; humans confirm; `tagging_source` becomes `ai_suggested` or `ai_confirmed`. No AI implementation in this repo yet.

## Test

```bash
npm test
```

Runs multi-tenant isolation test: one user in App A and App B, another user only in App B; asserts that with App A token you only see App A users and get 404 when requesting a user that exists only in App B. **Requires `DATABASE_URL`** in `.env`; the suite is skipped when it is not set.

## Video processing (FFmpeg + R2)

When a video is created via `POST /api/videos` (with `videoUrl` or `videoBase64`), the backend:

- Converts the source to **HLS** (adaptive streaming)
- Adjusts to **9:16** aspect ratio (1080×1920, vertical)
- Encodes at **1920p HD** quality
- Generates **3 thumbnails** at 5s, 15s, and 30s
- Uploads HLS manifest/segments and thumbnails to **Cloudflare R2** (CDN)

**Requirements:** The app uses the **ffmpeg-static** package (bundled FFmpeg) when available; otherwise **FFmpeg** must be installed and on `PATH`. Set Cloudflare R2 env vars in `.env` (see `.env.example`). Videos appear in the feed only when `status` is `"ready"` (after processing completes).

**Background jobs:** Video processing runs via **BullMQ** and **Redis**. Set `REDIS_URL` (or `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`) in `.env`. If Redis is not available, processing runs in-process and a warning is logged.

## Tech

- **Runtime:** Node.js + TypeScript
- **Server:** Fastify
- **DB:** Postgres (NeonDB-ready), Prisma ORM
- **Auth:** JWT (@fastify/jwt), bcrypt for passwords
- **Multi-tenant:** App + UserAppProfile, `app_id` in JWT and enforced on every request
- **Video:** FFmpeg (HLS, 9:16, thumbnails), Cloudflare R2 (S3-compatible) for storage, BullMQ + Redis for background processing
