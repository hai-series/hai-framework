# @h-ai/audit Data Structures

[简体中文](audit.md) · [日本語](audit.ja.md)

[Data reference index](README.en.md) · [Configuration](../configuration/audit.en.md) · [API reference](../function/audit.en.md)

When a user reads an order, Audit records the actor, target, outcome, and time. Operators can find matching events, export a time range, or apply a policy that limits deletion.

<a id="tables"></a>

## Database

Call `reldb.init()` first. `audit.init()` prepares the tables on that connection.

The module uses 3 tables.

| Table | Purpose |
| --- | --- |
| [`hai_audit_logs`](#table-hai-audit-logs) | Find who acted on a resource and when. |
| [`hai_audit_policy`](#table-hai-audit-policy) | Enforce the minimum retention period. |
| [`hai_audit_alert_claims`](#table-hai-audit-alert-claims) | Let one instance claim a rule, destination and time window. |

<a id="table-hai-audit-logs"></a>

### `hai_audit_logs`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | No | — | Event primary key. IDs issued by Audit start with `audit_`. | `audit_example-42` |
| `user_id` | `TEXT` | Yes | — | ID of the user who acted. | `user-42` |
| `action` | `TEXT` | No | — | Action performed. | `read` |
| `resource` | `TEXT` | No | — | Type of resource. | `orders` |
| `resource_id` | `TEXT` | Yes | — | ID of the affected resource. | `order-42` |
| `details` | `JSON` | Yes | — | Business details available for investigation. | `{"fields":["status"]}` |
| `ip_address` | `TEXT` | Yes | — | Request source IP address. | `192.0.2.10` |
| `user_agent` | `TEXT` | Yes | — | Client user agent. | `Example Browser` |
| `category` | `TEXT` | Yes | — | Event category used for filtering. | `security` |
| `outcome` | `TEXT` | Yes | — | Whether the action succeeded, failed or was denied. | `success` |
| `severity` | `TEXT` | Yes | — | Event severity. | `info` |
| `request_id` | `TEXT` | Yes | — | Related request ID. | `req-42` |
| `trace_id` | `TEXT` | Yes | — | Related trace ID. | `trace-42` |
| `scope_id` | `TEXT` | Yes | — | Business scope of the event. | `team-1` |
| `actor_snapshot` | `JSON` | Yes | — | Snapshot of the actor at the time of the event. | `{"id":"user-42"}` |
| `created_at` | `TIMESTAMP` | Yes | — | Event time from the database clock when Audit writes it. | `2026-11-17T00:00:00.000Z` |

The `created_at` index supports time ranges and retention cleanup. Entries written in an application transaction commit or roll back with it.

<a id="example-data"></a>

<a id="find-who-did-what"></a>

#### Example · Find who did what

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

<a id="table-hai-audit-policy"></a>

### `hai_audit_policy`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `INTEGER` | No | — | Fixed primary key of the row inserted at initialization. | `1` |
| `enabled` | `INTEGER` | No | — | `1` enforces minimum retention, `0` disables it. Audit initially writes `0`. | `1` |
| `min_days` | `INTEGER` | No | — | Minimum days to retain records. Audit initially writes `90`. | `90` |

<a id="which-audit-records-must-be-retained"></a>

#### Example · Which audit records must be retained

Store the database-enforced minimum retention so cleanup cannot delete protected events early.

```json
{
  "id": 1,
  "enabled": 1,
  "min_days": 90
}
```

The single id:1 policy is enabled and requires 90 days. It is not a daily policy-history row.

<a id="table-hai-audit-alert-claims"></a>

### `hai_audit_alert_claims`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `VARCHAR(64)` | No | — | Digest of the rule, destination and window. Primary key. | `<claim-digest>` |
| `rule_id` | `VARCHAR(64)` | No | — | Alert rule ID. | `failed-login` |
| `target_id` | `VARCHAR(64)` | No | — | Alert destination ID. | `security` |
| `window_start` | `BIGINT` | No | — | Start of the alert window in Unix milliseconds. | `1794873600000` |
| `status` | `VARCHAR(16)` | No | — | Processing state after the claim. | `claimed` |
| `queue_id` | `VARCHAR(64)` | Yes | — | Reach queue ID once the alert is queued. | `notification-42` |
| `error_code` | `VARCHAR(128)` | Yes | — | Diagnostic error code if the alert fails. | `NULL` |

<a id="claim-one-alert-across-nodes"></a>

#### Example · Claim one alert across nodes

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

<a id="policy"></a>

### Retention and alert claims

The database prevents updates to protected audit records and prevents deletion before the minimum retention period. The claim table coordinates delivery; delivery records belong to Reach.

<a id="backups"></a>

## Object storage

Audit writes no Redis keys. Backups are private Storage objects at `hai-private/audit-backups/<id>.jsonl`. The first line records format, version and cutoff; each middle line is an event; the last records row count and SHA-256. Storage policy controls object retention.

### Which records an audit backup covers

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
