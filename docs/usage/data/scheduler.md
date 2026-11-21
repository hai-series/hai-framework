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
  "occurrence_id": "occurrence-42",
  "task_id": "daily-report",
  "active_task": "daily-report",
  "status": "running",
  "owner": "node-1",
  "leased_until": 1794873630000,
  "attempt_count": 1,
  "max_attempts": 1
}
```

occurrence-42 正由 node-1 运行，active_task 占住 daily-report；leased_until 是本次处理资格截止时间，超时不等于外部动作肯定没发生。

### 给人查看的任务执行历史

对应结构：`hai_scheduler_logs`。

把一次执行的结果、耗时和诊断保存给管理页面查询；它不能代替执行占用记录。

```json
{
  "id": "log-42",
  "occurrence_id": "occurrence-42",
  "task_id": "daily-report",
  "task_name": "Daily report",
  "status": "success",
  "duration": 125
}
```

此例表示 occurrence-42 后来成功，用时125毫秒；与上面 running 的例子是不同观察时刻。删除日志不会释放正在执行的任务。

## 字段、存储与清理参考

<a id="tables"></a>

### 数据库

调度器把任务设置、当前由谁执行以及执行日志保存在 [reldb](reldb.md)。除下表列出的默认值外，字段值由写入代码提供。选填字段缺失时存为 NULL。

| 表                         | 字段、默认值和约束                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hai_scheduler_tasks`      | `id` 为自增主键、`task_id` 为唯一业务任务 ID、`task_name` 为展示名、`description` 为可空说明、`cron` 为计划表达式、`timezone` 为显式 IANA 时区（缺省计划按 UTC 计算）。`enabled` 默认 true，`idempotent` 与 `delete_after_run` 默认 false。`retry`、`params`、`handler` 分别保存重试配置、入参和处理器描述的 JSON，`created_at`、`updated_at` 为登记与更新时间                                                                                                                              |
| `hai_scheduler_executions` | `sequence` 为自增主键，`occurrence_id` 是唯一的执行触发标识，`task_id` 对应任务，`active_task` 在某次执行占用任务时存任务标识，其他执行不能同时占用它，未占用时可为空。`status` 为执行状态，`owner` 为租约所有者，`snapshot` 为任务快照，`trigger_json` 为触发数据，`log_json` 为主日志，`logs_json` 为历史尝试日志，`log_persistence` 为日志持久化状态。`leased_until` 为租约截止，`attempt_count` 和 `max_attempts` 为次数及预算，`updated_at`、`created_at` 为执行状态更新时间和创建时间 |
| `hai_scheduler_logs`       | `id` 为日志主键，`occurrence_id` 为可空关联触发 ID，`task_id`、`task_name`、`task_type` 为任务标识、名称和类型；`trigger_type`、`trigger_source` 为触发方式与来源，`status` 为结果，`payload` 为 JSON 详情，`started_at`、`finished_at`、`duration` 为开始、完成和耗时                                                                                                                                                                                                                      |

定时触发和手动触发使用同一个任务占用标记，同一任务只能有一次活动执行。到期后如果不确定外部操作是否已完成，会保留占用标记，避免再次执行；确认结果后再处理。删除查询日志不会解除这个标记。

### 缓存

模块不创建 Redis 键。服务实例利用本机计时器决定何时查找任务。能否领取、延长执行权或写入结果，以数据库里的记录与时间为准。

表结构和索引见调度器的[任务](../../../packages/scheduler/src/repositories/scheduler-repository-task.ts)、[执行](../../../packages/scheduler/src/repositories/scheduler-repository-execution.ts)与[日志](../../../packages/scheduler/src/repositories/scheduler-repository-log.ts)表定义。
