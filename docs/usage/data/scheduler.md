# scheduler 数据结构

[English](scheduler.en.md) · [日本語](scheduler.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/scheduler.md) · [功能说明](../function/scheduler.md)

<a id="example-data"></a>

## 这些数据用来做什么

### 以后按什么计划运行什么任务

对应结构：`hai_scheduler_tasks`。

保存任务计划和服务端处理方式，服务重启后仍能找回该运行什么。

```json
{
  "id": 1,
  "task_id": "daily-report",
  "task_name": "Daily report",
  "cron": "0 0 * * *",
  "timezone": "UTC",
  "enabled": true,
  "idempotent": true,
  "delete_after_run": false,
  "params": {
    "reportId": "report-42"
  }
}
```

daily-report 每天 UTC 零点执行，参数指向 report-42。idempotent:true 是处理器的业务声明，不会自动让外部系统只执行一次。

### 这一次触发是否正在执行

对应结构：`hai_scheduler_executions`。

每次定时或手动触发都登记执行记录，用来防止同一任务被同时运行，并记录当前处理者。

```json
{
  "sequence": 42,
  "occurrence_id": "1aac2af840fe011ae7e489827dd6ea6de833cf24cd5c572ef913becb44294f22",
  "task_id": "daily-report",
  "active_task": "daily-report",
  "status": "running",
  "owner": "node-1",
  "leased_until": 1794873630000,
  "attempt_count": 1,
  "max_attempts": 1
}
```

1aac2af840fe011ae7e489827dd6ea6de833cf24cd5c572ef913becb44294f22 正由 node-1 运行，active_task 占住 daily-report；leased_until 是本次处理资格截止时间，超时不等于外部动作肯定没发生。

### 给人查看的任务执行历史

对应结构：`hai_scheduler_logs`。

把一次执行的结果、耗时和诊断保存给管理页面查询；它不能代替执行占用记录。

```json
{
  "id": "log-42",
  "occurrence_id": "1aac2af840fe011ae7e489827dd6ea6de833cf24cd5c572ef913becb44294f22",
  "task_id": "daily-report",
  "task_name": "Daily report",
  "status": "success",
  "duration": 125
}
```

此例表示 1aac2af840fe011ae7e489827dd6ea6de833cf24cd5c572ef913becb44294f22 后来成功，用时125毫秒；与上面 running 的例子是不同观察时刻。删除日志不会释放正在执行的任务。

## 字段、存储与清理参考

<a id="tables"></a>

### 数据库

启用数据库持久化后，调度器通过 [RelDB](reldb.md) 保存计划、执行占用和结果。任务表的时间用日期时间展示，执行表和日志表的时间用 Unix 毫秒。

模块使用 3 张表。

| 表名 | 用途 |
| --- | --- |
| [`hai_scheduler_tasks`](#table-hai-scheduler-tasks) | 查任务多久运行一次、调用哪个处理器及其参数。 |
| [`hai_scheduler_executions`](#table-hai-scheduler-executions) | 协调各节点对同一次触发的领取、运行和核对。 |
| [`hai_scheduler_logs`](#table-hai-scheduler-logs) | 查每次运行结果、耗时和处理详情。 |

<a id="table-hai-scheduler-tasks"></a>

#### `hai_scheduler_tasks`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `INTEGER` | 否 | — | 任务表的自增主键。 | `1` |
| `task_id` | `TEXT` | 否 | — | 应用用来查找任务的唯一 ID。 | `daily-report` |
| `task_name` | `TEXT` | 否 | — | 任务显示名。 | `Daily report` |
| `description` | `TEXT` | 是 | — | 任务用途说明。 | `NULL` |
| `cron` | `TEXT` | 否 | — | Cron 计划表达式。 | `0 0 * * *` |
| `timezone` | `TEXT` | 是 | — | IANA 时区，省略后按 UTC 计算。 | `UTC` |
| `enabled` | `BOOLEAN` | 否 | `true` | 是否启用定时触发。 | `true` |
| `idempotent` | `BOOLEAN` | 否 | `false` | 应用声明任务是否可以安全重复执行。 | `true` |
| `delete_after_run` | `BOOLEAN` | 否 | `false` | 运行后是否移除任务。 | `false` |
| `retry` | `JSON` | 是 | — | 任务的重试设置。 | `NULL` |
| `params` | `JSON` | 是 | — | 传给任务处理器的参数。 | `{"reportId":"report-42"}` |
| `handler` | `JSON` | 是 | — | 持久处理器描述。 | `NULL` |
| `created_at` | `TIMESTAMP` | 是 | — | 任务登记时间。 | `2026-11-17T00:00:00Z` |
| `updated_at` | `TIMESTAMP` | 是 | — | 任务最近修改时间。 | `2026-11-17T00:00:00Z` |

<a id="table-hai-scheduler-executions"></a>

#### `hai_scheduler_executions`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `sequence` | `INTEGER` | 否 | — | 执行表的自增主键。 | `42` |
| `occurrence_id` | `TEXT` | 否 | — | 唯一触发 ID，用来找回同一次执行。 | `1aac2af840fe011ae7e489827dd6ea6de833cf24cd5c572ef913becb44294f22` |
| `task_id` | `TEXT` | 否 | — | 对应任务 ID。 | `daily-report` |
| `active_task` | `TEXT` | 是 | — | 当前占用的任务 ID。同一任务只有一条记录可填这个值。 | `daily-report` |
| `status` | `TEXT` | 否 | — | 这次执行的状态。 | `running` |
| `owner` | `TEXT` | 是 | — | 领取这次执行的节点标识。 | `node-1` |
| `snapshot` | `JSON` | 否 | — | 触发时的任务定义快照。示例节选。 | `{"id":"daily-report"}` |
| `trigger_json` | `JSON` | 否 | — | 触发方式和来源。示例节选。 | `{"type":"scheduled"}` |
| `log_json` | `JSON` | 是 | — | 当前执行的主要日志。 | `NULL` |
| `logs_json` | `JSON` | 是 | — | 各次尝试的历史日志。 | `NULL` |
| `log_persistence` | `TEXT` | 否 | — | 日志是否已经持久化。 | `pending` |
| `leased_until` | `BIGINT` | 否 | — | 当前领取者的处理截止时间。 | `1794873630000` |
| `attempt_count` | `BIGINT` | 否 | — | 已经执行的尝试次数。 | `1` |
| `max_attempts` | `BIGINT` | 否 | — | 本次触发的尝试次数上限。 | `1` |
| `updated_at` | `BIGINT` | 否 | — | 执行状态最近修改时间。 | `1794873600000` |
| `created_at` | `BIGINT` | 否 | — | 触发记录的登记时间。 | `1794873600000` |
| `idempotent` | `BOOLEAN` | 否 | — | 触发时任务是否声明可以安全重复执行。 | `true` |

<a id="table-hai-scheduler-logs"></a>

#### `hai_scheduler_logs`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 日志主键。 | `log-42` |
| `occurrence_id` | `TEXT` | 是 | — | 日志关联的触发 ID。 | `1aac2af840fe011ae7e489827dd6ea6de833cf24cd5c572ef913becb44294f22` |
| `task_id` | `TEXT` | 否 | — | 运行的任务 ID。 | `daily-report` |
| `task_name` | `TEXT` | 否 | — | 运行时的任务显示名。 | `Daily report` |
| `task_type` | `TEXT` | 否 | — | 任务类型。 | `hook` |
| `trigger_type` | `TEXT` | 否 | — | 定时或手动触发。 | `scheduled` |
| `trigger_source` | `TEXT` | 是 | — | 具体触发来源。 | `NULL` |
| `status` | `TEXT` | 否 | — | 日志记录的运行结果。 | `success` |
| `payload` | `JSON` | 否 | — | 详细的执行日志内容。示例节选。 | `{"status":"success"}` |
| `started_at` | `BIGINT` | 否 | — | 本次运行开始时间。 | `1794873600000` |
| `finished_at` | `BIGINT` | 否 | — | 本次运行完成时间。 | `1794873600125` |
| `duration` | `INTEGER` | 否 | — | 运行耗时，单位为毫秒。 | `125` |

定时触发和手动触发使用同一个任务占用标记，同一任务只能有一次活动执行。到期后如果不确定外部操作是否已完成，会保留占用标记，避免再次执行；确认结果后再处理。删除查询日志不会解除这个标记。

### 缓存

模块不创建 Redis 键。服务实例利用本机计时器决定何时查找任务。能否领取、延长执行权或写入结果，以数据库里的记录与时间为准。

表结构和索引见调度器的[任务](../../../packages/scheduler/src/repositories/scheduler-repository-task.ts)、[执行](../../../packages/scheduler/src/repositories/scheduler-repository-execution.ts)与[日志](../../../packages/scheduler/src/repositories/scheduler-repository-log.ts)表定义。
