# @h-ai/feedback Configuration

<!-- translation: partial -->

[Chinese source](feedback.md) · [Data structures](../data/feedback.en.md) · [API reference](../function/feedback.en.md)

## Configuration entry

Configure the feedback service in `_feedback.yml`. Use server-side collection controls and choose which evidence may leave the application. Configure notification and webhook delivery independently.

## Configuration reference


| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `appId`, `appVersion`, `buildId`, `commit` | Required app ID, other values optional | Link reports to the application and build. |
| `notificationMode`, `consoleContent`, `notificationProvider`, `recipients` | `reach`, `metadata`, `email`, `[]` | Select notification channel and shared information. |
| `collectionTimeoutMs`, `businessCollectionTimeoutMs` | `60000`, `30000` | Collection time limits in milliseconds. |
| `webhookUrl`, `webhookSecret`, `webhookTimeoutMs` | `""`, `""`, `10000` | Webhook destination, signing secret and timeout. |
| `workerIntervalMs`, `leaseMs`, `maxAttempts` | `1000`, `30000`, `5` | Worker polling, lease period and maximum claimed attempts, including claims interrupted by worker exit. Cleanup keeps retrying. |
| `retentionDays`, `exportRetentionHours`, `maxExportsPerReport` | `30`, `24`, `5` | Report retention, export retention and export quota. The database retention deadline ends report access and export. Physical cleanup runs in the background. |
| `envAllowlist`, `maxTotalBytes`, `maxAttachmentBytes`, `maxEvidenceBytes`, `maxEvidenceCount` | `[]`, `33554432`, `5242880`, `4194304`, `2000` | Allowlisted environment names and submission size/count quotas. `maxEvidenceCount` accepts 1–10000, with an effective ceiling of 2000. The server reserves evidence for its environment and follow-up collection. |

Still untranslated: per-field limits for quotas, evidence, webhook retries and expiry. Read the [Chinese source section](feedback.md#configuration-fields).

## Configuration examples

```yaml schema=@h-ai/feedback:FeedbackConfigSchema
appId: orders
notificationMode: console
consoleContent: metadata
```

### Email the team about new feedback

Put this in `config/_feedback.yml`. `email` must name an initialized Reach provider that can actually deliver mail; a Console provider only logs it. `adminUrl` is the link included in notifications. It neither creates the page nor grants access.

```yaml schema=@h-ai/feedback:FeedbackConfigSchema
appId: orders
notificationMode: reach
notificationProvider: email
recipients: [support@example.com]
adminUrl: https://admin.example.com/feedback
```

### Limit attachments and shorten retention

Allow at most 2 MiB per attachment and ten accepted reports per user per day. Retain reports for seven days and exported ZIP files for twelve hours. `disabled` turns off notifications while reports are still stored. Expired objects are removed by background cleanup, so the worker must remain active.

```yaml schema=@h-ai/feedback:FeedbackConfigSchema
appId: orders
notificationMode: disabled
maxAttachmentBytes: 2097152
maxReportsPerUserDay: 10
retentionDays: 7
exportRetentionHours: 12
```
