# @h-ai/scheduler Configuration

[Chinese source](scheduler.md) · [Data structures](../data/scheduler.en.md) · [API reference](../function/scheduler.en.md)

Read `_scheduler.yml` and initialize the shared database before enabling persisted tasks. With persistence disabled, use a single development process.

## Configuration examples

```yaml schema=@h-ai/scheduler:SchedulerConfigSchema
tickInterval: 1000
leaseMs: 300000
nodeId: orders-scheduler-east
retentionDays: 30
```

### Keep a small execution history in development

Put this in `config/_scheduler.yml`. Keep at most 200 execution records and remove records older than seven days. Both limits apply independently. Register task names, Cron schedules, time zones and handlers in application code.

```yaml schema=@h-ai/scheduler:SchedulerConfigSchema
nodeId: orders-dev
tickInterval: 1000
maxLogs: 200
retentionDays: 7
```

### Use a shared scheduling database

Use the same database for all processes and a distinct `nodeId` for each, such as `orders-scheduler-west` on the other node. Check for work every second. The 60-second lease is ownership of an execution, not a task timeout, and cannot undo external effects.

```yaml schema=@h-ai/scheduler:SchedulerConfigSchema
nodeId: orders-scheduler-east
enableDb: true
tickInterval: 1000
leaseMs: 60000
retentionDays: 30
```

## Configuration reference


| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `enableDb` | `true` | Persist task schedules and execution state. |
| `tickInterval`, `leaseMs` | `1000`, `300000` | Scheduler tick and ownership lease in milliseconds. |
| `nodeId` | UUID | Node identifier. The process generates one when omitted. |
| `maxLogs`, `retentionDays` | Optional | Delete old logs by record cap or age. Neither limit is applied when omitted. |
