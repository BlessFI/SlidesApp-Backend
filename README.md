# Slides Backend

Node.js backend with **TypeScript**, **Fastify**, **Prisma**, **Postgres/NeonDB**, **JWT** email/password auth, and **multi-tenant** isolation.

## Multi-tenant

- **Per-app user profiles** (`user_app_profiles`): each user has one profile per app (role, displayName).
- **app_id enforced on every request**: JWT includes `appId`; all user queries are scoped by it. App A cannot access App B data.
- **Test**: run `npm test` to verify tenant isolation (App A token cannot see App B users).

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Environment**
   - Copy `.env.example` to `.env`
   - Set `DATABASE_URL` to your Postgres/NeonDB connection string (e.g. from [Neon](https://neon.tech))
   - Set `JWT_SECRET` for production

3. **Database**
   ```bash
   npx prisma generate
   npx prisma db push
   npx prisma db seed   # optional: creates App A / App B
   ```
   Or use migrations: `npx prisma migrate dev`

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
  - `GET /api/feed` — list ready videos for the app. Query: `?app_id=`, `?category_id=`, `?limit=`, `?cursor=`. Returns `{ items, nextCursor, hasMore }` with each item: `id`, `guid`, `title`, `url` (primary asset CDN URL), `durationMs`, `category`, vote counts, etc.
- **Video interactions** (like, up_vote, super_vote; require `Authorization: Bearer <token>`)
  - `POST /api/videos/:videoId/vote` — body: `{ "voteType": "like" | "up_vote" | "super_vote", "gestureSource?", "requestId?", "rankPosition?", "feedMode?" }`. Records vote and increments video counts. Returns `{ vote, counts }`.
- **Events** (M2 event logging; app-scoped via `app_id` in body/header or JWT)
  - `POST /events` — store event. Body: `type`, `event`, optional `request_id`, `rank_position`, `feed_mode`, `item_id`, `direction_key`, `gesture_action`, `gesture_source`, `ts`, … App: `app_id` in body or `X-App-Id` header (or JWT). Returns `{ ok: true, id }`.
  - **Gesture direction_key → gesture_action (all supported):** up→Next, down→Previous, left→Back, right→Same topic, upLeft→Restart, upRight→Same category, downLeft→Inform, downRight→Same subject.
  - `GET /events` — query. Params: `?type=`, `?event=`, `?request_id=`, `?item_id=`, `?gesture_direction=`, `?limit=`. App: `app_id` query, `X-App-Id` header, or JWT. Returns `{ events: [...] }`.

## Client configuration (EVENT_API_BASE)

Point the app at this backend for event logging. In the client (e.g. `App.tsx`):

```ts
const EVENT_API_BASE = 'https://your-backend-domain.com';  // no trailing slash
// POST /events → fetch(`${EVENT_API_BASE}/events`, { method: 'POST', body: JSON.stringify(payload) })
// GET  /events → fetch(`${EVENT_API_BASE}/events?request_id=...&limit=100`)
```

Use **HTTPS** in production. Local dev: `http://localhost:3000` (or your server port). Events are stored in Postgres (multi-tenant by `app_id`).

## Test

```bash
npm test
```

Runs multi-tenant isolation test: one user in App A and App B, another user only in App B; asserts that with App A token you only see App A users and get 404 when requesting a user that exists only in App B. **Requires `DATABASE_URL`** in `.env`; the suite is skipped when it is not set.

## Tech

- **Runtime:** Node.js + TypeScript
- **Server:** Fastify
- **DB:** Postgres (NeonDB-ready), Prisma ORM
- **Auth:** JWT (@fastify/jwt), bcrypt for passwords
- **Multi-tenant:** App + UserAppProfile, `app_id` in JWT and enforced on every request
