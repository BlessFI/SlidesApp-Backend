# Postman – API testing guide

**Base URL:** `http://localhost:3000` (or set `{{baseUrl}}` in Postman)

You need a **parent App ID** before auth. Flow: **Create App → Register/Login → Use token** on protected routes.

---

## 1. Create parent App (do this first)

### Create an app

| Field   | Value |
|--------|--------|
| **Method** | `POST` |
| **URL**    | `{{baseUrl}}/api/apps` |
| **Headers** | `Content-Type: application/json` |
| **Body** (raw JSON) | See below |

**Body:**
```json
{
  "name": "My Test App",
  "slug": "my-test-app"
}
```

**Response (201):** You get an `id` — this is your **App ID**. Save it (e.g. as Postman var `appId`).

Example:
```json
{
  "id": "clxxxxxxxxxxxxxxxxxxx",
  "name": "My Test App",
  "slug": "my-test-app",
  "createdAt": "2025-02-14T...",
  "updatedAt": "2025-02-14T..."
}
```

Copy `id` → use as `appId` in register/login.

---

### List apps (optional)

| Field   | Value |
|--------|--------|
| **Method** | `GET` |
| **URL**    | `{{baseUrl}}/api/apps` |

Use this to see all apps and copy an existing app `id` if you already created one.

---

## 2. Auth APIs

All auth endpoints live under `/api/auth`. You need an **appId** (from step 1) for register and login.

| Method | Endpoint | Auth required | Description |
|--------|----------|---------------|-------------|
| POST   | `/api/auth/register` | No  | Create user + profile in app, returns `user` + `token` |
| POST   | `/api/auth/login`    | No  | Login for app, returns `user` + `token` |
| GET    | `/api/auth/me`       | Yes | Current user in this app (same as `/api/users/me`) |
| POST   | `/api/auth/logout`   | No  | Client should discard token (stateless JWT) |

---

### Register

| Field   | Value |
|--------|--------|
| **Method** | `POST` |
| **URL**    | `{{baseUrl}}/api/auth/register` |
| **Headers** | `Content-Type: application/json` |
| **Body** (raw JSON) | See below |

**Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "appId": "PASTE_APP_ID_HERE",
  "name": "Test User"
}
```

**Response (201):** Contains `user` and `token`. Save `token` for protected routes (e.g. Postman var `token`).

Example:
```json
{
  "user": {
    "id": "...",
    "email": "user@example.com",
    "name": "Test User",
    "appId": "...",
    "profileId": "...",
    "role": null,
    "displayName": "Test User"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### Login

| Field   | Value |
|--------|--------|
| **Method** | `POST` |
| **URL**    | `{{baseUrl}}/api/auth/login` |
| **Headers** | `Content-Type: application/json` |
| **Body** (raw JSON) | See below |

**Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "appId": "PASTE_APP_ID_HERE"
}
```

**Response (200):** Same shape as register (`user` + `token`). Use `token` in the **Authorization** header for protected routes.

---

### Get current user (me)

| Field   | Value |
|--------|--------|
| **Method** | `GET` |
| **URL**    | `{{baseUrl}}/api/auth/me` |
| **Headers** | `Authorization: Bearer {{token}}` |

Returns the current user’s profile in this app (same payload as `GET /api/users/me`).

---

### Logout

| Field   | Value |
|--------|--------|
| **Method** | `POST` |
| **URL**    | `{{baseUrl}}/api/auth/logout` |
| **Headers** | (none required) |

**Response (200):** `{ "ok": true, "message": "Client should discard the token" }`.  
With JWT there is no server-side session; the client removes the token from storage.

---

## 3. Protected routes (users – need token)

Set header: **Authorization:** `Bearer YOUR_TOKEN` (or in Postman: `Bearer {{token}}`).

### Current user (me)

| Field   | Value |
|--------|--------|
| **Method** | `GET` |
| **URL**    | `{{baseUrl}}/api/users/me` or `{{baseUrl}}/api/auth/me` |
| **Headers** | `Authorization: Bearer {{token}}` |

Returns the current user’s profile in this app.

---

### List users in this app

| Field   | Value |
|--------|--------|
| **Method** | `GET` |
| **URL**    | `{{baseUrl}}/api/users` |
| **Headers** | `Authorization: Bearer {{token}}` |

Returns only users that have a profile in the same app as the token.

---

### Get user by ID (in this app)

| Field   | Value |
|--------|--------|
| **Method** | `GET` |
| **URL**    | `{{baseUrl}}/api/users/{{userId}}` |
| **Headers** | `Authorization: Bearer {{token}}` |

Replace `{{userId}}` with a user’s global `id`. Returns 404 if that user has no profile in this app.

---

## 4. Feed (videos by app)

Fetch feed content (ready videos) for an app. App via **query `app_id`**, **header `X-App-Id`**, or **JWT**.

### GET /api/feed

| Field   | Value |
|--------|--------|
| **Method** | `GET` |
| **URL**    | `{{baseUrl}}/api/feed?app_id={{appId}}&limit=20` |
| **Headers** | Optional `X-App-Id: {{appId}}` or `Authorization: Bearer {{token}}` |

**Query params:** `app_id` (required if no header/JWT), `category_id` (optional), `limit` (default 50, max 100), `cursor` (for next page).

**Response (200):**
```json
{
  "items": [
    {
      "id": "video-uuid",
      "guid": "1",
      "title": "Banyan Trees",
      "description": null,
      "durationMs": 60000,
      "aspectRatio": 0.56,
      "url": "https://pub-xxx.r2.dev/Banyan_Trees.mp4",
      "thumbnailUrl": null,
      "category": { "id": "...", "name": "News", "slug": "news" },
      "likeCount": 0,
      "upVoteCount": 0,
      "superVoteCount": 0,
      "createdAt": "2025-02-14T..."
    }
  ],
  "nextCursor": "video-uuid-for-next-page",
  "hasMore": true
}
```

---

## 5. Events (M2 – event logging)

App context via **body `app_id`**, **header `X-App-Id`**, or **JWT** (if present). Optional auth for anonymous events.

### POST /events (store event)

| Field   | Value |
|--------|--------|
| **Method** | `POST` |
| **URL**    | `{{baseUrl}}/events` |
| **Headers** | `Content-Type: application/json`, optional `X-App-Id: {{appId}}`, optional `Authorization: Bearer {{token}}` |
| **Body** (raw JSON) | See below |

**Body (minimal):**
```json
{
  "type": "feed",
  "event": "feed_view",
  "app_id": "PASTE_APP_ID_HERE",
  "request_id": "uuid-feed-session",
  "rank_position": 1,
  "feed_mode": "normal",
  "item_id": "video-uuid"
}
```

**Body (gesture_commit):**
```json
{
  "type": "gesture",
  "event": "gesture_commit",
  "app_id": "PASTE_APP_ID_HERE",
  "direction_key": "up",
  "gesture_action": "Next",
  "item_id": "video-uuid",
  "gesture_source": "sButton",
  "request_id": "...",
  "rank_position": 1,
  "feed_mode": "normal",
  "ts": 1700000000000
}
```

**Response (201):** `{ "ok": true, "id": "event-uuid" }`

---

### GET /events (query)

| Field   | Value |
|--------|--------|
| **Method** | `GET` |
| **URL**    | `{{baseUrl}}/events?app_id={{appId}}&limit=100` |
| **Headers** | Optional `X-App-Id: {{appId}}` or `Authorization: Bearer {{token}}` |

**Query params:** `type`, `event`, `request_id`, `item_id`, `gesture_direction`, `limit` (default 100, max 500).

**Response (200):** `{ "events": [ ... ] }`

---

## 6. Video interactions (like, up_vote, super_vote)

Require **Authorization: Bearer {{token}}**. Video must belong to the same app as the token.

### POST /api/videos/:videoId/vote

Records a like, up_vote, or super_vote on a video and increments the video’s counts.

| Field   | Value |
|--------|--------|
| **Method** | `POST` |
| **URL**    | `{{baseUrl}}/api/videos/{{videoId}}/vote` |
| **Headers** | `Content-Type: application/json`, `Authorization: Bearer {{token}}` |
| **Body** (raw JSON) | See below |

**Request body:**

| Field          | Type   | Required | Description |
|----------------|--------|----------|-------------|
| `voteType`     | string | Yes      | `"like"` \| `"up_vote"` \| `"super_vote"` |
| `gestureSource`| string | No       | e.g. `double_tap`, `triple_tap`, `s_gesture`, `clap` |
| `requestId`    | string | No       | Feed session id |
| `rankPosition` | number | No       | Position in feed when voted |
| `feedMode`     | string | No       | `default` \| `inform` |

**Example – Like (double-tap):**
```json
{
  "voteType": "like",
  "gestureSource": "double_tap",
  "requestId": "a1b2c3d4-...",
  "rankPosition": 1,
  "feedMode": "default"
}
```

**Example – Up vote (triple-tap):**
```json
{
  "voteType": "up_vote",
  "gestureSource": "triple_tap",
  "requestId": "a1b2c3d4-...",
  "rankPosition": 1
}
```

**Example – Super vote (S-gesture):**
```json
{
  "voteType": "super_vote",
  "gestureSource": "s_gesture",
  "requestId": "a1b2c3d4-...",
  "rankPosition": 2,
  "feedMode": "default"
}
```

**Response (201):**
```json
{
  "vote": {
    "id": "vote-uuid",
    "videoId": "video-uuid",
    "voteType": "like",
    "gestureSource": "double_tap",
    "weight": 1,
    "isDenied": false,
    "denyReason": null,
    "createdAt": "2025-02-17T12:00:00.000Z"
  },
  "counts": {
    "likeCount": 5,
    "upVoteCount": 2,
    "superVoteCount": 0
  }
}
```

If the vote is denied (e.g. daily limit), `vote.isDenied` is `true` and `vote.denyReason` may be set; `counts` are not incremented for that vote.

**Errors:** `400` invalid `voteType`; `401` missing/invalid token; `404` video not found or not in this app.

---

## 7. Health (no auth)

| Field   | Value |
|--------|--------|
| **Method** | `GET` |
| **URL**    | `{{baseUrl}}/health` |

**Response (200):** `{ "ok": true }`

---

## Postman variables (recommended)

| Variable | Example | When to set |
|----------|---------|-------------|
| `baseUrl` | `http://localhost:3000` | Collection or env |
| `appId`   | (copy from Create App response `id`) | After **Create App** |
| `token`   | (copy from Register/Login response `token`) | After **Register** or **Login** |
| `userId`  | (copy from `user.id` or from list users) | When testing GET /api/users/:id |
| `videoId` | (copy from feed item `id` or video uuid) | When testing POST /api/videos/:videoId/vote |

---

## Quick test order

1. **POST** `/api/apps` → copy `id` → set `appId`.
2. **POST** `/api/auth/register` with that `appId` → copy `token` → set `token`.
3. **GET** `/api/auth/me` (or `/api/users/me`) with `Authorization: Bearer {{token}}`.
4. **GET** `/api/users` with same header to list users in the app.
5. **POST** `/api/auth/logout` when done (client discards token).
6. **POST** `/events` with `app_id` in body (or `X-App-Id`) to log an event; **GET** `/events?app_id=...` to query.
7. **GET** `/api/feed?app_id={{appId}}` → copy a video `id` → set `videoId`. **POST** `/api/videos/{{videoId}}/vote` with body `{ "voteType": "like" }` and `Authorization: Bearer {{token}}`.

If you use a second app `id` in login, the token will be for that app and `/api/users` will show only users in that app (multi-tenant isolation).
