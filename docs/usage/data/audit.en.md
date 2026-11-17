# @h-ai/audit Data structures

<!-- translation: partial -->

[Chinese source](audit.md) · [Configuration](../configuration/audit.en.md) · [API reference](../function/audit.en.md)

Audit events persist in RelDB. The optional backup writes objects to the configured Storage service. A database policy row controls cleanup across nodes.

| Table, key or artifact | Shape and ownership |
| --- | --- |
| `hai_audit_logs` | PK `id`, action and resource, timestamp `created_at`, optional actor, resource ID, JSON details, source address, client metadata, category, outcome, severity, request/trace/scope and actor snapshot. Indexed by creation time. |
| `hai_audit_policy` | One row `id=1`; initially `enabled=0` and `min_days=90`. |
| `hai_audit_alert_claims` | Unique claim by rule, target and window; stores those identities, status, optional queue ID and error code. |

Additional options and workflow examples are available in the [Chinese reference](audit.md).
