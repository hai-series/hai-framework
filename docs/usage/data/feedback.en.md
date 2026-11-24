# @h-ai/feedback Data structures

[Chinese source](feedback.md) · [Configuration](../configuration/feedback.en.md) · [API reference](../function/feedback.en.md)

<a id="example-data"></a>

## What these records are for

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

This excerpt shows a pending `feedback-42` from `user-42` in `team-1`, still collecting evidence. Zero evidence describes this moment, before the later examples. `created_at` and `updated_at` are Unix milliseconds.

The report already stores its category under `payload.category`, for example `"bug"`. The author’s list uses existing fields such as `scope_id` and `user_id`, and excludes expired reports and reports being deleted.

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

evidence-42 is sequence 1 for feedback-42, 24 bytes. timestamp is the event time in Unix milliseconds; the redacted payload is not expanded here.

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

The module uses 6 tables.

| Table | Purpose |
| --- | --- |
| [`hai_feedback_reports`](#table-hai-feedback-reports) | Find a report, its submitter and its current status. |
| [`hai_feedback_evidence`](#table-hai-feedback-evidence) | Read captured events by source and sequence. |
| [`hai_feedback_attachments`](#table-hai-feedback-attachments) | Locate an attachment and check its status and integrity. |
| [`hai_feedback_history`](#table-hai-feedback-history) | See who changed a report's status and when. |
| [`hai_feedback_jobs`](#table-hai-feedback-jobs) | Claim background work such as collection, notifications and exports. |
| [`hai_feedback_quotas`](#table-hai-feedback-quotas) | Check report, byte and export budgets. |

<a id="table-hai-feedback-reports"></a>

#### `hai_feedback_reports`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Report primary key. | `feedback-42` |
| `scope_id` | `TEXT` | No | — | Business scope of the report. | `team-1` |
| `user_id` | `TEXT` | No | — | Submitter ID. | `user-42` |
| `app_id` | `TEXT` | No | — | ID of the app that received the report. | `orders` |
| `number` | `TEXT` | No | — | Reference number for users and support. | `FB-EXAMPLE-42` |
| `app_version` | `TEXT` | Yes | — | App version at submission. | `1.4.2` |
| `summary` | `TEXT` | No | — | Short description of the problem. | `Example problem` |
| `submission_key` | `TEXT` | No | — | Unique submission key used for safe retries. | `<submission-key>` |
| `submission_hash` | `TEXT` | No | — | Digest used to verify that a retry repeats the same submission. | `<request-digest>` |
| `status` | `TEXT` | No | — | Report processing status. | `pending` |
| `collection_status` | `TEXT` | No | — | Evidence collection status. | `collecting` |
| `notification_status` | `TEXT` | No | — | State of the feedback notification. | `pending` |
| `created_at` | `BIGINT` | No | — | Submission time. | `1794873600000` |
| `updated_at` | `BIGINT` | No | — | Last update time. | `1794873600000` |
| `version` | `INTEGER` | No | — | Report version used to detect concurrent changes. | `1` |
| `revision` | `INTEGER` | No | — | Evidence revision used to identify a snapshot. | `1` |
| `evidence_count` | `INTEGER` | No | — | Number of linked evidence records. | `0` |
| `evidence_bytes` | `BIGINT` | No | — | Bytes used by the evidence. | `0` |
| `collect_deadline` | `BIGINT` | No | — | Deadline for accepting more evidence. | `1794873630000` |
| `expires_at` | `BIGINT` | No | — | Time after which the report may be removed. | `1797465600000` |
| `payload` | `JSON` | No | — | Business details including category. The example shows the category only. | `{"category":"bug"}` |
| `deleting` | `INTEGER` | No | — | `1` marks deletion in progress. Ordinary queries read rows with `0`. | `0` |

Indexed by `(scope_id, created_at)` and `(scope_id, status, created_at)`.

<a id="table-hai-feedback-evidence"></a>

#### `hai_feedback_evidence`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Evidence primary key. | `evidence-42` |
| `report_id` | `TEXT` | Yes | — | Related report ID. NULL until linked. | `feedback-42` |
| `scope_id` | `TEXT` | No | — | Business scope of the evidence. | `team-1` |
| `user_id` | `TEXT` | No | — | User associated with the evidence. | `user-42` |
| `app_id` | `TEXT` | No | — | ID of the app that produced the evidence. | `orders` |
| `source` | `TEXT` | No | — | Source of the evidence. | `browser` |
| `sequence` | `BIGINT` | No | — | Order of the event within its source. | `1` |
| `kind` | `TEXT` | No | — | Type of captured event. | `error` |
| `timestamp` | `BIGINT` | No | — | Time of the event. | `1794873600000` |
| `request_id` | `TEXT` | Yes | — | Related request ID. | `req-42` |
| `error_id` | `TEXT` | Yes | — | Related error ID. | `err-42` |
| `revision` | `INTEGER` | No | — | Evidence revision containing this event. | `1` |
| `bytes` | `INTEGER` | No | — | Size of the evidence in bytes. | `24` |
| `expires_at` | `BIGINT` | No | — | Time after which the evidence can be removed. | `1797465600000` |
| `payload` | `JSON` | No | — | Sanitized event content. The example shows an excerpt. | `{"message":"Request failed"}` |

<a id="table-hai-feedback-attachments"></a>

#### `hai_feedback_attachments`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Attachment primary key. | `attachment-42` |
| `client_id` | `TEXT` | No | — | Client-provided ID for the attachment. | `client-file-42` |
| `report_id` | `TEXT` | No | — | Parent report ID. | `feedback-42` |
| `scope_id` | `TEXT` | No | — | Business scope of the attachment. | `team-1` |
| `object_key` | `TEXT` | No | — | Module-generated key of the private file object. | `feedback/<scope-digest>/feedback-42/attachment-42` |
| `status` | `TEXT` | No | — | Whether the file is available for reads or exports. | `available` |
| `size` | `BIGINT` | No | — | File size in bytes. | `5` |
| `checksum` | `TEXT` | No | — | Digest used to check file integrity. | `<checksum:redacted>` |
| `updated_at` | `BIGINT` | No | — | Last update time. | `1794873600000` |
| `payload` | `JSON` | No | — | Attachment details for display. The example shows an excerpt. | `{"name":"error.txt"}` |

<a id="table-hai-feedback-history"></a>

#### `hai_feedback_history`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | History entry primary key. | `history-42` |
| `report_id` | `TEXT` | No | — | Related report ID. | `feedback-42` |
| `payload` | `JSON` | No | — | Actor, change time and previous and new status. | `{"id":"history-42","feedbackId":"feedback-42","userId":"user-42","from":"pending","to":"handled","timestamp":1794873660000}` |

<a id="jobs"></a>

<a id="table-hai-feedback-jobs"></a>

#### `hai_feedback_jobs`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Job primary key. | `job-42` |
| `app_id` | `TEXT` | No | — | App that owns the job. | `orders` |
| `snapshot_revision` | `INTEGER` | Yes | — | Evidence revision used by the job. | `1` |
| `snapshot_version` | `INTEGER` | Yes | — | Report version used by the job. | `1` |
| `report_id` | `TEXT` | No | — | Related report ID. | `feedback-42` |
| `scope_id` | `TEXT` | No | — | Business scope of the job. | `team-1` |
| `kind` | `TEXT` | No | — | Type of background job. | `export` |
| `status` | `TEXT` | No | — | Whether the job is pending, active or finished. | `pending` |
| `token` | `TEXT` | Yes | — | Token of the worker holding the lease. | `null` |
| `lease_until` | `BIGINT` | No | — | Current lease deadline. `0` means unclaimed. | `0` |
| `attempts` | `INTEGER` | No | — | Number of attempts so far. | `0` |
| `next_run_at` | `BIGINT` | No | — | Earliest time the job can be claimed again. | `1794873600000` |
| `created_at` | `BIGINT` | No | — | Registration time. | `1794873600000` |
| `updated_at` | `BIGINT` | No | — | Last update time. | `1794873600000` |
| `last_error` | `TEXT` | Yes | — | Error from the most recent failure. | `NULL` |
| `payload` | `JSON` | No | — | Input to the job. | `{}` |
| `result` | `JSON` | Yes | — | Recorded outcome when the job finishes. | `NULL` |

<a id="table-hai-feedback-quotas"></a>

#### `hai_feedback_quotas`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Quota record primary key. | `quota-42` |
| `app_id` | `TEXT` | No | — | App to which the quota applies. | `orders` |
| `scope_id` | `TEXT` | No | — | Business scope being measured. | `team-1` |
| `user_id` | `TEXT` | No | — | User to whom the quota applies. | `user-42` |
| `period` | `BIGINT` | No | — | Daily quota period, `0` for scope totals or `-1` for one report. | `0` |
| `report_count` | `BIGINT` | No | — | Number of reports counted against the quota. | `1` |
| `reserved_bytes` | `BIGINT` | No | — | Bytes already reserved. | `1024` |
| `report_bytes` | `BIGINT` | No | `0` | Byte budget for one report. | `0` |
| `export_limit` | `INTEGER` | No | `0` | Export budget for one report. | `0` |
| `updated_at` | `BIGINT` | No | — | Most recent quota update time. | `1794873600000` |

Evidence is indexed by report, source and order, and by app, attachment state and expiry for cleanup. Attachments and history are indexed by `report_id`. Jobs are claimed by `(app_id, status, next_run_at)` and snapshots located by `(report_id, snapshot_revision, snapshot_version)`. Quotas are indexed by `(app_id, period)`. The job lease defaults to 30 seconds; the normal attempt limit is 5.

<a id="storage"></a>

### Object keys and browser drafts

Feedback creates no Redis keys. Private Storage uses `feedback/<first-16-scope-SHA-256-chars>/<report-id>/` plus an attachment ID, `business/<row-id>-<checksum>` or `exports/<job-id>.zip`. The ZIP contains `manifest.json`, the report, evidence, history and allowed attachments. Export objects expire after 24 hours by default.

#### Browser drafts and evidence checkpoints

The browser uses two key families in the `drafts` store of IndexedDB database `hai-feedback-v1` (version 1). With draft persistence enabled, `<scope-key>` combines the app ID and the host's identity scope, such as `orders:team-1:user-42`. Submission success removes both entries.

| Key | Purpose | Expiry |
| --- | --- | --- |
| `<scope-key>` | Draft awaiting submission | 24 hours |
| `<scope-key>:checkpoint` | Evidence captured before opening the feedback form | 5 minutes |

##### `<scope-key>`

| Column | Type | Meaning | Example |
| --- | --- | --- | --- |
| `submissionId` | `string` | Submission ID for this draft. | `submission-42` |
| `anchorTime` | `number` | Feedback or error time in Unix milliseconds. | `1794873600000` |
| `anchorKind` | `string` | How the draft started, either feedback or error. | `feedback` |
| `errorId` | `string` | Optional related error ID. | `err-42` |
| `evidence` | `object[]` | Evidence captured so far. | `[]` |
| `attachments` | `object[]` | Pending attachments and their bytes. | `[]` |
| `missing` | `string[]` | Materials that could not be captured. | `[]` |
| `expiresAt` | `number` | Draft deadline in Unix milliseconds. Reading an expired draft removes it. | `1794960000000` |
| `report` | `object` | Optional report returned by the server. | `{…}` |
| `submission` | `object` | Original submission input, reused if a response is lost. | `{…}` |
| `userInputFingerprint` | `string` | Fingerprint used to detect form changes before a retry. | `<fingerprint>` |

##### `<scope-key>:checkpoint`

| Column | Type | Meaning | Example |
| --- | --- | --- | --- |
| `evidence` | `object[]` | Evidence held before opening the feedback form. | `[]` |
| `expiresAt` | `number` | Checkpoint deadline in Unix milliseconds. Restore evidence only before this time. | `1794873900000` |

See the [table definitions in the source](../../../packages/feedback/src/feedback-repository.ts).
