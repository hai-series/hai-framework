# @h-ai/scheduler Configuration

[Chinese source](scheduler.md) · [Data structures](../data/scheduler.en.md) · [API reference](../function/scheduler.en.md)

Read `_scheduler.yml` and initialize the shared database before enabling persisted tasks. With persistence disabled, use a single development process.

```yaml schema=@h-ai/scheduler:SchedulerConfigSchema
tickInterval: 1000
leaseMs: 300000
nodeId: orders-scheduler-east
retentionDays: 30
```

| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `enableDb` | `true` | Persist task schedules and execution state. |
| `tickInterval`, `leaseMs` | `1000`, `300000` | Scheduler tick and ownership lease in milliseconds. |
| `nodeId` | UUID | Node identifier. The process generates one when omitted. |
| `maxLogs`, `retentionDays` | Optional | Delete old logs by record cap or age. Neither limit is applied when omitted. |
