# @h-ai/audit Data Structures

[简体中文](audit.md) · [日本語](audit.ja.md)

[Data reference index](README.en.md) · [Configuration](../configuration/audit.en.md) · [API reference](../function/audit.en.md)

When a user reads an order, Audit records the actor, target, outcome, and time. Operators can find matching events, export a time range, or apply a policy that limits deletion.

<a id="tables"></a>

## Database

Call `reldb.init()` first. `audit.init()` prepares the tables on that connection.

The module uses two tables.

| Table | Purpose |
| --- | --- |
| [`hai_audit_logs`](#table-hai-audit-logs) | Find who acted on a resource and when. |
| [`hai_audit_alert_claims`](#table-hai-audit-alert-claims) | Let one instance claim a rule, destination and time window. |

<a id="table-hai-audit-logs"></a>

### `hai_audit_logs`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT`, MySQL `VARCHAR(255)` | No | — | Event primary key. IDs issued by Audit start with `audit_`. | `audit_example-42` |
| `user_id` | `TEXT`, MySQL `VARCHAR(256)` | Yes | — | ID of the user who acted. | `user-42` |
| `action` | `TEXT`, MySQL `VARCHAR(256)` | No | — | Action performed. | `read` |
| `resource` | `TEXT`, MySQL `VARCHAR(256)` | No | — | Type of resource. | `orders` |
| `resource_id` | `TEXT`, MySQL `VARCHAR(256)` | Yes | — | ID of the affected resource. | `order-42` |
| `details` | SQLite `TEXT`, PostgreSQL `JSONB`, MySQL `JSON` | Yes | — | Business details available for investigation. | `{"fields":["status"]}` |
| `ip_address` | `TEXT`, MySQL `VARCHAR(256)` | Yes | — | Request source IP address. | `192.0.2.10` |
| `user_agent` | `TEXT`, MySQL `VARCHAR(4096)` | Yes | — | Client user agent. | `Example Browser` |
| `category` | `TEXT`, MySQL `VARCHAR(255)` | No | — | System or business event category used for filtering. | `business` |
| `outcome` | `TEXT`, MySQL `VARCHAR(255)` | No | — | Whether the action succeeded, failed or was denied. | `success` |
| `severity` | `TEXT`, MySQL `VARCHAR(255)` | No | — | Event severity. | `info` |
| `request_id` | `TEXT`, MySQL `VARCHAR(256)` | Yes | — | Related request ID. | `req-42` |
| `trace_id` | `TEXT`, MySQL `VARCHAR(256)` | Yes | — | Related trace ID. | `trace-42` |
| `scope_id` | `TEXT`, MySQL `VARCHAR(256)` | Yes | — | Business scope of the event. | `team-1` |
| `actor_snapshot` | SQLite `TEXT`, PostgreSQL `JSONB`, MySQL `JSON` | Yes | — | Snapshot of the actor at the time of the event. | `{"id":"user-42"}` |
| `created_at` | SQLite `INTEGER`, PostgreSQL/MySQL `BIGINT` | No | — | Event time from the database clock in Unix milliseconds. | `1794873600000` |

The `created_at` index supports time ranges and retention cleanup. The MySQL log table uses the `utf8mb4_0900_bin` collation. Exact string filters distinguish case, accents and trailing spaces.

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
  "created_at": 1794873600000
}
```

`user-42` read the `status` of `order-42`. The selected fields show the stored representation. The API converts `created_at` to `createdAt: Date`, which formats as `2026-11-17T00:00:00.000Z` with `toISOString()`.

After filtering by scope and event, `audit.countByOutcome` counts successful, failed, and denied events. For example, `{ total: 4, success: 2, failure: 1, denied: 1 }`. The query counts existing logs independently of pagination and ordering.

<a id="table-hai-audit-alert-claims"></a>

### `hai_audit_alert_claims`

| Column | Type | Nullable | Default | Meaning | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | `VARCHAR(64)` | No | — | Digest of the rule, destination and window. Primary key. | `<claim-digest>` |
| `rule_id` | `VARCHAR(64)` | No | — | Alert rule ID. | `failed-login` |
| `target_id` | `VARCHAR(64)` | No | — | Alert destination ID. | `business` |
| `window_start` | `BIGINT` | No | — | Start of the alert window in Unix milliseconds. | `1794873600000` |
| `status` | `VARCHAR(16)` | No | — | `claimed` is reserved, `sending` is authorized, `submitted` was accepted by the provider, `queued` entered the queue, and `unknown` needs review. | `claimed` |
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
  "window_start": 1794873600000,
  "status": "claimed"
}
```

This targets security under failed-login; window_start is Unix ms. A claim does not prove delivery to a person.

<a id="policy"></a>

### Retention and alert claims

When [retention protection](../configuration/audit.en.md#audit-retention) is enabled, Audit installs database triggers from the active configuration to protect recent events from updates, deletions and overwrites. Instances sharing the database use the same settings. Events written in an application transaction commit or roll back with it. Cleanup and relative-time statistics compute their cutoffs using the database execution clock, in 24-hour days.

Application instances share the alert claim table. Checks prune `submitted` and `queued` rows whose window started more than 72 hours ago. This is three times the maximum supported 24-hour window and applies across instances, even when some use shorter windows. Keep `claimed`, `sending` and `unknown` rows for review. Reach owns delivery records. See [Reach data structures](reach.en.md).

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

This excerpt shows the header. `cutoff` is the upper bound and `from: null` means the range has no lower bound. `audit.backup.verify(key)` validates the entries, footer count and checksum.
