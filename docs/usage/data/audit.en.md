# @h-ai/audit Data structures

[Chinese source](audit.md) · [Configuration](../configuration/audit.en.md) · [API reference](../function/audit.en.md)

<a id="tables"></a>

## Database tables

Call `reldb.init()` first. `audit.init()` prepares the tables on that connection. Missing optional values are NULL; the writer supplies the values unless stated otherwise.

### `hai_audit_logs`

| Field or table | Shape and meaning |
| --- | --- |
| `id` | String primary key. Generated IDs start with `audit_`. |
| `action`, `resource` | Required strings: action and resource category. |
| `created_at` | Timestamp written using the database clock. MySQL stores millisecond precision in `DATETIME(3)`. |
| `user_id`, `resource_id`, `ip_address`, `user_agent` | Nullable strings: actor, resource instance, source IP and user agent. |
| `category`, `outcome`, `severity` | Nullable strings: event category, result and severity. |
| `request_id`, `trace_id`, `scope_id` | Nullable strings for request, trace and business scope. |
| `details`, `actor_snapshot` | Nullable JSON: event details and the actor as recorded at the time. |

`created_at` has an index for time-based searches and retention. Audit entries written inside an application transaction commit or roll back with it.

<a id="policy"></a>

## Retention and alert claims

| Field or table | Shape and meaning |
| --- | --- |
| `hai_audit_policy` | Integer primary key `id=1`. `enabled` (enforce minimum retention) and `min_days` (days) are required integers seeded to `0` and `90`. |
| `hai_audit_alert_claims` | `id` is a string primary key derived from rule, target and window. Required fields: `rule_id`, `target_id`, `status` (strings) and `window_start` (integer). Nullable `queue_id` links Reach work; nullable `error_code` identifies delivery failure. |

The database prevents updates to protected audit records and prevents deletion before the minimum retention period. The claim table coordinates delivery; delivery records belong to Reach.

<a id="backups"></a>

## Cache and backup objects

Audit writes no Redis keys. Backups are private Storage objects at `hai-private/audit-backups/<id>.jsonl`. The first line records format, version and cutoff; each middle line is an event; the last records row count and SHA-256. Storage policy controls object retention.
