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
| POST   | `/api/auth/refresh`  | Yes | Issue a new JWT from an existing (non-expired) token |
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
      "url": "https://pub-xxx.r2.dev/.../hls/master.m3u8",
      "mp4Url": "https://pub-xxx.r2.dev/.../source.mp4",
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

## 4b. Categories (list for app)

App via **query `app_id`**, **header `X-App-Id`**, or **JWT**. Use category `id` in `POST /api/videos` or feed `category_id` filter.

### GET /api/categories

| Field   | Value |
|--------|--------|
| **Method** | `GET` |
| **URL**    | `{{baseUrl}}/api/categories?app_id={{appId}}` |
| **Headers** | Optional `X-App-Id: {{appId}}` or `Authorization: Bearer {{token}}` |

**Response (200):**
```json
{
  "categories": [
    { "id": "uuid", "name": "News", "slug": "news" },
    { "id": "uuid", "name": "Sports", "slug": "sports" }
  ]
}
```

**Errors:** `400` missing app context; `404` app not found.

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

**Body (gesture_commit):** Send `direction_key` and `gesture_action` per the table below. All 8 are supported.

| direction_key | gesture_action  |
|---------------|-----------------|
| `up`          | Next            |
| `down`        | Previous        |
| `left`        | Back            |
| `right`       | Same topic      |
| `upLeft`      | Restart         |
| `upRight`     | Same category   |
| `downLeft`    | Inform          |
| `downRight`   | Same subject    |

Example:
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

## 6. Video create and update (upload)

Require **Authorization: Bearer {{token}}**. Creates/updates videos in the same app as the token. Optional video/thumbnail uploads go to Cloudflare R2 when env is configured.

**Token tip:** Use the **string** value from the login/register response (e.g. `response.token` or `data.token`), not the whole JSON. Header must be exactly: `Authorization: Bearer <that-string>`.

### GET /api/videos/:videoId (fetch one video)

Use this to **fetch a video you uploaded** (e.g. to poll until `status` is `"ready"`). Same app as your token.

| Field   | Value |
|--------|--------|
| **Method** | `GET` |
| **URL**    | `{{baseUrl}}/api/videos/{{videoId}}` |
| **Headers** | `Authorization: Bearer {{token}}` |

**Response (200):** Video with `id`, `status` (`processing` \| `ready` \| `failed`), `assets`, `primaryAsset` (HLS URL when ready), `category`, etc.

**Response (404):** Video not found or not in your app.

### POST /api/videos (upload video)

| Field   | Value |
|--------|--------|
| **Method** | `POST` |
| **URL**    | `{{baseUrl}}/api/videos` |
| **Headers** | `Content-Type: application/json`, `Authorization: Bearer {{token}}` |
| **Body** (raw JSON) | See below |

**Request body:**

| Field             | Type   | Required | Description |
|-------------------|--------|----------|-------------|
| `durationMs`      | number | Yes      | Video duration in milliseconds |
| `title`           | string | No       | Video title |
| `description`     | string | No       | Video description |
| `topicId`         | string | No       | UUID of a TaxonomyNode with kind `topic` |
| `categoryId`      | string | No       | UUID of a TaxonomyNode with kind `category` |
| `subjectId`       | string | No       | UUID of a TaxonomyNode with kind `subject` |
| `aspectRatio`     | number | No       | e.g. 1.78 for 16:9 |
| `videoUrl`        | string | No*      | Existing video URL (use this **or** `videoBase64`) |
| `videoBase64`     | string | No*      | Data URL or base64 video to upload to R2 (use this **or** `videoUrl`) |
| `thumbnailBase64` | string | No       | Data URL or base64 image to upload to R2 as thumbnail |

\* One of `videoUrl` or `videoBase64` is required.

**Sending base64 video:** In the request body (raw JSON), use the **key** `videoBase64`. The **value** is the video as either:
- **Data URL:** `"data:video/mp4;base64,<base64-string>"`
- **Raw base64:** `"<base64-string>"` (long string, no prefix; length &gt; 100)

Example minimal body with base64:
```json
{
  "durationMs": 60000,
  "title": "My video",
  "videoBase64": "data:video/mp4;base64,AAAAIGZ0eXBpc29t..."
}
```
Replace the `...` with your full base64 payload. In Postman: Body → raw → JSON, then paste the JSON with `videoBase64` as the key.

**Example – create with existing URL:**
```json
{
  "durationMs": 60000,
  "title": "My first reel",
  "description": "Short clip",
  "categoryId": "uuid-of-your-category",
  "videoUrl": "https://example.com/video.mp4"
}
```

**Example – create with base64 upload to R2:**
```json
{
  "durationMs": 45000,
  "title": "Uploaded reel",
  "categoryId": "uuid-of-your-category",
  "videoBase64": "data:video/mp4;base64,AAAAIGZ0eXBpc29t...",
  "thumbnailBase64": "data:image/png;base64,iVBORw0KGgo..."
}
```

**Response (201):** Created video with `id`, `assets`, `primaryAsset`, and metadata. Video starts with **`status: "processing"`**; when the background job finishes it becomes **`"ready"** (or **`"failed"** on error). **Errors:** `400` missing both `videoUrl` and `videoBase64`; `401` missing/invalid token; `503` R2 env not set when using base64 upload.

---

#### Testing the video processing pipeline (HLS + 3 thumbnails)

1. **Register/Login** and set `Authorization: Bearer {{token}}`.
2. **POST** the request below. The backend will enqueue a job (or run in-process if Redis is down), then return immediately with `status: "processing"`.
3. When processing finishes, the video gets **HLS** (9:16, 1920p) and **3 thumbnails** (5s, 15s, 30s) on R2, and **`status`** becomes **`"ready"**. It will then appear in **GET /api/feed**.

**Endpoint:** `POST {{baseUrl}}/api/videos`

**Headers:**
- `Content-Type: application/json`
- `Authorization: Bearer {{token}}`

**Minimal body (videoUrl – easiest to test):**
```json
{
  "durationMs": 60000,
  "title": "Test processing",
  "videoUrl": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
}
```

**With category (if you have a category UUID):**
```json
{
  "durationMs": 60000,
  "title": "Test processing",
  "description": "Pipeline test",
  "categoryId": "YOUR_CATEGORY_UUID_HERE",
  "videoUrl": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
}
```

**Example 201 response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "appId": "...",
  "creatorId": "...",
  "status": "processing",
  "title": "Test processing",
  "description": null,
  "durationMs": 60000,
  "aspectRatio": null,
  "primaryAssetId": null,
  "assets": [],
  "primaryAsset": null,
  "createdAt": "...",
  "updatedAt": "..."
}
```

After a while, call **GET /api/feed?app_id={{appId}}** and look for this video (same `id`). When `status` is `"ready"`, the item will have `url` (HLS manifest) and `thumbnailUrl` / `thumbnailUrls` (5, 15, 30s).

---

### PATCH /api/videos/:videoId (update video)

| Field   | Value |
|--------|--------|
| **Method** | `PATCH` |
| **URL**    | `{{baseUrl}}/api/videos/{{videoId}}` |
| **Headers** | `Content-Type: application/json`, `Authorization: Bearer {{token}}` |
| **Body** (raw JSON) | See below |

**Request body:** All fields optional. Only the video’s creator (same app) can update.

| Field             | Type   | Description |
|-------------------|--------|-------------|
| `title`           | string | Video title |
| `description`     | string | Video description |
| `topicId`         | string | TaxonomyNode UUID (topic) |
| `categoryId`      | string | TaxonomyNode UUID (category) |
| `subjectId`       | string | TaxonomyNode UUID (subject) |
| `durationMs`       | number | Duration in ms |
| `aspectRatio`     | number | e.g. 1.78 |
| `videoBase64`     | string | New primary video (uploaded to R2) |
| `thumbnailBase64` | string | New thumbnail (uploaded to R2) |

**Example:**
```json
{
  "title": "Updated title",
  "description": "New description",
  "categoryId": "uuid-of-category"
}
```

**Response (200):** Updated video with `assets`, `primaryAsset`. **Errors:** `401` missing/invalid token; `404` video not found or not owned by you; `503` R2 env not set when using base64.

---

## 7. Video interactions (like, up_vote, super_vote)

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

## 8. Health (no auth)

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
| `videoId` | (copy from feed item `id` or video uuid) | When testing PATCH /api/videos/:videoId or POST /api/videos/:videoId/vote |

---

## Quick test order

1. **POST** `/api/apps` → copy `id` → set `appId`.
2. **POST** `/api/auth/register` with that `appId` → copy `token` → set `token`.
3. **GET** `/api/auth/me` (or `/api/users/me`) with `Authorization: Bearer {{token}}`.
4. **GET** `/api/users` with same header to list users in the app.
5. **POST** `/api/auth/logout` when done (client discards token).
6. **POST** `/events` with `app_id` in body (or `X-App-Id`) to log an event; **GET** `/events?app_id=...` to query.
7. **POST** `/api/videos` with `Authorization: Bearer {{token}}` and body e.g. `{ "durationMs": 60000, "title": "Test", "videoUrl": "https://example.com/video.mp4" }` to upload a video; or **GET** `/api/feed?app_id={{appId}}` → copy a video `id` → set `videoId`. **PATCH** `/api/videos/{{videoId}}` to update; **POST** `/api/videos/{{videoId}}/vote` with body `{ "voteType": "like" }` to vote.

If you use a second app `id` in login, the token will be for that app and `/api/users` will show only users in that app (multi-tenant isolation).
