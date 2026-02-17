Milestone 2: Platform Core v1 — Checklist
1. Auth & User Basics
* Implement signup/login (email + optional social logins) ✅
* Create per-app user_app_profiles ✅
* Enforce app_id on every request ✅
* Test: App A cannot access App B data ✅


2. Core DB Schema
* Users / Profiles ✅
* Content Items (videos)✅
* Content Assets (thumbnails, variants)✅
* Votes / Vote Ledger ✅
* Purchases ✅
* Events (structured, versioned) ✅
* Ensure all tables are app-scoped ✅


3. Video Upload Pipeline
* Implement S3 upload endpoint
* Generate thumbnails on upload
* Serve via CloudFront CDN
* Test uploading + playing a video in feed
4. Feed API
* Endpoint: return ranked feed items
* Include request_id + rank_position + feed_mode
* Return candidate sets for preview (topic/category/subject)
* Rules-based ranking logic (v1)
5. Event Ingestion
* Accept structured events with schema versions
* Store for derived signals / analytics
6. Repo & Documentation
* Env setup docs: local / staging / production
* Include instructions to test app-scoped isolation
* README with API usage examples
✅ Acceptance Criteria
* App-scoped isolation enforced (DB/cache/storage)
* Upload + play test video works end-to-end
* Feed API returns ranked items with correct metadata
* Event ingestion pipeline functional
