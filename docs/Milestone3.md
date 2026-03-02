# Milestone 3 — Scope and Next Steps

**M3 goal:** Core UX v1 with stable playback/prefetch, gesture-driven candidate sets, Restart/Inform semantics, P/V MVPs, daily vote limits (ledger), Draw U/S voting, end-to-end signal logging with `request_id` + `rank_position`, and **MRSS feed with individual accounts per Content Provider**.

**Acceptance:** Demo proves all of the above + server events correct.

---

## Milestone timeline (reference)

| Milestone | Scope | Due |
|-----------|--------|-----|
| **M3** | Core UX v1 (no purchases): feed UX per PDF, playback+prefetch, gestures→candidate sets, Restart/Inform, P/V MVP, vote ledger 3/day+1/day, Draw U/S, signals w/ request_id+rank_position, **MRSS feed w/ individual accounts per Content Provider**. | Mar 27 |
| **M4** | Purchases + Settings: SuperVote purchases (RevenueCat), buy+restore, server verify, idempotent crediting; Settings: Reset AI Feed, Shake-to-Restart toggle, Revolving transition behind feature flag; events for purchases+settings. | Apr 10 |
| **M5** | DevOps + Beta: AWS staging+prod, CI/CD, crash reporting, backups+runbook, TestFlight + Play Internal Testing, handover docs (deploy, feature flags, app_id). | (see contract) |

---

## What M2 already delivered (backend)

- **Taxonomy:** Primary category (required) + secondary labels; feed filter by `category_id` / `topic_id` / `subject_id`; fallback to general feed when no matches.
- **Feed:** Returns `request_id` and per-item `rank_position`; optional `?request_id=`; response schema.
- **Events:** POST/GET with `request_id`, `rank_position`, `schema_version`; stored and queryable.
- **Votes:** Like / up_vote / super_vote recorded; feed includes `like_by_you`, `upvote_by_you`, `supervote_by_you`.
- **Gestures:** Events accept `direction_key`, `gesture_action`, `feed_mode`, etc.

---

## M3 scope (one-line summary)

Main feed UX per PDF; stable playback + prefetch; Category/Topic/Subject drive next video via candidate sets; Restart = new session (new `request_id`); Inform = `feed_mode=inform`; P preview MVP; V voice MVP intents; UpVote 3/day + SuperVote 1/day wired to server ledger; Draw U / Draw S voting; signals logged end-to-end with `request_id` + `rank_position`; **MRSS feed with individual accounts for each Content Provider**.

---

## What each M3 item means

| M3 item | Meaning |
|--------|--------|
| **Core UX v1** | Main feed experience is the first “official” version: matches the PDF (layout, flow, behaviour). |
| **Stable playback + prefetch** | Client: no stutter; prefetch next video(s) so “next” feels instant. Backend already provides feed + URLs. |
| **Category/Topic/Subject → candidate sets** | “Same Category/Topic/Subject” gestures drive *what* the next video is. Next video comes from feed filtered by that dimension. Backend supports `?category_id=`, `?topic_id=`, `?subject_id=`; client uses those and treats the response as the candidate set for “next”. |
| **Restart = new session (new request_id)** | Restart gesture starts a new feed session: client calls `GET /api/feed` again without sending `request_id` (or with a new one), uses the new `request_id` from the response for all subsequent events. |
| **Inform = feed_mode=inform** | When the user is in “Inform” mode, client sends events with `feed_mode: "inform"` so analytics can separate inform sessions from normal feed. Backend already accepts and stores `feed_mode`. |
| **P preview MVP** | “P” = preview feature (e.g. keyboard shortcut or button) in MVP form. Likely client UX; backend only if preview needs a dedicated endpoint or event type. |
| **V voice MVP intents** | “V” = voice: recognise a small set of intents (e.g. “next”, “like”, “restart”) and map to actions. Usually client or separate voice service; backend only if you add a “voice intent” event type or webhook. |
| **UpVote 3/day + SuperVote 1/day + server ledger** | Backend enforces: up_vote max 3 per user per day, super_vote max 1 per user per day; persist usage (ledger/quota) and return a clear error (e.g. 429) when over limit. |
| **Draw U / Draw S voting** | Gestures: drawing “U” = up_vote, “S” = super_vote. Client sends the same `POST /api/videos/:id/vote` with `voteType: "up_vote"` or `"super_vote"`; subject to same daily limits. |
| **Signals with request_id + rank_position** | Every important signal (impressions, gestures, votes) is logged with `request_id` and `rank_position`. Backend already supports this; client must send them for all relevant actions. |
| **MRSS feed with individual accounts per Content Provider** | Ingest video from MRSS; each Content Provider has its own account/credentials (e.g. per-provider API keys or ingest source). Backend stores which provider each video came from and supports multiple provider configs. |

---

## MRSS: what it is, why it’s there, and steps

### What is it for? (use case)

VideoElephant (and similar providers) give you a **feed URL** that returns a list of videos (XML). **MRSS ingest** means: the backend fetches that URL (with the credentials they gave you), reads each video entry, and **creates a video in your app** for each one. Those videos then show up in your main feed like any other. So you get a steady stream of vertical content without an admin UI or manual uploads. You can run the ingest on a schedule (e.g. daily) or on demand with the script below.

### What is MRSS?

**MRSS (Media RSS)** is an RSS-style XML format for **video (and other media) feeds**. Publishers (Content Providers) expose a URL that returns XML: each `<item>` describes one video (title, description, media URL, thumbnails, duration, etc.). The backend (or an ingest job) **polls that URL**, parses the XML, and creates/updates videos in the app so they appear in the feed without manual upload.

### Why is it in M3?

- **Content at scale:** Video comes from external providers (e.g. VideoElephant) automatically; no one has to upload each clip by hand.
- **Per-provider accounts:** Each Content Provider has its **own** feed URL and credentials. The backend keeps one “account”/config per provider and tags each video with that provider (`ingestSource` / provider_id) for attribution, billing, and support. New providers can be added without changing the app’s core flow.

### Steps to implement (backend)

1. **Provider model / config**
   - Add a way to store **per–Content Provider** config: unique id, name, MRSS feed URL, auth (e.g. Basic: username/password in env), default `primaryCategoryId` (or use ingest default rules keyed by `ingestSource`), optional rate/limits.
   - First provider: **VideoElephant** (see [README § MRSS and Content Provider feeds](../README.md)). Feed URL for vertical: `https://mrss.videoelephant.com/mrss?original=true`. Auth: Basic; credentials in `MRSS_VIDEOELEPHANT_USERNAME` and `MRSS_VIDEOELEPHANT_PASSWORD` (see [ENV.md](ENV.md)).

2. **Ingest job**
   - Scheduled job (or on-demand) that, per provider:
     - Fetches the MRSS URL (with Basic auth if required).
     - Parses the XML and, for each item, extracts: video URL, title, description, thumbnails, duration (if present).
     - For each item: create or update a video via the existing flow (e.g. `POST /api/videos` or internal service) with `videoUrl`, `title`, `description`, `durationMs`, `primaryCategoryId` (from provider default or mapping), `ingestSource` = provider key (e.g. `videoelephant`). Use ingest default rules so `primaryCategoryId` (and optional `secondaryLabels`) can be set by `ingestSource`.
   - Ensure videos are attributed to the provider (e.g. `ingestSource` on `Video`); optional: store provider_id on events if you log ingest events.

3. **VideoElephant specifics (from client)**
   - **Platform:** platform.videoelephant.com  
   - **Vertical feed (retain vertical):** `https://mrss.videoelephant.com/mrss?original=true`  
   - **Auth:** Basic; credentials in env (do not commit). New vertical feeds they onboard are auto-added to this feed.

4. **Docs and reference**
   - README already documents VideoElephant URL, `original=true`, and env vars. Use the client-provided **VideoElephant MRSS Delivery Guide** (PDF) for the full MRSS spec and field meanings.

5. **Acceptance**
   - At least one provider (VideoElephant) ingests successfully; each video has `ingestSource` set; multiple providers can be added with separate configs/accounts.

### MRSS API reference (endpoints, body, query, response)

All MRSS/content-provider and admin-ingest endpoints require **`Authorization: Bearer <token>`** (JWT); app is taken from the token.

---

#### 1. List content providers

| | |
|--|--|
| **Method** | `GET` |
| **Endpoint** | `/api/content-providers` |
| **Query** | — |
| **Body** | — |
| **Response** | `200` — `{ "contentProviders": [ { "id", "sourceKey", "name", "mrssUrl", "defaultPrimaryCategoryId", "ingestUserId", "isActive", "createdAt" }, ... ] }` |

---

#### 2. Create content provider

| | |
|--|--|
| **Method** | `POST` |
| **Endpoint** | `/api/content-providers` |
| **Query** | — |
| **Body** | `{ "sourceKey": "videoelephant", "mrssUrl": "https://mrss.videoelephant.com/mrss?original=true", "ingestUserId": "<user-uuid>", "name": "VideoElephant", "defaultPrimaryCategoryId": "<category-uuid>" }` — **Required:** `sourceKey`, `mrssUrl`, `ingestUserId`. **Optional:** `name`, `defaultPrimaryCategoryId`. |
| **Response** | `201` — created provider object. `400` — invalid `ingestUserId` (user not found or no profile in app) or invalid `defaultPrimaryCategoryId`. |

---

#### 3. Run MRSS ingest (single provider or all)

| | |
|--|--|
| **Method** | `POST` |
| **Endpoint** | `/api/admin/ingest/mrss` |
| **Query** | — |
| **Body** | `{ "appId": "<app-id>", "sourceKey": "videoelephant" }` — **Optional:** `appId` (default: app from JWT). **Optional:** `sourceKey` (if omitted, runs all active providers for the app). |
| **Response** | **With `sourceKey`:** `200` — `{ "providerId", "sourceKey", "fetched", "created", "skipped", "errors": [] }`. `404` — provider not found or inactive. **Without `sourceKey`:** `200` — `{ "message": "Ran ingest for N provider(s)", "results": [ { "providerId", "sourceKey", "fetched", "created", "skipped", "errors" }, ... ] }`. `403` if body `appId` does not match JWT app. |

---

#### 4. Ingest default rule (for default category per source)

| | |
|--|--|
| **Method** | `POST` |
| **Endpoint** | `/api/ingest-default-rules` |
| **Query** | — |
| **Body** | `{ "sourceKey": "videoelephant", "defaultCategoryIds": [ "<category-uuid>" ], "defaultTopicIds": [], "defaultSubjectIds": [] }` — **Required:** `sourceKey`. **Optional:** `defaultCategoryIds`, `defaultTopicIds`, `defaultSubjectIds`. |
| **Response** | `200` / `201` — rule created or updated. |

---

#### 5. Feed (includes ingestSource per item)

| | |
|--|--|
| **Method** | `GET` |
| **Endpoint** | `/api/feed` |
| **Query** | `app_id` (required via query or `X-App-Id` or JWT), `request_id`, `category_id`, `topic_id`, `subject_id`, `limit`, `cursor`. |
| **Body** | — |
| **Response** | `200` — `{ "request_id", "items": [ { "id", "guid", "title", "description", "durationMs", "primaryCategory", "secondaryLabels", "ingestSource", "rank_position", "url", "thumbnailUrl", "categories", "topics", "subjects", "likeCount", "upVoteCount", "superVoteCount", "like_by_you", "upvote_by_you", "supervote_by_you", ... }, ... ], "nextCursor", "hasMore" }`. Each item includes **`ingestSource`** (e.g. `"videoelephant"` or `null`) when from MRSS. |

---

### Env (MRSS)

**.env.example** includes (commented) MRSS credentials for Content Provider auth:

```env
# MRSS / Content Provider (e.g. VideoElephant) — Basic auth for ingest jobs; do not commit secrets
# MRSS_VIDEOELEPHANT_USERNAME=
# MRSS_VIDEOELEPHANT_PASSWORD=
```

Set these in `.env` (uncommented, with real values from the client) before calling `POST /api/admin/ingest/mrss`. Convention for other providers: `MRSS_<SOURCE_KEY_UPPER>_USERNAME` and `MRSS_<SOURCE_KEY_UPPER>_PASSWORD` (see [ENV.md](ENV.md)).

### One-off script (no admin UI)

A script sets up the VideoElephant provider and runs the ingest for a given app and user. No admin area required.

1. **In `.env`** (do not commit real values):
   ```env
   MRSS_VIDEOELEPHANT_USERNAME=verticalapp@videoelephant.com
   MRSS_VIDEOELEPHANT_PASSWORD=<password-from-client>
   ```
2. **Ensure the app has at least one category** (e.g. run `npm run db:seed` or seed categories for the app).
3. **Run** (use your `appId` and `userId`; the script has defaults for the shared project):
   ```bash
   npx tsx scripts/run-mrss-ingest.ts <appId> <userId>
   # or
   npm run ingest:mrss -- <appId> <userId>
   ```
   Example:
   ```bash
   npx tsx scripts/run-mrss-ingest.ts cmlqd4ag90000s1hi78ws4s8h cmlphwbpm0000s1kghvutddak
   ```
   The script: ensures an ingest default rule and content provider for `videoelephant`, then fetches the MRSS feed and creates videos. New videos appear in `GET /api/feed` once processing is done.

### Hourly ingest cron (e.g. Railway)

When deployed, the server can run MRSS ingest **every hour** in the background (10 videos per run, one-at-a-time until each is ready). Set in your host env:

- `MRSS_INGEST_ENABLED=1`
- `MRSS_INGEST_APP_ID=<your-app-uuid>`
- Optional: `MRSS_INGEST_SOURCE_KEY=videoelephant` (default)

Ensure the content provider and ingest rule exist for that app (run the one-off script once or create via API). See [ENV.md](ENV.md) § "Optional (hourly MRSS ingest cron)".

---

## Backend next steps

### 1. UpVote 3/day + SuperVote 1/day ledger (required)

- **Schema:** Count per-user up_votes and super_votes per calendar day (e.g. use existing `Vote` table with `voteType` + `createdAt`, or a small `vote_quota` / ledger table keyed by `userId` + date).
- **Logic:** Before creating an `up_vote` or `super_vote`, count how many that user has already today (same app). If at cap (3 for up_vote, 1 for super_vote), reject with **429** (or 400) and a clear message, e.g. `"UpVote limit reached (3/day)"` or `"SuperVote limit reached (1/day)"`.
- **Response:** Optionally include remaining quota in the vote response or a small “me”/quota endpoint (e.g. `upVotesRemainingToday`, `superVotesRemainingToday`). Like has no daily cap unless product says otherwise.
- **Docs:** Document the limits and error shape in README and any API docs.

### 2. Restart / Inform / signals (verify and document)

- **Restart:** No backend change. Document that Restart = client calls `GET /api/feed` again (no `request_id` in query), uses new `request_id` from response for all subsequent events.
- **Inform:** No backend change. Document that client must set `feed_mode: "inform"` on all events while in Inform mode.
- **Signals:** Audit event and vote payloads so every important action can carry `request_id` and `rank_position`; document that client must send them for M3 (events and vote endpoint already accept them).

### 3. P preview / V voice (if needed)

- **Preview:** Add a “preview” event type or endpoint only if product needs server-side preview tracking (e.g. `POST /events` with `event: "preview"` and `request_id` + `rank_position`). Otherwise treat as client-only.
- **Voice:** Add a “voice_intent” event type or webhook only if intents are processed server-side; otherwise ensure any client-sent voice actions are logged as normal events with `request_id` + `rank_position`.

### 4. Draw U / Draw S

- No new backend contract. Document that Draw U and Draw S are sent as `voteType: "up_vote"` and `"super_vote"` respectively, subject to the same daily limits.

### 5. MRSS feed with individual accounts per Content Provider

See **[MRSS: what it is, why it’s there, and steps](#mrss-what-it-is-why-its-there-and-steps)** above for full context. Summary:

- **Model:** Each Content Provider has an identity and config (MRSS URL, Basic auth from env, default primary category or ingest rule). Store per provider; do not hardcode secrets.
- **Ingest job:** Fetch MRSS URL (with Basic auth), parse XML, create/update videos via existing API with `ingestSource` = provider key (e.g. `videoelephant`). Use ingest default rules for `primaryCategoryId` per `ingestSource`.
- **VideoElephant:** Use `https://mrss.videoelephant.com/mrss?original=true` for vertical; credentials in env (README + ENV.md).
- **Acceptance:** At least VideoElephant ingests; each video has `ingestSource`; multiple providers supported with separate accounts/configs.

### 6. Checklist (backend)

- [ ] Implement daily ledger: up_vote 3/day, super_vote 1/day; reject with 429 + message when over limit.
- [ ] Optionally expose remaining quota (vote response or quota endpoint).
- [ ] Document Restart = new feed call → new `request_id`.
- [ ] Document Inform = `feed_mode: "inform"` on events.
- [ ] Document that all signals must include `request_id` + `rank_position`.
- [ ] Add preview/voice event types or endpoints only if required.
- [ ] Document Draw U / Draw S as up_vote / super_vote.
- [ ] MRSS feed: provider model/config; ingest job (fetch MRSS, parse, create/update videos with `ingestSource`); VideoElephant vertical URL + Basic auth from env; events/attribution correct.

---

## Frontend next steps

### 1. Core UX v1 and feed UX per PDF

- Align main feed layout, navigation, and behaviour with the PDF spec.
- Implement **stable playback** (buffer policy, HLS/MP4 handling) so playback does not stutter.
- Implement **prefetch** for the next video(s) (e.g. load next item in the candidate set) so “next” feels instant.

### 2. Gestures and candidate sets

- **Same Category / Topic / Subject:** When the user performs these gestures, the “next” video must come from the corresponding candidate set. Call `GET /api/feed` with the appropriate filter:
  - Same Category: `?category_id=<primaryCategory.id>` (and `app_id`, etc.).
  - Same Topic: `?topic_id=<topic.id>` (when available).
  - Same Subject: `?subject_id=<subject.id>` (when available).
- Use the returned `items` as the candidate set for “next” in that mode; advance through the set (and optionally request more pages with `cursor` when needed).
- **Restart:** On Restart gesture, call `GET /api/feed` again without `request_id`; take the new `request_id` from the response and use it for all subsequent events (and votes) in that session.
- **Inform:** When entering Inform mode, set `feed_mode: "inform"` on all subsequent event payloads until the user leaves Inform mode.

### 3. P preview MVP

- Implement “P” (e.g. keyboard shortcut or button) for the preview feature per product spec.
- If preview is tracked server-side, send an event (e.g. `event: "preview"`) with `request_id` and `rank_position`.

### 4. V voice MVP intents

- Implement voice input and map a small set of intents (e.g. “next”, “like”, “restart”, “upvote”, “supervote”) to the same actions as gestures/buttons.
- Send resulting actions as usual (feed navigation, vote API, events) with `request_id` and `rank_position` so signals are logged end-to-end.

### 5. UpVote / SuperVote and Draw U / Draw S

- **UpVote (3/day) / SuperVote (1/day):** Call `POST /api/videos/:videoId/vote` with `voteType: "up_vote"` or `"super_vote"`. Handle **429** (or 400) when over limit; show user a clear message (e.g. “UpVote limit reached (3/day)”). Optionally use remaining-quota from the API to show “X upvotes left today”.
- **Draw U / Draw S:** Map draw gesture “U” to up_vote and “S” to super_vote; send the same vote API with `request_id` and `rank_position` (from the current feed item).

### 6. Signals end-to-end

- Ensure **every** important user action that should be attributed to a feed session sends `request_id` and `rank_position`:
  - Events: `POST /events` with `request_id`, `rank_position`, and (for Inform) `feed_mode: "inform"`.
  - Votes: `POST /api/videos/:videoId/vote` with `requestId` and `rankPosition` in the body.
- Use the `request_id` from the current feed response and the `rank_position` of the item the user is interacting with.

### 7. Checklist (frontend)

- [ ] Feed UX per PDF: layout, flow, stable playback, prefetch.
- [ ] Same Category/Topic/Subject: use filtered feed as candidate set for “next”.
- [ ] Restart: new feed call, new `request_id` for subsequent signals.
- [ ] Inform: set `feed_mode: "inform"` on all events in that mode.
- [ ] P preview MVP implemented; preview event sent with `request_id` + `rank_position` if required.
- [ ] V voice MVP: intents mapped to actions; actions logged with `request_id` + `rank_position`.
- [ ] UpVote/SuperVote: handle 429 and optional quota; Draw U → up_vote, Draw S → super_vote.
- [ ] All signals include `request_id` and `rank_position`.
- [ ] (If applicable) Any MRSS/ingest UI or provider config is aligned with backend provider accounts.

---

## Acceptance (M3)

- **Demo** proves: main feed UX per PDF, stable playback + prefetch, gestures (Category/Topic/Subject → candidate sets), Restart (new request_id), Inform (feed_mode=inform), P preview, V voice intents, UpVote 3/day + SuperVote 1/day (ledger), Draw U/S voting, signals with request_id+rank_position, and MRSS with individual accounts per Content Provider.
- **Server events** are correct (request_id, rank_position, feed_mode, vote types, ingest/provider attribution as needed).

---

## Cross-cutting

- **Backend** implements the ledger and documents behaviour; **frontend** uses the same feed and vote APIs, sends `request_id`/`rank_position` everywhere, and implements UX (gestures, P, V, Draw U/S, Restart, Inform).
- For any new event or action in M3, ensure both sides agree on payload shape and that `request_id` and `rank_position` are always sent when the action is tied to a feed session.
