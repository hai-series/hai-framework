# @h-ai/audit Data structures

[Chinese source](audit.md) · [Configuration](../configuration/audit.en.md) · [API reference](../function/audit.en.md)

<a id="example-data"></a>

## What these records are for

### Find who did what

Structure: `hai_audit_logs`.

Record actor, resource and outcome for investigation and audit retention.

```json
{
  "id": "audit_example-42",
  "action": "read",
  "resource": "orders",
  "resource_id": "order-42",
  "user_id": "user-42",
  "details": {
    "fields": [
      "status"
    ]
  },
  "created_at": "2026-11-17T00:00:00.000Z"
}
```

user-42 read order-42; details says only status was viewed. created_at shows the database event timestamp in UTC.

After filtering by scope and event, `audit.countByOutcome` returns a projection. For example, `{ total: 4, success: 2, failure: 1, denied: 0, unclassified: 1 }` includes a historical event without an outcome. The query counts existing logs independently of pagination and ordering.

### Which audit records must be retained

Structure: `hai_audit_policy`.

Store the database-enforced minimum retention so cleanup cannot delete protected events early.

```json
{
  "id": 1,
  "enabled": 1,
  "min_days": 90
}
```

The single id:1 policy is enabled and requires 90 days. It is not a daily policy-history row.

### Claim one alert across nodes

Structure: `hai_audit_alert_claims`.

Claim an alert for one rule, target and time window to reduce duplicate notifications.

```json
{
  "id": "<claim-digest>",
  "rule_id": "failed-login",
  "target_id": "security",
  "window_start": 1794873600000
}
```

This targets security under failed-login; window_start is Unix ms. A claim does not prove delivery to a person.

### Which records an audit backup covers

Structure: `backup JSONL`.

A backup header defines format and export range, followed by event lines and a count/checksum footer.

```json
{
  "type": "header",
  "format": "hai-audit",
  "version": 1,
  "id": "backup-42",
  "createdAt": "2026-11-17T00:00:00.000Z",
  "cutoff": "2026-11-17T00:00:00.000Z",
  "from": null,
  "requestHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}
```

This is only a header, not a restorable archive. cutoff is the endpoint; null from means no start filter. Entries and footer still need verification.

## Field, storage and cleanup reference

<a id="tables"></a>

### Database tables

Call `reldb.init()` first. `audit.init()` prepares the tables on that connection. Missing optional values are NULL; the writer supplies the values unless stated otherwise.

#### `hai_audit_logs`

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

### Retention and alert claims

| Field or table | Shape and meaning |
| --- | --- |
| `hai_audit_policy` | Integer primary key `id=1`. `enabled` (enforce minimum retention) and `min_days` (days) are required integers seeded to `0` and `90`. |
| `hai_audit_alert_claims` | `id` is a string primary key derived from rule, target and window. Required fields: `rule_id`, `target_id`, `status` (strings) and `window_start` (integer). Nullable `queue_id` links Reach work; nullable `error_code` identifies delivery failure. |

The database prevents updates to protected audit records and prevents deletion before the minimum retention period. The claim table coordinates delivery; delivery records belong to Reach.

<a id="backups"></a>

### Cache and backup objects

Audit writes no Redis keys. Backups are private Storage objects at `hai-private/audit-backups/<id>.jsonl`. The first line records format, version and cutoff; each middle line is an event; the last records row count and SHA-256. Storage policy controls object retention.
