# @h-ai/feedback Configuration

[简体中文](feedback.md) · [日本語](feedback.ja.md)

[Configuration guide](README.en.md) · [Data structures](../data/feedback.en.md) · [API reference](../function/feedback.en.md)

## Configuration entry

At startup, the application reads `config/_feedback.yml` and passes it to `feedback.init(config, options)`. Restart after changing the settings. Environment overrides follow the field path. For example, use `HAI_FEEDBACK_NOTIFICATION_MODE` for `notification.mode` and `HAI_FEEDBACK_LIMITS_MAXTOTALBYTES` for `limits.maxTotalBytes`. See the [configuration precedence](runtime.md#配置从哪里来).

<a id="configuration-fields"></a>

## Configuration reference

### Basic setup

Generated projects explicitly use `console`. Submit a report and find its number in the server log to confirm the notification.

| Path | Default and constraints | Purpose |
| --- | --- | --- |
| `appId` | Required, 1–128 characters | Match the application ID used by the browser and API. |
| `notification.mode` | `reach`. Also accepts `disabled` and `console` | Disable feedback notifications, log them, or send them through Reach. |
| `retention.days` | 30, 1–3650 days | End access and exports at expiry. The worker removes evidence and objects. |

```yaml schema=@h-ai/feedback:FeedbackConfigSchema
appId: orders
notification:
  mode: console
```

### Optional features

| Path | Default and constraints | Purpose |
| --- | --- | --- |
| `notification.consoleContent` | `metadata` or `summary` | Log identifying metadata. Select `summary` to include a redacted summary. |
| `notification.recipients` | `[]`, at most 20 entries, 1–320 characters each | Reach mode requires a recipient. The configured provider validates the destination. |
| `notification.provider` | `email`, nonempty | Name of the initialized Reach provider. |
| `notification.adminUrl` | Optional HTTP(S) URL | Link used in notifications and Webhook events. |
| `webhook.url` | Empty, up to 2048 characters | A trusted HTTP(S) endpoint enables Webhook delivery. URL credentials and fragments are rejected. |
| `webhook.secret` | Empty, up to 4096 characters | Sign callbacks using private server variable `HAI_FEEDBACK_WEBHOOK_SECRET`. |
| `collection.envAllowlist` | `[]`, at most 100 names, 1–128 characters each | Collect approved server environment names. Sensitive names are filtered. |
| `build.appVersion`, `build.buildId`, `build.commit` | Optional, up to 128 characters each | Report version, build identity and source commit. Generated projects inject the actual build values. |

To email the on-call team, initialize the Reach provider named `email`, then submit a report to verify delivery and the link.

```yaml schema=@h-ai/feedback:FeedbackConfigSchema
appId: orders
notification:
  mode: reach
  provider: email
  recipients: [support@example.com]
  adminUrl: https://admin.example.com/feedback
```

Register business evidence using `feedback.init(config, { collectEvidence })`. With a Webhook, the receiver can track delivery by event ID. See [business collection and Webhooks](../function/feedback.en.md#service).

### Operations

| Path | Default and constraints | Purpose |
| --- | --- | --- |
| `limits.maxTotalBytes` | 32 MiB, 4–40 MiB in bytes | Uncompressed export budget used to derive material and encrypted transport limits. |
| `limits.maxAttachmentBytes` | 5 MiB, 1 byte–5 MiB | Per-attachment limit within the total budget. |
| `limits.maxEvidenceBytes` | 4 MiB, 1024 bytes–4 MiB | Total evidence bytes for one report. |
| `limits.maxEvidenceCount` | 2000, accepts 1–10000 | The effective ceiling is 2000. The server reserves space for environment and follow-up evidence. |
| `limits.maxReportsPerUserDay` | 20, 1–10000 reports | Charge each accepted report once per database UTC day, application, scope and user. |
| `limits.maxBytesPerUserDay` | 2 GiB, 4 MiB–1 TiB in bytes | Daily reservation for the user's reports and historical exports. |
| `limits.maxStoredBytesPerScope` | 10 GiB, 4 MiB–1 TiB in bytes | Scope-wide reservation per application, released when expired reports are cleaned up. |
| `limits.maxExportsPerReport` | 5, 1–20 | Export quota per report. Reusing a valid snapshot keeps the existing charge. |
| `retention.exportHours` | 24, 1–720 hours | End ZIP downloads at expiry. The worker deletes expired exports. |
| `collection.timeoutMs` | 60000, 0–300000 ms | How long to wait for the client to send evidence. |
| `collection.businessTimeoutMs` | 30000, 1–300000 ms | Timeout for one business collection callback. |
| `webhook.timeoutMs` | 10000, 1–60000 ms | Single Webhook request timeout. The worker retries failures. |
| `worker.intervalMs` | 1000, 0–60000 ms | Polling interval. Set to 0 for manual `feedback.runJobs()`. |
| `worker.leaseMs` | 30000, 1000–300000 ms | Lease duration before another worker can take over. |
| `worker.maxAttempts` | 5, 1–20 attempts | Maximum claims for ordinary jobs, including worker exit. Cleanup keeps retrying. |

Each report reserves `limits.maxTotalBytes × (1 + limits.maxExportsPerReport)`. The default 192 MiB reservation means the 2 GiB daily budget accepts ten reports. After changing limits, submit a report with an attachment and export its ZIP to check the application and proxy budgets.

```yaml schema=@h-ai/feedback:FeedbackConfigSchema
appId: orders
notification:
  mode: disabled
retention:
  days: 7
  exportHours: 12
limits:
  maxAttachmentBytes: 2097152
  maxReportsPerUserDay: 10
```

[Feedback operations](../operations/feedback.md)
