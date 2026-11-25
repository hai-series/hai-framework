# @h-ai/audit Configuration

[简体中文](audit.md) · [日本語](audit.ja.md) · [Data structures](../data/audit.en.md) · [API reference](../function/audit.en.md)

## Configuration entry

Generated applications read `config/_audit.yml` through `core.config.get('audit')` and pass the settings to `audit.init()` after connecting RelDB. Use the `HAI_AUDIT_` prefix for environment overrides. Changes take effect on the next successful initialization. See [configuration sources and precedence (Chinese)](runtime.md#配置从哪里来).

Inject initialized Reach for alerts and initialized private Storage for backups. For recurring tasks, read the `audit.schedulerPlan` property and register its tasks and hooks with Scheduler. See the [scheduled audit example](../function/audit.en.md#scheduled-audit).

<a id="configuration-fields"></a>

## Configuration reference

<a id="configuration-examples"></a>

Merge the YAML sections below into `config/_audit.yml`. Choose the example that fits each feature. Restart the service after editing the file, then check the result described in the example. Substitute your own account, recipient, and business field names.

<a id="audit-capture"></a>

### `capture`

After the application initializes Audit, framework entry points that support auditing call `audit.capture()` when they have an operation result.

- **IAM** records the outcome of operations such as sign-in, account changes, and authorization. For example, `iam.auth.login()` attempts to record `action: 'auth.login'` and `resource: 'iam.auth'`. Its details contain `method: 'password'` for password sign-in.
- **Kit** handles SvelteKit requests through `kit.createHandle()` and records `request.execute` before returning the response. The route ID becomes `resource`, and the details include the HTTP method and status.
- **Serv** records `request.execute` when an instrumented procedure returns. A request rejected early by HTTP validation or middleware can produce `http.reject`.

Kit and Serv treat `GET`, `HEAD`, and `OPTIONS` as reads. By default they skip successful reads and still capture failed or denied ones. For a business action such as confirming an order, use [`audit.log()`](../function/audit.en.md#events) to record the action, order ID, and status change separately.

| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `capture` | Optional | Controls automatic capture at instrumented framework entry points. |
| `capture.enabled` | `true` | Record important actions, failures and denials automatically. Explicit `audit.log()` calls still write when automatic capture is disabled. |
| `capture.includeReads` | `false` | Also capture successful reads at instrumented entry points. |

<a id="example-record-order-updates-and-failed-operations"></a>

#### Example: Record an update request in the admin console

Restart the admin console and update a test user with a test account that has permission to edit users. When the `PUT /api/iam/users/[id]` request succeeds, Kit records `action: 'request.execute'`, `resource: '/api/iam/users/[id]'`, and `outcome: 'success'`. Query it with `audit.list({ action: 'request.execute', resource: '/api/iam/users/[id]' })`. Decoded `details` contains `{ "method": "PUT", "status": 200 }`. If the permission check rejects the same request with 403, the event has `outcome: 'denied'`.

```yaml schema=@h-ai/audit:AuditInitConfigSchema
capture:
  enabled: true
  includeReads: false
```

<a id="record-reads-and-hide-customer-phone-numbers"></a>

#### Example: Trace successful reads

Restart the admin console and send `GET /api/iam/users` directly from a signed-in test session with the `user:list` permission. In `audit.list({ action: 'request.execute', resource: '/api/iam/users' })`, look for a new success event whose decoded `details` contains `{ "method": "GET", "status": 200 }`. High-traffic reads increase audit volume.

```yaml schema=@h-ai/audit:AuditInitConfigSchema
capture:
  enabled: true
  includeReads: true
```

#### Example: Record only explicit business events

After restarting, call `iam.auth.login()` directly on the server with a test account. Separately, call `audit.log()` with a custom business event. Check `audit.list()` for the explicit event. The direct test sign-in adds no IAM `auth.login` event.

```yaml schema=@h-ai/audit:AuditInitConfigSchema
capture:
  enabled: false
```

<a id="audit-privacy"></a>

### `privacy`

Mask business data under `details` before writing the event so readers need access only to the data they use. Credentials are always masked.

| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `privacy` | Optional | Configure the masking of business data in event details. Credentials are always masked. |
| `privacy.enabled` | `true` | Mask common business data such as email addresses and phone numbers. |
| `privacy.fields` | `[]` | Up to 1000 extra field names, each 1–256 characters, matched case-insensitively in event details. |

#### Example: Mask customer phone numbers and delivery notes

The order service calls `audit.log()` after updating delivery. Its `details` contains the data the application chose to record. The default masking rule already matches phone field names. The configuration below also masks the application’s `deliveryNote` field.

```yaml schema=@h-ai/audit:AuditInitConfigSchema
privacy:
  fields: [customerPhone, deliveryNote]
```

Start the test service with this configuration, write a sample order event, then look up the saved event by its request ID.

```ts
import { audit } from '@h-ai/audit'

// Save the delivery status and two sample details. The two private values are replaced before storage.
const written = await audit.log({
  action: 'delivery.update',
  resource: 'orders',
  resourceId: 'order-42',
  requestId: 'demo-order-privacy',
  details: {
    customerPhone: '000-0000-0000',
    deliveryNote: 'Leave at reception',
    status: 'shipped',
  },
})
if (!written.success) throw new Error(written.error.message)

// Filter by the sample request ID and identify this write by its event ID.
const listed = await audit.list({ requestId: 'demo-order-privacy' })
if (!listed.success) throw new Error(listed.error.message)
const event = listed.data.items.find(item => item.id === written.data.id)
if (!event?.details) throw new Error('The saved audit event did not return details')
const details = JSON.parse(event.details)
```

`event.details` is the JSON string returned by the query. Parsing it shows the three fields that were stored.

```json
{
  "customerPhone": "[REDACTED]",
  "deliveryNote": "[REDACTED]",
  "status": "shipped"
}
```

#### Example: Disable business-data masking in a test environment

Write an event with a fictitious email and token in a test environment with no real customer data. Query the event. The email remains visible and the token remains masked.

```yaml schema=@h-ai/audit:AuditInitConfigSchema
privacy:
  enabled: false
```

<a id="audit-user-mapping"></a>

### User mapping

Look up a username using the event’s `userId` and copy it into the actor snapshot. Audit uses the IAM user table by default. Supply a trusted user ID. Later account renames leave recorded snapshots intact.

| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `userTable` | `"hai_iam_users"` | Table to look in when capturing an actor name. |
| `userIdColumn` | `"id"` | User ID column in that table. |
| `userNameColumn` | `"username"` | Column whose value becomes the username in the event snapshot. |

#### Example: Read the name from an application-owned user table

The order service stores its accounts in `app_users`, identified by `account_id` with names in `display_name`. Add a test account in the same database, write an event with its ID and omit `actorSnapshot`. Use `audit.list()` to confirm that the event carries the user’s name at the time.

```yaml schema=@h-ai/audit:AuditInitConfigSchema
userTable: app_users
userIdColumn: account_id
userNameColumn: display_name
```

<a id="audit-retention"></a>

### `retention`

Set the minimum protection period for recent audit records. When enabled, database triggers prevent updates, replacement, and deletion during that period. `audit.cleanup()` also respects the minimum. The application schedules cleanup after the period. Use identical retention settings on instances that share a database and restart them together after a change.

| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `retention` | Optional | Omit it or use `{}` to apply the field defaults below. |
| `retention.enabled` | `false` | Protect records from update, deletion, and replacement during the configured period. |
| `retention.minDays` | `90` | Protection period in 24-hour days, an integer from 1 through 36500. It sets the minimum cleanup age when `enabled: true`. |

<a id="protect-the-last-90-days-of-audit-records"></a>

#### Example: Protect the last 90 days of audit records

Enable 90 days of protection. Run `audit.cleanup(0)` in a test database and check its deleted count. Records from the last 90 days stay in place.

```yaml schema=@h-ai/audit:AuditInitConfigSchema
retention:
  enabled: true
  minDays: 90
```

<a id="change-retention"></a>

<a id="extend-an-active-policy-to-120-days"></a>

#### Example: Extend an active policy to 120 days

Keep `enabled: true` and change `minDays` from 90 to 120. After restarting the instances together, `audit.cleanup(0)` in the test database deletes only records older than 120 days.

```yaml schema=@h-ai/audit:AuditInitConfigSchema
retention:
  enabled: true
  minDays: 120
```

#### Example: Disable protection in a test database

Set `enabled: false` in a dedicated test database. After restarting, `audit.cleanup(30)` uses 30 days. Calling it without an argument still uses the API default of 90 days.

```yaml schema=@h-ai/audit:AuditInitConfigSchema
retention:
  enabled: false
```

<a id="audit-backup"></a>

### `backup`

Write a separate archive to private object storage for authorized review or offline analysis. Supply initialized private Storage when starting Audit.

| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `backup` | Optional | Export audit history to private Storage. |
| `backup.enabled` | `false` | Allow manual or scheduled exports. Requires initialized private Storage. |
| `backup.batchSize` | `200` | Rows read per batch, an integer from 1 through 1000. Smaller batches use less memory and make more requests. |
| `backup.maxRecordBytes` | `1048576` | Maximum UTF-8 bytes per archived record, an integer from 1024 through 67108864. An oversized row fails that backup. |
| `backup.schedule` | Optional | Register tasks and hooks from `audit.schedulerPlan` to run backups automatically. |
| `backup.schedule.enabled` | `false` | Register an automatic backup when `backup.enabled` is also true. |
| `backup.schedule.cron` | `"0 2 * * *"` | Five-field Cron expression, 1–128 characters. Defaults to 02:00 daily in the selected time zone. |
| `backup.schedule.timezone` | `"UTC"` | IANA time zone for Cron, 1–128 characters, such as `Asia/Shanghai`. |

#### Example: Archive an investigation window on demand

Enable backups and supply the investigation time range to [`audit.backup.run()`](../function/audit.en.md#backups). Keep the successful result’s `key` and pass it to `audit.backup.verify(key)` to check the record count and checksum.

```yaml schema=@h-ai/audit:AuditInitConfigSchema
backup:
  enabled: true
```

#### Example: Archive nightly at 02:00 in private storage

Register the plan with Scheduler to archive daily at 02:00 in Shanghai. This example reads 100 records per batch and allows 2 MiB per record. After restarting, check for a successful scheduled execution and verify the resulting private object.

```yaml schema=@h-ai/audit:AuditInitConfigSchema
backup:
  enabled: true
  batchSize: 100
  maxRecordBytes: 2097152
  schedule:
    enabled: true
    cron: '0 2 * * *'
    timezone: Asia/Shanghai
```

<a id="audit-alerts"></a>

### `alerts`

Count committed audit events that match a rule and notify the configured recipients through Reach when the count reaches its threshold. The count covers all matching events in a fixed window. Use Reach for on-demand checks and register the plan with Scheduler for recurring checks.

| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `alerts` | Optional | Configure fixed-window checks of committed events. |
| `alerts.enabled` | `false` | Enable alert checks and notification attempts. Requires at least one rule and an initialized Reach instance with the named providers. |
| `alerts.maxNotificationsPerCheck` | `100` | Maximum attempts per scan, an integer from 1 to 1000. Further claims can be checked on a later scan. |
| `alerts.rules` | `[]` | Up to 20 rules. Each counts all matching events in a fixed window. |
| `alerts.rules[].id` | Required | Stable, unique rule ID of 1–64 letters, digits, underscores, or hyphens. |
| `alerts.rules[].actions` | Required | An array of 1–50 exact action names, each 1–128 characters after trimming. For example, `auth.login`. |
| `alerts.rules[].resource` | Optional | Limit matches to one resource name of 1–256 characters after trimming. |
| `alerts.rules[].outcomes` | `["failure", "denied"]` | Up to three values from `success`, `failure`, and `denied`. An empty array matches all outcomes. |
| `alerts.rules[].minimumSeverity` | `"info"` | Minimum event severity to count. `info`, `warning`, `error`, or `critical`. |
| `alerts.rules[].severity` | `"warning"` | Severity shown in the notification. `warning`, `error`, or `critical`. |
| `alerts.rules[].threshold` | `1` | Count required in one window, an integer from 1 through 1000000000. |
| `alerts.rules[].windowSeconds` | `300` | Length of a fixed window in seconds, an integer from 60 through 86400. |
| `alerts.rules[].targets` | Required | An array of 1–20 recipients, tracked individually. |
| `alerts.rules[].targets[].id` | Required | Stable ID unique in the rule, of 1–64 letters, digits, underscores, or hyphens. |
| `alerts.rules[].targets[].provider` | Required | Registered Reach provider **name**, 1–128 characters after trimming, such as `email`. |
| `alerts.rules[].targets[].to` | Required | Address accepted by that provider, 1–1000 characters after trimming. Configure a real recipient for delivery. |
| `alerts.schedule` | Optional | Register tasks and hooks from `audit.schedulerPlan` to run checks automatically. [`audit.checkAlerts()`](../function/audit.en.md#alerts) can also run on demand. |
| `alerts.schedule.enabled` | `false` | Register an automatic check when `alerts.enabled` is also true. |
| `alerts.schedule.cron` | `"* * * * *"` | Five-field Cron expression, 1–128 characters. Defaults to once a minute. |
| `alerts.schedule.timezone` | `"UTC"` | IANA time zone for Cron, 1–128 characters, such as `Asia/Shanghai`. |

#### Example: Check for failed or denied logins on demand

Register a Reach provider named `email` and replace the example address with a test recipient. Produce three `auth.login` failures or denials within one five-minute window. Run [`audit.checkAlerts()`](../function/audit.en.md#alerts) and check the `submitted` or `queued` count.

```yaml schema=@h-ai/audit:AuditInitConfigSchema
alerts:
  enabled: true
  rules:
    - id: login-failures
      actions: [auth.login]
      resource: iam.auth
      outcomes: [failure, denied]
      threshold: 3
      windowSeconds: 300
      targets:
        - id: security-mailbox
          provider: email
          to: security@example.com
```

#### Example: Notify administrators about role assignments

Replace the example recipient, register a Reach provider named `email`, and start Scheduler with the Audit plan. Assign an IAM role successfully and check the next execution and its Reach result. The job checks once a minute and attempts at most 20 notifications per execution.

```yaml schema=@h-ai/audit:AuditInitConfigSchema
alerts:
  enabled: true
  maxNotificationsPerCheck: 20
  rules:
    - id: role-assignment
      actions: [role.assign]
      resource: iam.user-roles
      outcomes: [success]
      threshold: 1
      windowSeconds: 300
      targets:
        - id: security-mailbox
          provider: email
          to: security@example.com
  schedule:
    enabled: true
    cron: '* * * * *'
    timezone: UTC
```

See also the [operations guide (Chinese)](operations.md#audit采集保留保护归档与告警) for examples that configure several services together.
