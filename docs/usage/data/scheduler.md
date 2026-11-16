# scheduler 数据结构

[数据结构索引](README.md) · [模块配置](../configuration/scheduler.md) · [功能说明](../function/scheduler.md)

## 数据库

模块通过 [reldb](reldb.md) 持久化任务定义、执行领取和日志。下表未列默认值时，由执行或写入时提供。可选字段未提供时为 NULL。

| 表                         | 字段、默认值和约束                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hai_scheduler_tasks`      | `id` 为自增主键、`task_id` 为唯一业务任务 ID、`task_name` 为展示名、`description` 为可空说明、`cron` 为计划表达式、`timezone` 为显式 IANA 时区（缺省计划按 UTC 计算）。`enabled` 默认 true，`idempotent` 与 `delete_after_run` 默认 false。`retry`、`params`、`handler` 分别保存重试配置、入参和处理器描述的 JSON，`created_at`、`updated_at` 为登记与更新时间                                                                        |
| `hai_scheduler_executions` | `sequence` 为自增主键，`occurrence_id` 是唯一的执行触发标识，`task_id` 对应任务，`active_task` 是可空唯一活动槽。`status` 为执行状态，`owner` 为租约所有者，`snapshot` 为任务快照，`trigger_json` 为触发数据，`log_json` 为主日志，`logs_json` 为历史尝试日志，`log_persistence` 为日志持久化状态。`leased_until` 为租约截止，`attempt_count` 和 `max_attempts` 为次数及预算，`updated_at`、`created_at` 为执行状态更新时间和创建时间 |
| `hai_scheduler_logs`       | `id` 为日志主键，`occurrence_id` 为可空关联触发 ID，`task_id`、`task_name`、`task_type` 为任务标识、名称和类型；`trigger_type`、`trigger_source` 为触发方式与来源，`status` 为结果，`payload` 为 JSON 详情，`started_at`、`finished_at`、`duration` 为开始、完成和耗时                                                                                                                                                                |

cron 与手动触发共享一个活动槽。过期但无法安全重试的结果保留槽位，等待核对和裁定。执行记录与可选查询日志的职责不同，日志清理不应代替裁定。

## 缓存

模块不创建 Redis 键。领取、续租和回写使用数据库状态与数据库时间，节点计时器仅触发扫描。
