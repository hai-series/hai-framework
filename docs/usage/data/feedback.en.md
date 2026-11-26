# @h-ai/feedback Data Structures

[简体中文](feedback.md) · [日本語](feedback.ja.md)

[Data reference index](README.en.md) · [Configuration](../configuration/feedback.en.md) · [API reference](../function/feedback.en.md)

After a user reports a problem, Feedback stores the report, evidence, and follow-up jobs. Operators can use the same report ID to check progress. Attachments live in object storage, and pending drafts can stay in the browser.

<a id="reports"></a>

## Database

The service stores the report, related evidence and scheduled work in one transaction. Times are Unix milliseconds. Optional values are NULL unless stated otherwise.

The module uses 6 tables.

| Table | Purpose |
| --- | --- |
| [`hai_feedback_reports`](#table-hai-feedback-reports) | Find a report, its submitter and its current status. |
| [`hai_feedback_evidence`](#table-hai-feedback-evidence) | Read captured events by source and sequence. |
| [`hai_feedback_attachments`](#table-hai-feedback-attachments) | Locate an attachment and check its status and integrity. |
| [`hai_feedback_history`](#table-hai-feedback-history) | See who changed a report's status and when. |
| [`hai_feedback_jobs`](#table-hai-feedback-jobs) | Track collection, notification, webhook, export, and cleanup work so workers can run or recover it. |
| [`hai_feedback_quotas`](#table-hai-feedback-quotas) | Check report, byte and export budgets. |

<a id="table-hai-feedback-reports"></a>

### `hai_feedback_reports`

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
| `revision` | `INTEGER` | No | — | Evidence revision used to identify a snapshot. | `2` |
| `evidence_count` | `INTEGER` | No | — | Number of linked evidence records. | `1` |
| `evidence_bytes` | `BIGINT` | No | — | Bytes used by the evidence. | `0` |
| `collect_deadline` | `BIGINT` | No | — | Deadline for accepting more evidence. | `1794873630000` |
| `expires_at` | `BIGINT` | No | — | Time after which the report may be removed. | `1797465600000` |
| `payload` | `JSON` | No | — | Description, category, contact details, page URL, build ID and commit. Statuses, versions, identities and timestamps come from their own columns. | `{"category":"bug"}` |
| `deleting` | `INTEGER` | No | — | `1` marks deletion in progress. Ordinary queries read rows with `0`. | `0` |

Indexed by `(scope_id, created_at)` and `(scope_id, status, created_at)`.

The submission key is derived from the scope, user, app and client submission ID. When the same key arrives again, the request digest checks the content. An identical retry returns the original report. Changed content returns a conflict.

A handling status change increments `version` to reject concurrent updates based on stale state. A new batch of evidence or an attachment becoming available increments `revision`. The export records both values.

<a id="example-data"></a>

<a id="the-submitted-feedback-report"></a>

#### Example · The submitted feedback report

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
  "revision": 2,
  "evidence_count": 1,
  "created_at": 1794873600000,
  "updated_at": 1794873600000
}
```

This excerpt shows `feedback-42`, accepted from `user-42` in `team-1` and awaiting handling. The acceptance transaction already stored the first environment record, so the evidence revision is 2. More material can still arrive.

The report already stores its category under `payload.category`, for example `"bug"`. The author’s list uses existing fields such as `scope_id` and `user_id`. Both author and administration lists exclude expired reports and reports being deleted. Details, attachments and exports also expire as soon as database time reaches `expires_at`.

<a id="table-hai-feedback-evidence"></a>

### `hai_feedback_evidence`

Indexes support reading evidence by report, source, and sequence and cleaning up by app, link state, and expiry.

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
| `revision` | `INTEGER` | No | — | Evidence revision containing this event. | `3` |
| `bytes` | `INTEGER` | No | — | Size of the evidence in bytes. | `24` |
| `expires_at` | `BIGINT` | No | — | Time after which the evidence can be removed. | `1797465600000` |
| `payload` | `JSON` | No | — | Sanitized event content. The example shows an excerpt. | `{"message":"Request failed"}` |

<a id="evidence-of-what-happened"></a>

#### Example · Evidence of what happened

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
  "revision": 3,
  "bytes": 24
}
```

evidence-42 is sequence 1 for feedback-42, 24 bytes. timestamp is the event time in Unix milliseconds; the redacted payload is not expanded here.

<a id="table-hai-feedback-attachments"></a>

### `hai_feedback_attachments`

Look up attachments by `report_id` and retrieve their bytes from object storage by `object_key`.

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

<a id="where-an-attachment-is-and-whether-it-matches"></a>

#### Example · Where an attachment is and whether it matches

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

<a id="table-hai-feedback-history"></a>

### `hai_feedback_history`

`hai_feedback_reports` holds the current state. When that state changes, the same transaction adds a row here. Report details and diagnostic bundles use these rows to show who changed the state, when, and which states were involved.

The detail view fetches all entries for one `report_id`. The lookup and relationship IDs are columns. The complete `FeedbackHistory` entry fits in `payload`, including the actor, both states, the time, and the optional note. Other tables also use JSON for report diagnostics, evidence contents, and inputs and results that vary by job type. Fields used for filtering or scheduling, such as current state and next run time, are columns. If cross-report queries by actor and time become common, those fields can get columns and indexes of their own.

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | History entry primary key. | `history-42` |
| `report_id` | `TEXT` | No | — | Related report ID. | `feedback-42` |
| `payload` | `JSON` | No | — | Actor, time, previous and new status, and optional note. | `{"id":"history-42","feedbackId":"feedback-42","userId":"operator-7","from":"pending","to":"handled","timestamp":1794873660000}` |

<a id="who-changed-the-feedback-state"></a>

#### Example · Who changed the feedback state

```json
{
  "id": "history-42",
  "report_id": "feedback-42",
  "payload": {
    "id": "history-42",
    "feedbackId": "feedback-42",
    "userId": "operator-7",
    "from": "pending",
    "to": "handled",
    "timestamp": 1794873660000,
    "note": "Verified that order lookup has recovered"
  }
}
```

Administrator `operator-7` changed `feedback-42` from `pending` to `handled`. The `userId` identifies the actor and `timestamp` records when that change happened. The service redacts notes before saving them.

<a id="jobs"></a>

<a id="table-hai-feedback-jobs"></a>

### `hai_feedback_jobs`

The service can return a report number right away because this table preserves unfinished work across process restarts. Acceptance queues server collection and expiry cleanup, plus notifications and webhooks when enabled. An export request queues its own job. The browser initiates screenshots and attachment uploads.

**Claiming** is an automatic conditional update that gives a worker temporary ownership. The worker finds eligible work by `(app_id, status, next_run_at)` and writes its execution token and lease. It renews the lease while it runs. If the worker exits, another worker for the same application can take over after expiry. Recording the result requires the current token and an active lease, which prevents a stale worker from overwriting it. The default lease is 30 seconds and ordinary jobs get five attempts by default. Exports locate snapshots by `(report_id, snapshot_revision, snapshot_version)`. [Job execution and recovery](../function/feedback.en.md#feedback-job-execution)

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
| `attempts` | `INTEGER` | No | — | Number of claimed attempts, including claims interrupted by worker exit. Rounds spent waiting on material or quiet hours do not count. | `0` |
| `next_run_at` | `BIGINT` | No | — | Earliest time the job can be claimed again. | `1794873600000` |
| `created_at` | `BIGINT` | No | — | Registration time. | `1794873600000` |
| `updated_at` | `BIGINT` | No | — | Last update time. | `1794873600000` |
| `last_error` | `TEXT` | Yes | — | Error from the most recent failure. | `NULL` |
| `payload` | `JSON` | No | — | Task input and progress. Exports reference an evidence revision and count and freeze the report, attachment metadata and history. | `{}` |
| `result` | `JSON` | Yes | — | Recorded outcome when the job finishes. | `NULL` |

An export freezes `snapshot_revision`, `snapshot_version`, and `payload.evidenceCount` when queued. The worker reads evidence through that revision and checks the count before writing the ZIP. It can export the available material when collection is `partial`. The export fails if the report expires or an evidence row in the snapshot is missing.

<a id="background-work-after-submission"></a>

#### Example · A ZIP export waiting for a worker

The administrator receives a job ID on request. These are the scheduling fields before a worker claims the job.

```json
{
  "id": "job-42",
  "app_id": "orders",
  "report_id": "feedback-42",
  "scope_id": "team-1",
  "kind": "export",
  "status": "pending",
  "attempts": 0,
  "token": null,
  "lease_until": 0,
  "next_run_at": 1794873600000
}
```

`job-42` belongs to `feedback-42` and has yet to run. `next_run_at` is the earliest time it can be claimed. If the first worker exits midway, the worker that obtains the next lease generates the ZIP again under the same job ID.

<a id="table-hai-feedback-quotas"></a>

### `hai_feedback_quotas`

Find usage by `(app_id, period)`.

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

<a id="feedback-capacity-already-reserved"></a>

#### Example · Feedback capacity already reserved

Check report, byte and export budgets before admission so one scope cannot consume unbounded storage.

```json
{
  "id": "quota-42",
  "app_id": "orders",
  "scope_id": "team-1",
  "user_id": "",
  "period": 0,
  "report_count": 1,
  "reserved_bytes": 201326592,
  "report_bytes": 0,
  "export_limit": 0,
  "updated_at": 1794873600000
}
```

For `period=0`, the counter covers the scope within the application and `user_id` is empty. A positive value is the start of a database UTC day and counts usage separately for each user. A row with `period=-1` is keyed by its report ID. Each report reserves 192 MiB by default. Scope capacity is released after successful cleanup. [Quota settings](../configuration/feedback.en.md#configuration-fields)

<a id="storage"></a>

## Object storage

Feedback creates no Redis keys. Private Storage uses `feedback/<first-16-scope-SHA-256-chars>/<report-id>/` plus an attachment ID, `business/<row-id>-<checksum>` or `exports/<job-id>.zip`. The ZIP contains `manifest.json`, the report, evidence, history and allowed attachments. Export objects expire after 24 hours by default.

The scope segment is the first 16 hexadecimal characters of the SHA-256 of the UTF-8 `scopeId` supplied by the server. For example, `team-1` gives `7e2a2d5f9a3050f8`, `team-2` gives `7774b28c6138ba1a`, and `华东/客服` gives `6d306a1b1891f5e8`. A shared report prefix lets the worker clean up its objects together. Reading a file still requires access to the report.

For example, an export for `feedback-42` in this scope has a key of the form `feedback/7e2a2d5f9a3050f8/feedback-42/exports/<job ID>.zip`.

## Browser storage

The browser uses two key families in the `drafts` store of IndexedDB database `hai-feedback-v1` (version 1). With draft persistence enabled, `<scope-key>` combines the app ID and the host's identity scope, such as `orders:team-1:user-42`. Submission success removes both entries.

| Key | Purpose | Expiry |
| --- | --- | --- |
| `<scope-key>` | Draft awaiting submission | 24 hours |
| `<scope-key>:checkpoint` | Evidence captured before opening the feedback form | 5 minutes |

### `<scope-key>`

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

### `<scope-key>:checkpoint`

| Column | Type | Meaning | Example |
| --- | --- | --- | --- |
| `evidence` | `object[]` | Evidence held before opening the feedback form. | `[]` |
| `expiresAt` | `number` | Checkpoint deadline in Unix milliseconds. Restore evidence only before this time. | `1794873900000` |

See the [table definitions in the source](../../../packages/feedback/src/feedback-repository.ts).

### Briefly retain unsent evidence

Temporarily keep captured evidence while opening or refreshing feedback, not as server history.

```json
{
  "evidence": [],
  "expiresAt": 1794873900000
}
```

The empty evidence list has nothing cached yet; expiresAt is five minutes later. Expired snapshots are not restored; submission clears them.
