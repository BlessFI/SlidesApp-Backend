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

## 4. Events (M2 – event logging)

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

## 5. Health (no auth)

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

---

## Quick test order

1. **POST** `/api/apps` → copy `id` → set `appId`.
2. **POST** `/api/auth/register` with that `appId` → copy `token` → set `token`.
3. **GET** `/api/auth/me` (or `/api/users/me`) with `Authorization: Bearer {{token}}`.
4. **GET** `/api/users` with same header to list users in the app.
5. **POST** `/api/auth/logout` when done (client discards token).
6. **POST** `/events` with `app_id` in body (or `X-App-Id`) to log an event; **GET** `/events?app_id=...` to query.

If you use a second app `id` in login, the token will be for that app and `/api/users` will show only users in that app (multi-tenant isolation).
