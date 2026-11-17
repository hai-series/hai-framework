# @h-ai/audit Configuration

<!-- translation: partial -->

[Chinese source](audit.md) · [Data structures](../data/audit.en.md) · [API reference](../function/audit.en.md)

Read `_audit.yml` and initialize Audit after RelDB. Enable notification, backups and retention enforcement separately. Use only the actor and resource data needed for auditing.

```yaml schema=@h-ai/audit:AuditInitConfigSchema
capture:
  enabled: true
  includeReads: false
```

| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `capture.enabled`, `capture.includeReads` | `true`, `false` | Capture writes, failures and denials by default; read capture is opt-in. |
| `privacy.enabled`, `privacy.fields` | `true`, `[]` | Enable masking and add business fields. |
| `retention.enabled`, `retention.minDays` | `false`, `90` | Optional enforced minimum retention in days. |
| `alerts.enabled`, `maxNotificationsPerCheck`, `rules` | `false`, `100`, `[]` | Opt in to alerting and bound each scan. Rules identify actions, severity, matching outcomes and delivery targets. |
| `alerts.schedule.enabled`, `cron`, `timezone` | `false`, `* * * * *`, `UTC` | Schedule alert checks if enabled. |
| `backup.enabled`, `batchSize`, `maxRecordBytes` | `false`, `200`, `1048576` | Opt in to backup, set batch length and bound each record. |
| `backup.schedule.enabled`, `cron`, `timezone` | `false`, `0 2 * * *`, `UTC` | Schedule backups if enabled. |

Still untranslated: the per-field alert targets, backup schedule and privacy options. Read the [Chinese source section](audit.md#configuration-fields).
