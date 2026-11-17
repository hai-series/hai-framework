# @h-ai/feedback Data structures

<!-- translation: partial -->

[Chinese source](feedback.md) · [Configuration](../configuration/feedback.en.md) · [API reference](../function/feedback.en.md)

<a id="example-data"></a>

## What these records are for

Start with the purpose and examples, then consult field and storage details below. IDs and business content are fictional; sensitive values are redacted. Times use 2026-11-17 00:00 UTC as the example start, with units explained for each record.

Database and file samples show relevant fields, not complete writable records. Omitted fields are not automatically optional. Examples can represent different moments in a process.

### The submitted feedback report

Structure: `hai_feedback_reports`.

Store the report, submitter and handling state as the entry point for evidence and history.

```json
{
  "id": "feedback-42",
  "number": "FB-EXAMPLE-42",
  "scope_id": "team-1",
  "user_id": "user-42",
  "app_id": "orders",
  "summary": "Example problem",
  "status": "pending",
  "collection_status": "collecting",
  "version": 1,
  "revision": 1,
  "evidence_count": 0,
  "evidence_bytes": 0,
  "created_at": 1794873600000,
  "updated_at": 1794873600000
}
```

feedback-42 belongs to user-42 in team-1, is pending and collecting. Zero evidence describes this moment, before later collection examples.

### Evidence of what happened

Structure: `hai_feedback_evidence`.

Link logs, errors or page evidence by source and order to reconstruct a problem.

```json
{
  "id": "evidence-42",
  "report_id": "feedback-42",
  "scope_id": "team-1",
  "user_id": "user-42",
  "app_id": "orders",
  "sequence": 1,
  "timestamp": 1794873600000,
  "revision": 1,
  "bytes": 24
}
```

evidence-42 is sequence 1 for feedback-42, 24 bytes. timestamp dates the event; the redacted payload is not expanded here.

### Where an attachment is and whether it matches

Structure: `hai_feedback_attachments`.

Keep the private object location, size and checksum instead of file bytes in SQL.

```json
{
  "id": "attachment-42",
  "client_id": "client-file-42",
  "report_id": "feedback-42",
  "scope_id": "team-1",
  "object_key": "feedback/<scope-digest>/feedback-42/attachment-42",
  "size": 5,
  "checksum": "<checksum:redacted>"
}
```

attachment-42 refers to a 5-byte object for feedback-42. Its checksum is redacted, and object_key is not a public download grant.

### Who changed the feedback state

Structure: `hai_feedback_history`.

Keep each handling change and note so staff can follow the report history.

```json
{
  "id": "history-42",
  "report_id": "feedback-42",
  "payload": {
    "id": "history-42",
    "feedbackId": "feedback-42",
    "userId": "user-42",
    "from": "pending",
    "to": "handled",
    "timestamp": 1794873660000
  }
}
```

user-42 changed feedback-42 from pending to handled; timestamp is the handling time, not original submission.

### Background work after submission

Structure: `hai_feedback_jobs`.

Persist asynchronous collection, notification or export work for claims and retries.

```json
{
  "id": "job-42",
  "app_id": "orders",
  "report_id": "feedback-42",
  "scope_id": "team-1",
  "attempts": 0,
  "token": null,
  "lease_until": 0,
  "next_run_at": 1794873600000
}
```

job-42 has no attempt or owner token yet. next_run_at is the earliest start, not a promised completion time.

### Feedback capacity already reserved

Structure: `hai_feedback_quotas`.

Check report, byte and export budgets before admission so one scope cannot consume unbounded storage.

```json
{
  "id": "quota-42",
  "app_id": "orders",
  "scope_id": "team-1",
  "user_id": "user-42",
  "period": 0,
  "report_count": 1,
  "reserved_bytes": 1024,
  "report_bytes": 0,
  "export_limit": 0,
  "updated_at": 1794873600000
}
```

period:0 measures scope totals: one report and 1024 reserved bytes. This is accounting, not report content.

### Briefly retain unsent evidence

Structure: `IndexedDB checkpoint`.

Temporarily keep captured evidence while opening or refreshing feedback, not as server history.

```json
{
  "evidence": [],
  "expiresAt": 1794873900000
}
```

The empty evidence list has nothing cached yet; expiresAt is five minutes later. Expired snapshots are not restored; submission clears them.

## Field, storage and cleanup reference

<a id="reports"></a>

### Reports and related tables

The service stores the report, related evidence and scheduled work in one transaction. Times are Unix milliseconds. Optional values are NULL unless stated otherwise.

#### `hai_feedback_reports`

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

### Evidence, attachments and jobs

| Field or table | Shape and meaning |
| --- | --- |
| `hai_feedback_evidence` | Primary key `id`; nullable `report_id` for unlinked evidence. `scope_id`, `user_id`, `app_id` identify the owner; `source`, `sequence`, `kind`, `timestamp` describe the event. `request_id` and `error_id` are nullable. `revision`, `bytes`, `expires_at` track revision, size and expiry; JSON `payload` is redacted. |
| `hai_feedback_attachments` | Primary key `id`, client identifier `client_id`, owner `report_id`/ `scope_id`, private `object_key`, `status`, `size`, `checksum`, `updated_at`, and JSON display `payload`. |
| `hai_feedback_history` | Primary key `id`, owner `report_id` and JSON `payload` with actor, time and transition. |
| `hai_feedback_jobs` | Primary key `id`, `app_id`, `report_id`, `scope_id`, optional `snapshot_revision`/ `snapshot_version`, `kind`, `status`, nullable owner `token` and `last_error`. `lease_until`, `attempts`, `next_run_at`, `created_at`, `updated_at` track job progress. JSON `payload` is required, `result` is nullable. |
| `hai_feedback_quotas` | Primary key `id`, `app_id`, `scope_id`, `user_id`, `period` (daily, 0 for scope or -1 for report), `report_count`, `reserved_bytes`, `report_bytes` and `export_limit` (both SQL default 0), `updated_at`. |

Evidence is indexed by report, source and order, and by app, attachment state and expiry for cleanup. Attachments and history are indexed by `report_id`. Jobs are claimed by `(app_id, status, next_run_at)` and snapshots located by `(report_id, snapshot_revision, snapshot_version)`. Quotas are indexed by `(app_id, period)`. The job lease defaults to 30 seconds; the normal attempt limit is 5.

<a id="storage"></a>

### Object keys and browser drafts

Feedback creates no Redis keys. Private Storage uses `feedback/<first-16-scope-SHA-256-chars>/<report-id>/` plus an attachment ID, `business/<row-id>-<checksum>` or `exports/<job-id>.zip`. The ZIP contains `manifest.json`, the report, evidence, history and allowed attachments. Export objects expire after 24 hours by default.

The browser saves one draft per application and identity in IndexedDB database `hai-feedback-v1` (version 1), store `drafts`. The separate `<scope-key>:checkpoint` key holds `evidence` and `expiresAt`, valid for 5 minutes. Only unexpired drafts are loaded; a successful submission removes its draft and checkpoint.

For the remaining database types and constraints, compare the [Chinese reference](feedback.md) and the [table definitions in the source](../../../packages/feedback/src/feedback-repository.ts).
