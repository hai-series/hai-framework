# @h-ai/scheduler Configuration

[Chinese source](scheduler.md) · [Data structures](../data/scheduler.en.md) · [API reference](../function/scheduler.en.md)

## Configuration entry

Load `config/_scheduler.yml` and connect RelDB before initializing the scheduler. Scheduler requires a database. All scheduler processes in a deployment use the same database.

## Configuration reference


| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `enableDb` | `true` | Store task schedules and execution state in the database. The only accepted value is `true`. |
| `tickInterval` | `1000` | Interval between scans for work. Integer from 100 to 2147483647 milliseconds. |
| `leaseMs` | `300000` (5 minutes) | How long the current node retains ownership after each claim or renewal. Integer from 1000 to 86400000 milliseconds. |
| `nodeId` | UUID | Node identifier. The process generates one when omitted. |
| `maxLogs`, `retentionDays` | Optional | Delete old logs by record cap or age. Neither limit is applied when omitted. |

<a id="execution-lease"></a>

### How the execution lease works

The shared database records who owns each execution and when that ownership expires. With `leaseMs: 60000`, a node receives a 60-second lease when it claims an execution. While processing it, the node renews about every 20 seconds. Each successful renewal grants another 60 seconds from the time of renewal.

If the node stops renewing, a later scan can handle the execution once its last lease expires. Another node can claim work that has yet to start. For work that has started, takeover requires declared idempotency and remaining attempts. Otherwise, the execution becomes `unknown` and needs review of the external outcome. The former owner loses the ability to commit a final result.

For example, if a node claims a task at 12:00:00, renews at 12:00:20, then goes offline, an eligible execution can be taken over from 12:01:20 onward. A shorter lease helps detect unavailable nodes sooner and makes temporary database or process pauses more likely to cause lease loss. A task can run past one lease period as long as renewal succeeds. API and JavaScript handlers use their own `timeout` for each attempt.

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

Use the same database for all processes and a distinct `nodeId` for each, such as `orders-scheduler-west` on the other node. Scan for work every second and coordinate execution ownership with the 60-second lease described above.

```yaml schema=@h-ai/scheduler:SchedulerConfigSchema
nodeId: orders-scheduler-east
enableDb: true
tickInterval: 1000
leaseMs: 60000
retentionDays: 30
```
