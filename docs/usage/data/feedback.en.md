# @h-ai/feedback Data structures

<!-- translation: partial -->

[Chinese source](feedback.md) · [Configuration](../configuration/feedback.en.md) · [API reference](../function/feedback.en.md)

RelDB owns reports, evidence and job state. Storage owns attachment and export bytes. Identifiers and scope must be derived on the server.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| `hai_feedback_reports` | ID, visible number, app and trusted user/scope, submission key/hash, processing/collection/notification states, version/revision, evidence counts, deadlines and redacted payload. |
| `hai_feedback_evidence`, `hai_feedback_attachments`, `hai_feedback_history` | Evidence by report or temporary scope, attachment checksum/object key/status, and actor/time/state-change history. |
| `hai_feedback_jobs`, `hai_feedback_quotas` | Job lease and attempt records, and quota counters for user, scope and report. |

Field constraints, defaults and retention details are available in the [Chinese reference](feedback.md).
