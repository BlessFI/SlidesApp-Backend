# Frontend: Categories & Secondary Labels

This doc describes what the frontend needs for **categories** and **secondary labels** after the taxonomy change (primary category per video, optional secondary labels). Topic and Subject are not required on upload and may be derived later.

---

## 1. Primary categories (what users see + “Same Category”)

Each video has **exactly one** primary category. This is what you show in the UI and what powers the **“Same Category”** gesture (e.g. upRight → more videos in the same category).

### Canonical V1 list (for reference)

These are the intended top-level categories; the **source of truth** for your app is the API.

| Slug / name |
|-------------|
| News |
| Politics |
| Sports |
| Entertainment |
| Lifestyle |
| Technology |
| Business |
| Finance |
| Travel |
| Health |
| Fitness |
| Culture |
| Food |
| Music |
| Gaming |
| Motoring |
| Ambient |

### How to get the list in the app

- **`GET /api/categories`**  
  Returns `{ categories: [{ id, name, slug }] }` for the current app (app from `app_id` query, `X-App-Id` header, or JWT).

- **`GET /api/taxonomy?kind=category`**  
  Returns taxonomy nodes with `kind=category` for the app (same shape: `{ categories: [...] }` or equivalent by kind).

Use these **ids** when:
- Building nav or filter chips (use `id` for `category_id` in feed).
- Sending `primaryCategoryId` on **upload** or **PATCH**.

Do **not** hardcode UUIDs; they are app-specific. Use the API response.

---

## 2. Secondary labels (filtering / metadata)

Secondary labels are **optional** per video. They are **strings** (e.g. `"Weather"`, `"Fashion"`), not UUIDs. They are used for filtering and metadata; they are **not** in the main nav.

### Secondary label → primary category mapping (for UI/filtering)

When showing or filtering by a secondary label, you can map it to a primary category for “Same Category” behavior:

| Secondary label | Maps to primary category |
|-----------------|---------------------------|
| Weather | News (or Lifestyle for “weather vibes”; default News) |
| Fashion | Lifestyle |
| Beauty | Lifestyle |
| Crypto | Business & Finance |
| Comedy | Entertainment |
| Science | Technology |
| Hobbies | Lifestyle |
| Drone | Travel (or Ambient for scenic; default Travel) |
| Celebrity | Entertainment |
| AI | Technology |

### Allowed secondary labels (for upload / display)

Use these as the allowed set for **multi-select** on upload or filters (optional):

- Weather  
- Fashion  
- Beauty  
- Crypto  
- Comedy  
- Science  
- Hobbies  
- Drone  
- Celebrity  
- AI  

Backend accepts any string in `secondaryLabels[]`; the list above is the recommended set. You can allow free text or restrict to this list in the UI.

---

## 3. API changes summary

### Upload (create) video — `POST /api/videos`

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `durationMs` | number | ✅ | |
| `primaryCategoryId` | string (UUID) | ✅ | One category from `GET /api/categories` |
| `videoUrl` **or** `videoBase64` | string | ✅ | One of them required |
| `secondaryLabels` | string[] | ❌ | e.g. `["Weather", "Crypto"]` |
| `title` | string | ❌ | |
| `description` | string | ❌ | |
| `ingestSource` | string | ❌ | For rule-based defaults |
| `aspectRatio` | number | ❌ | |
| `thumbnailBase64` | string | ❌ | |

You can **omit** `topicIds` and `subjectIds` (e.g. for MRSS); they are for future use.

**Example body:**

```json
{
  "durationMs": 60000,
  "primaryCategoryId": "uuid-from-GET-api-categories",
  "secondaryLabels": ["Weather", "Crypto"],
  "title": "Market update",
  "videoUrl": "https://example.com/video.mp4"
}
```

### Update video — `PATCH /api/videos/:videoId`

Optional in body:

- `primaryCategoryId` — single category UUID
- `secondaryLabels` — string array (replaces existing)

### Feed — `GET /api/feed`

- **Query:** `category_id` = primary category UUID(s). Comma-separated or repeated. This is the **“Same Category”** filter (by `primary_category_id`).
- **Response items:** Each item includes:
  - `primaryCategory`: `{ id, name, slug } | null`
  - `secondaryLabels`: `string[]`
  - Plus existing fields: `categories`, `topics`, `subjects`, vote counts, `like_by_you`, `upvote_by_you`, `supervote_by_you`, etc.

### Single video — `GET /api/videos/:videoId`

Response includes:

- `primaryCategory`: `{ id, name, slug } | null`
- `secondaryLabels`: `string[]`

### My videos — `GET /api/videos`

Each video in `videos` has:

- `primaryCategory`: `{ id, name, slug } | null`
- `secondaryLabels`: `string[]`

---

## 4. Frontend checklist

- [ ] **Nav / home:** Use `GET /api/categories` to build category list (links or chips). Use `id` for `category_id` when calling the feed.
- [ ] **Upload form:** Require **one** primary category (dropdown/select from categories API). Optional multi-select for **secondary labels** (use the allowed list above or allow free text).
- [ ] **Feed:** For each item, show `primaryCategory.name` (and optionally `secondaryLabels`). “Same Category” = open feed with `?category_id=<primaryCategory.id>`.
- [ ] **Single video / detail:** Show `primaryCategory` and `secondaryLabels`.
- [ ] **Filters:** If you have a filter UI, “By category” = feed with `category_id`. Optional: filter by secondary label (backend may support later; for now you can filter client-side by `secondaryLabels` if needed).

---

## 5. TypeScript types (reference)

```ts
// From API: GET /api/categories
type Category = { id: string; name: string; slug: string | null };

// Feed / video item
type VideoItem = {
  id: string;
  guid: string;
  title: string | null;
  description: string | null;
  durationMs: number;
  primaryCategory: Category | null;
  secondaryLabels: string[];
  categories: Category[];  // legacy; primary is the main one
  topics: Array<{ id: string; name: string; slug: string | null }>;
  subjects: Array<{ id: string; name: string; slug: string | null }>;
  // ... url, thumbnails, vote counts, like_by_you, etc.
};

// Create video body
type CreateVideoBody = {
  durationMs: number;
  primaryCategoryId: string;
  videoUrl?: string;
  videoBase64?: string;
  secondaryLabels?: string[];
  title?: string;
  description?: string;
  ingestSource?: string;
  aspectRatio?: number;
  thumbnailBase64?: string;
};
```

---

## 6. Gesture behavior (for reference)

- **Same Category** (e.g. upRight): backend filters by `primary_category_id`. Use `GET /api/feed?category_id=<primaryCategory.id>` (and `app_id` as usual).
- **Same Subject / Same Topic:** When backend has derived subject/topic, it will use them; otherwise it may fall back to semantic similarity. Frontend can keep using `subject_id` / `topic_id` query params when available.

If you need the same doc in another format (e.g. OpenAPI snippet or Postman) we can add it.
