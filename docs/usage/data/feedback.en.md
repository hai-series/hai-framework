# @h-ai/feedback Data structures

<!-- translation: partial -->

[Chinese source](feedback.md) · [Configuration](../configuration/feedback.en.md) · [API reference](../function/feedback.en.md)

<a id="reports"></a>

## Reports and related tables

The service stores the report, related evidence and scheduled work in one transaction. Times are Unix milliseconds. Optional values are NULL unless stated otherwise.

### `hai_feedback_reports`

| Field or table | Shape and meaning |
| --- | --- |
| `id`, `number`, `scope_id`, `user_id`, `app_id` | Text primary key, visible number, server-selected scope, user and application. |
| `app_version`, `summary`, `payload` | Optional application version, summary (empty when missing) and JSON submission details. |
| `submission_key`, `submission_hash` | Unique submission key and content digest. Retries must match the original input. |
| `status`, `collection_status`, `notification_status` | Processing, collection and notification states. Initially `pending`, `collecting`, and a status derived from the notification configuration. |
| `version`, `revision`, `evidence_count`, `evidence_bytes`, `deleting` | Integer version and revision begin at 1. Evidence count, bytes and deletion marker begin at 0. |
| `created_at`, `updated_at`, `collect_deadline`, `expires_at` | Creation, update, collection deadline and expiry. Default report retention is 30 days. |

Indexed by `(scope_id, created_at)` and `(scope_id, status, created_at)`.

<a id="jobs"></a>

## Evidence, attachments and jobs

| Field or table | Shape and meaning |
| --- | --- |
| `hai_feedback_evidence` | Primary key `id`; nullable `report_id` for unlinked evidence. `scope_id`, `user_id`, `app_id` identify the owner; `source`, `sequence`, `kind`, `timestamp` describe the event. `request_id` and `error_id` are nullable. `revision`, `bytes`, `expires_at` track revision, size and expiry; JSON `payload` is redacted. |
| `hai_feedback_attachments` | Primary key `id`, client identifier `client_id`, owner `report_id`/ `scope_id`, private `object_key`, `status`, `size`, `checksum`, `updated_at`, and JSON display `payload`. |
| `hai_feedback_history` | Primary key `id`, owner `report_id` and JSON `payload` with actor, time and transition. |
| `hai_feedback_jobs` | Primary key `id`, `app_id`, `report_id`, `scope_id`, optional `snapshot_revision`/ `snapshot_version`, `kind`, `status`, nullable owner `token` and `last_error`. `lease_until`, `attempts`, `next_run_at`, `created_at`, `updated_at` track job progress. JSON `payload` is required, `result` is nullable. |
| `hai_feedback_quotas` | Primary key `id`, `app_id`, `scope_id`, `user_id`, `period` (daily, 0 for scope or -1 for report), `report_count`, `reserved_bytes`, `report_bytes` and `export_limit` (both SQL default 0), `updated_at`. |

Evidence is indexed by report, source and order, and by app, attachment state and expiry for cleanup. Attachments and history are indexed by `report_id`. Jobs are claimed by `(app_id, status, next_run_at)` and snapshots located by `(report_id, snapshot_revision, snapshot_version)`. Quotas are indexed by `(app_id, period)`. The job lease defaults to 30 seconds; the normal attempt limit is 5.

<a id="storage"></a>

## Object keys and browser drafts

Feedback creates no Redis keys. Private Storage uses `feedback/<first-16-scope-SHA-256-chars>/<report-id>/` plus an attachment ID, `business/<row-id>-<checksum>` or `exports/<job-id>.zip`. The ZIP contains `manifest.json`, the report, evidence, history and allowed attachments. Export objects expire after 24 hours by default.

The browser saves one draft per application and identity in IndexedDB database `hai-feedback-v1` (version 1), store `drafts`. The separate `<scope-key>:checkpoint` key holds `evidence` and `expiresAt`, valid for 5 minutes. Only unexpired drafts are loaded; a successful submission removes its draft and checkpoint.

For the remaining database types and constraints, compare the [Chinese reference](feedback.md) and the [table definitions in the source](../../../packages/feedback/src/feedback-repository.ts).
