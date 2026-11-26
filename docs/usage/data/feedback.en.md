# @h-ai/feedback Data Structures

[简体中文](feedback.md) · [日本語](feedback.ja.md) · [API reference](../function/feedback.en.md) · [Configuration](../configuration/feedback.en.md)

Each report has a conversation shared by its author and staff. A submission or message saves its content, attachments, and any status change in a single transaction. Times are Unix milliseconds. The application writes each required field.

<a id="database"></a>

## Database

| Table | Purpose |
| --- | --- |
| [`hai_feedback_reports`](#table-hai-feedback-reports) | Store the original report and current status. |
| [`hai_feedback_messages`](#table-hai-feedback-messages) | Store replies and requests for more information. |
| [`hai_feedback_attachments`](#table-hai-feedback-attachments) | Store files attached to a report or message. |

<a id="table-hai-feedback-reports"></a>

### `hai_feedback_reports`

| Column | Type | Nullable | Purpose |
| --- | --- | --- | --- |
| `id` | `TEXT` | No | Caller-generated submission UUID and primary key. |
| `app_id` | `TEXT` | No | Application that accepted the report. |
| `scope_id` | `TEXT` | No | Business scope resolved from trusted context. |
| `user_id` | `TEXT` | No | ID of the person who submitted the report. |
| `body` | `TEXT` | No | Original text. Empty if submitted with files only. |
| `status` | `TEXT` | No | `pending`, `awaiting_user`, or `handled`. |
| `created_at` | `BIGINT` | No | Submission time. |
| `updated_at` | `BIGINT` | No | Time of the latest message or status change. |

The primary key is `id`. List pages use app, scope, and activity time. My Feedback also filters by user ID.

<a id="table-hai-feedback-messages"></a>

### `hai_feedback_messages`

| Column | Type | Nullable | Purpose |
| --- | --- | --- | --- |
| `id` | `TEXT` | No | Caller-generated UUID and primary key. |
| `report_id` | `TEXT` | No | ID of the enclosing report. |
| `author_id` | `TEXT` | No | ID of the person sending the message. |
| `author_role` | `TEXT` | No | `author` for the report’s author or `staff` for authorized staff. |
| `kind` | `TEXT` | No | `reply` for a reply or `request_info` for a staff request. |
| `body` | `TEXT` | No | Message text. Empty if it contains only files. |
| `created_at` | `BIGINT` | No | Time the message was sent. |

`report_id` links the message to the report. Page by `(report_id, created_at, id)`. A message and any resulting status change are committed together.

<a id="table-hai-feedback-attachments"></a>

### `hai_feedback_attachments`

| Column | Type | Nullable | Purpose |
| --- | --- | --- | --- |
| `id` | `TEXT` | No | Server-generated attachment UUID. |
| `report_id` | `TEXT` | No | ID of the enclosing report. |
| `message_id` | `TEXT` | Yes | ID of the message. Null for a file submitted with the original report. |
| `name` | `TEXT` | No | File name shown to the reader. |
| `content_type` | `TEXT` | No | Media type returned to the reader. |
| `size` | `INTEGER` | No | Original size in bytes. |
| `content` | `BLOB` | No | Original binary content. |

Read metadata by `(report_id, message_id, id)`. File retrieval checks access to the report first.


Suppose report `a5f59b38-ef92-47bb-b0a0-b0f9c07f7f93` starts with `screen.png`. Its `message_id` is null. If a staff request later includes `steps.txt`, that file references the request message. Both files use the same report permission check.

## Attachments and retention

Binary data and metadata share the relational database. Lists select metadata. Only the single-file endpoint encodes Base64 for the client. SQLite uses BLOB, PostgreSQL BYTEA, and MySQL MEDIUMBLOB. The application manages retention through its database policy. Initialize this schema in a fresh database.
