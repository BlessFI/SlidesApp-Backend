# Event schema versioning

Events are stored with a **schema_version** so consumers can interpret or migrate payloads when the event shape changes over time.

## Stored field

- **DB:** `events.schema_version` (integer, required; default `1`).
- **API:** Sent as `schema_version` in request/response (snake_case).

## POST /events

- **Body:** Optional `schema_version` (integer). If omitted, the backend uses **1**.
- Clients should send the version that matches the payload shape they are using (e.g. `1` for M2 baseline, `2` when a new format is introduced).

## GET /events

- **Query:** Optional `?schema_version=<int>` to filter events by version.
- **Response:** Each event in `events` includes `schema_version`.

## Version semantics

| Version | Description |
|--------|-------------|
| **1**  | M2 baseline. Core fields: `type`, `event`, `request_id`, `rank_position`, `feed_mode`, `item_id`, `direction_key`, `gesture_action`, `gesture_source`, `ts`; extra fields in `properties`. |

When adding a new version (e.g. 2), document it here and define which fields are added, renamed, or deprecated so analytics and pipelines can handle both versions.

## Bumping the version

1. Decide the new version number and the exact payload changes (new/optional/required fields).
2. Update this doc with the new version row.
3. Backend: keep accepting and storing the version number; no DB migration needed for the version field. If new columns are added to `Event`, add a migration and still set `schema_version` on create (e.g. new clients send `2`, backend stores it).
4. Clients: send the new `schema_version` when they emit the new shape; old clients continue sending `1`.

Backward compatibility: the backend does not reject unknown versions; it stores whatever integer the client sends (within the column type). Querying by `schema_version` allows filtering by version.
