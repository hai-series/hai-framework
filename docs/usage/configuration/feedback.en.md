# @h-ai/feedback Configuration

<!-- translation: partial -->

[Chinese source](feedback.md) · [Data structures](../data/feedback.en.md) · [API reference](../function/feedback.en.md)

Configure the feedback service in `_feedback.yml`. Use server-side collection controls and choose which evidence may leave the application. Configure notification and webhook delivery independently.

```yaml schema=@h-ai/feedback:FeedbackConfigSchema
appId: orders
notificationMode: console
consoleContent: metadata
```

| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `appId`, `appVersion`, `buildId`, `commit` | Required app ID, other values optional | Link reports to the application and build. |
| `notificationMode`, `consoleContent`, `notificationProvider`, `recipients` | `reach`, `metadata`, `email`, `[]` | Select notification channel and shared information. |
| `collectionTimeoutMs`, `businessCollectionTimeoutMs` | `60000`, `30000` | Collection time limits in milliseconds. |
| `webhookUrl`, `webhookSecret`, `webhookTimeoutMs` | `""`, `""`, `10000` | Webhook destination, signing secret and timeout. |
| `workerIntervalMs`, `leaseMs`, `maxAttempts` | `1000`, `30000`, `5` | Worker polling, lease period and retry budget. |
| `retentionDays`, `exportRetentionHours`, `maxExportsPerReport` | `30`, `24`, `5` | Report retention, export retention and export quota. |
| `envAllowlist`, `maxTotalBytes`, `maxAttachmentBytes`, `maxEvidenceBytes`, `maxEvidenceCount` | `[]`, `33554432`, `5242880`, `4194304`, `2000` | Allowlisted environment names and submission size/count quotas. |

Still untranslated: per-field limits for quotas, evidence, webhook retries and expiry. Read the [Chinese source section](feedback.md#configuration-fields).
