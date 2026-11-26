# @h-ai/feedback Data Structures

[简体中文](feedback.md) · [日本語](feedback.ja.md) · [API reference](../function/feedback.en.md) · [Configuration](../configuration/feedback.en.md)

When a user reports that their order details will not open and sends a recording, the report table stores the status and the attachment table stores the video bytes. A staff member can request more information in the same report and attach a set of steps. The message table stores the request and the file is linked to that message. The author and staff read these same records according to their permissions.

<a id="database"></a>

## Database

Feedback initializes the following three tables and their indexes in the host's connected relational database. Times are Unix milliseconds. “None” in the default column means the DDL declares no default. The application supplies the actual value or an allowed null.

| Table | What a row represents | When written |
| --- | --- | --- |
| [`hai_feedback_reports`](#table-hai-feedback-reports) | The initial report and its current status | Created on submission. Activity time changes when someone sends a message or updates the status. |
| [`hai_feedback_messages`](#table-hai-feedback-messages) | A reply or information request | The author or staff sends a message. |
| [`hai_feedback_attachments`](#table-hai-feedback-attachments) | Metadata and bytes for a piece of evidence or a manual attachment | Saved with the initial report or a message. |

<a id="table-hai-feedback-reports"></a>

### `hai_feedback_reports`

| Field | Type | Nullable | Database default | Purpose | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `VARCHAR(36)` | No | None | Client-generated UUID for this submission and report primary key. | `a5f59b38-ef92-47bb-b0a0-b0f9c07f7f93` |
| `app_id` | `VARCHAR(128)` | No | None | The Feedback instance's `appId`. | `orders` |
| `scope_id` | `VARCHAR(128)` | No | None | Business scope from the trusted context. | `sales-cn` |
| `user_id` | `VARCHAR(128)` | No | None | Submitter ID, used to query their own reports. | `user-42` |
| `body` | `TEXT` | No | None | Initial text. It can be empty for an evidence-only report. | `I cannot open my order details` |
| `status` | `VARCHAR(24)` | No | None | Current status. The first write uses `pending`. | `awaiting_user` |
| `created_at` | `BIGINT` | No | None | Submission time. | `1795500000000` |
| `updated_at` | `BIGINT` | No | None | Starts at creation time and records subsequent messages or status changes. | `1795500300000` |

The processing list uses the `hai_feedback_reports_activity` index over `(app_id, scope_id, updated_at, id)`. The author's list uses `hai_feedback_reports_author` over `(app_id, scope_id, user_id, updated_at, id)`. Both sort by activity time descending, then by ID descending for ties.

| `status` | Meaning | How it is set |
| --- | --- | --- |
| `pending` | Pending | A report is created, the author replies to a report awaiting information, or staff explicitly mark it pending. |
| `awaiting_user` | Awaiting user | Staff send an information request. |
| `handled` | Handled | Staff mark the report handled. |

<a id="table-hai-feedback-messages"></a>

### `hai_feedback_messages`

| Field | Type | Nullable | Database default | Purpose | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `VARCHAR(36)` | No | None | Client-generated `messageId` for this send and message primary key. | `deed074b-1ef4-4a47-9adf-731349dd1c56` |
| `report_id` | `VARCHAR(36)` | No | None | Foreign key to the report. | `a5f59b38-ef92-47bb-b0a0-b0f9c07f7f93` |
| `author_id` | `VARCHAR(128)` | No | None | User ID of the sender. | `operator-7` |
| `author_role` | `VARCHAR(16)` | No | None | `author` for replies by the report author and `staff` for messages sent in a staff capacity. | `staff` |
| `kind` | `VARCHAR(16)` | No | None | `reply` for a reply and `request_info` for a request for more information. | `request_info` |
| `body` | `TEXT` | No | None | Message text. It can be empty when sending a file alone. | `Follow the attached steps and send a screenshot of the error` |
| `created_at` | `BIGINT` | No | None | Time sent. | `1795500300000` |

The `hai_feedback_messages_report` index over `(report_id, created_at, id)` supports reading the conversation newest first. Staff status changes update the report and conversation entries each have their own message row.

<a id="table-hai-feedback-attachments"></a>

### `hai_feedback_attachments`

| Field | Type | Nullable | Database default | Purpose | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `VARCHAR(36)` | No | None | Server-generated attachment UUID and primary key. | `0ed0398d-475d-47bc-b769-d1eddcd820c4` |
| `report_id` | `VARCHAR(36)` | No | None | Report the attachment belongs to. | `a5f59b38-ef92-47bb-b0a0-b0f9c07f7f93` |
| `message_id` | `VARCHAR(36)` | Yes | None | `NULL` for an initial report attachment, or a foreign key to the message. | `deed074b-1ef4-4a47-9adf-731349dd1c56` |
| `kind` | `VARCHAR(24)` | No | None | Category of manually attached files and evidence. | `file` |
| `name` | `VARCHAR(255)` | No | None | File name displayed or used for download. | `steps.txt` |
| `content_type` | `VARCHAR(128)` | No | None | Media type after validation. | `application/octet-stream` |
| `size` | `INTEGER` | No | None | File size in raw bytes. | `5` |
| `content` | SQLite `BLOB`, PostgreSQL `BYTEA`, MySQL `MEDIUMBLOB` | No | None | Binary file content. | The five bytes of the UTF-8 text `Steps` |

The `hai_feedback_attachments_message` index over `(report_id, message_id, id)` supports metadata queries for an initial report or a conversation. The service scopes and authorizes the report before reading a file by report and attachment ID. Manual files whose type cannot be recognized as safe to preview are offered as downloads with `application/octet-stream`.

<a id="attachment-examples"></a>

#### Evidence categories and example records

| `kind` | Source | Example file name | Attached to |
| --- | --- | --- | --- |
| `file` | A picture or file the sender selects manually | `steps.txt` | Report or message |
| `screenshot` | Screenshot taken on opening the report form or on request | `screenshot.png` | Report |
| `browser_logs` | Browser logs frozen when the report form opens | `browser-logs.json` | Report |
| `server_logs` | Core logs selected at submission based on the sender and scope | `server-logs.json` | Report |
| `replay` | Redacted page replay events | `operation-replay.json` | Report |
| `recording` | A short recording authorized by the user | `recording-1795500000000.webm` | Report |

In the example, the recording's `report_id` points to the report and its `message_id` is `NULL`. Staff attach `steps.txt` to the `request_info` message, so that file's `message_id` is `deed074b-1ef4-4a47-9adf-731349dd1c56`. The report's status is now `awaiting_user`. When the author sends a `reply` with a screenshot, the image has `kind: file` and points to the reply. The report returns to `pending`.

<a id="storage-and-reads"></a>

## Writes and reads

The initial report and its files are saved in one relational database transaction. Sending a message saves the message, its files, the report status, and its activity time in one transaction. Keep the operation UUID to retry and retrieve the persisted record when a response goes missing. A retry returns the original record. Sending edited text or files is a new operation and requires a fresh ID.

A list returns report summaries. `get` returns one report and the initial attachment metadata. `listMessages` returns messages and their attachment metadata. Metadata includes `id`, `kind`, `name`, `contentType`, and `size`. `getAttachment` reads one file's binary content and encodes it as Base64. The following is the successful result's `data` for the steps file. `U3RlcHM=` decodes to `Steps`.

```json
{
  "name": "steps.txt",
  "contentType": "application/octet-stream",
  "dataBase64": "U3RlcHM="
}
```

<a id="retention"></a>

## Runtime data and retention

| Data | Where stored | Availability |
| --- | --- | --- |
| Browser logs and page events before opening feedback | Memory in the current signed-in page | Buffered for the page session, with up to five minutes of usable history by default. Reloading or signing out starts a new buffer. |
| Correlatable server request logs | Memory in the current server process | The default instance buffer holds up to 5,000 entries and 4 MiB. Attaching logs uses the window, entry limit, and byte limit in `capture` for the same user and business scope. Restarting the process clears the buffer. |
| Submitted reports, messages, and files | The three relational tables above | Available after a successful submission and retained according to `retention.days`. |

The database stores the attachment bytes, so the application can operate without object storage. The default is indefinite retention. A positive `retention.days` counts from `updated_at` and applies to Pending, Awaiting user, and Handled reports. After expiry, lists, details, messages, and attachments are no longer accessible. At startup and hourly, the service uses the `hai_feedback_reports_retention` index over `(app_id, updated_at, id)` to delete expired reports for its application in batches. Messages and attachments cascade with the report.

[Feedback operations](../operations/feedback.en.md)
