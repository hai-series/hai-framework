# @h-ai/scheduler 数据结构

<a id="scheduler-数据结构"></a>

[English](scheduler.en.md) · [日本語](scheduler.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/scheduler.md) · [功能说明](../function/scheduler.md)

调度节点用共享数据库保存任务定义和执行回执。例如日报的定时触发和手动触发共用一个任务占用标记，管理员仍可分别查询每次尝试的结果。

<a id="tables"></a>

<a id="database"></a>

## 数据库

应用先连接 [RelDB](reldb.md)，再调用 `scheduler.init()` 准备三张共享表。任务表的时间用日期时间展示，执行表和日志表的时间用 Unix 毫秒。

模块使用 3 张表。

| 表名 | 用途 |
| --- | --- |
| [`hai_scheduler_tasks`](#table-hai-scheduler-tasks) | 查任务多久运行一次、调用哪个处理器及其参数。 |
| [`hai_scheduler_executions`](#table-hai-scheduler-executions) | 每次触发一条账本记录，保存运行中的执行权和已完成的回执。 |
| [`hai_scheduler_logs`](#table-hai-scheduler-logs) | 每次尝试的查询日志，保存状态、耗时和结果。 |

<a id="table-hai-scheduler-tasks"></a>

### `hai_scheduler_tasks`

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
| `retry` | `JSON` | 是 | — | 任务的重试设置。 | `{"maxAttempts":2,"backoffMs":[45000]}` |
| `params` | `JSON` | 是 | — | 传给任务处理器的参数。 | `{"reportId":"report-42"}` |
| `handler` | `JSON` | 是 | — | 持久处理器描述。 | `NULL` |
| `created_at` | `TIMESTAMP` | 是 | — | 任务登记时间。 | `2026-11-17T00:00:00Z` |
| `updated_at` | `TIMESTAMP` | 是 | — | 任务最近修改时间。 | `2026-11-17T00:00:00Z` |

<a id="example-data"></a>

<a id="以后按什么计划运行什么任务"></a>

#### 示例 · 以后按什么计划运行什么任务

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
  "retry": { "maxAttempts": 2, "backoffMs": [45000] },
  "params": {
    "reportId": "report-42"
  }
}
```

daily-report 每天 UTC 零点执行，参数指向 report-42。idempotent:true 是处理器的业务声明，不会自动让外部系统只执行一次。

<a id="table-hai-scheduler-executions"></a>

### `hai_scheduler_executions`

**同一次触发只占一行，任务完成后仍保留。** `occurrence_id` 是这行的固定编号，`owner` 是当前领取者的执行凭据。成功、失败或确定跳过后释放 `active_task`。结果为 `unknown` 时保留占用，等待人工核对。日志清理只作用于日志表，执行账本仍可用来取回回执和补写日志。

<a id="occurrence-identity"></a>

#### 执行编号如何生成和沿用

**新触发时计算编号。** 例如 `daily-report` 在 `2026-11-17T00:00:00Z` 到期。节点用数据库时间算出分钟号 `29914560`，将 `["daily-report","scheduled","29914560"]` 序列化后计算 SHA-256。把得到的编号 `8012c99d…aaed96` 简记为 `X`。两个节点看到同一分钟就会算出同一个 `X`，数据库的唯一约束只允许插入一行。手动触发采用同一算法，触发类型改为 `manual`，触发键用 `idempotencyKey`，省略时生成随机 UUID。

**领取成功后，从账本记录取编号。** 下例租期为 30 秒，任务声明 `idempotent: true`，最多尝试两次，失败后等 45 秒。时间为 UTC。

| 时间 | 发生什么 | 同一行 `X` 如何变化 |
| --- | --- | --- |
| 00:00:00 | 节点 A 领取并开始执行 | 首次插入 `X`，设置 `owner` 为 A 的凭据。开始执行时将 `attempt_count` 加到 1 |
| 00:00:10 | A 续租 | 用领取时拿到的 `X` 找到原行，把 `leased_until` 延到 00:00:40 |
| 00:00:20 | 第一次尝试失败，A 保存记录后失联 | 在原行保存失败日志和下一次可重试的时间 00:01:05 |
| 00:01:00 | 节点 B 扫到 A 的租约已过期 | B 从过期记录直接读出 `X`，将原行的 `owner` 换成自己的凭据。虽然已跨分钟，恢复入口仍用原来的编号 |
| 00:01:05 | B 发起第二次尝试并成功 | 仍按 `X` 找到原行，将次数加到 2，写入 `success` 并释放任务占用 |

代码把领取返回的 `row.occurrenceId` 传给续租、重试和结束操作，用作 SQL 的 `WHERE occurrence_id = ?`。数据库同时检查当前 `owner`、状态和租约。接管后，即使 A 仍持有 `X`，它的旧凭据也无法更新这一行。外部服务可以用 `X` 对同一次触发的副作用做持久去重。

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `sequence` | `INTEGER` | 否 | — | 执行表的自增主键。 | `42` |
| `occurrence_id` | `TEXT` | 否 | — | 唯一触发 ID，用来找回同一次执行。 | `8012c99d724db341a30565a0f440a11198a4a43e6b28c9251ab191e8beaaed96` |
| `task_id` | `TEXT` | 否 | — | 对应任务 ID。 | `daily-report` |
| `active_task` | `TEXT` | 是 | — | 当前占用的任务 ID。同一任务只有一条记录可填这个值。 | `daily-report` |
| `status` | `TEXT` | 否 | — | 这次执行的状态。 | `running` |
| `owner` | `TEXT` | 是 | — | 领取这次执行的节点标识。 | `node-1:<claim-token>` |
| `snapshot` | `JSON` | 否 | — | 首次领取时的任务定义。持久定义还带内部行号，用于区分删除后重新注册的同名任务。 | `{"id":"daily-report"}` |
| `trigger_json` | `JSON` | 否 | — | 触发方式和来源。示例节选。 | `{"type":"scheduled","source":null,"minute":29914560}` |
| `log_json` | `JSON` | 是 | — | 终态回执；等待重试时保存 DB 时间的最早重试点。 | `{"retryAt":1794873665000}` |
| `logs_json` | `JSON` | 是 | — | 已完成尝试的日志。接管会保留这些记录，终态确认后可按它们补写日志表。 | `NULL` |
| `log_persistence` | `TEXT` | 否 | — | 日志是否已经持久化。 | `unconfirmed` |
| `leased_until` | `BIGINT` | 否 | — | 当前领取者的处理截止时间。 | `1794873630000` |
| `attempt_count` | `BIGINT` | 否 | — | 已经执行的尝试次数。 | `1` |
| `max_attempts` | `BIGINT` | 否 | — | 本次触发的尝试次数上限。 | `2` |
| `updated_at` | `BIGINT` | 否 | — | 执行状态最近修改时间。 | `1794873600000` |
| `created_at` | `BIGINT` | 否 | — | 触发记录的登记时间。 | `1794873600000` |
| `idempotent` | `BOOLEAN` | 否 | — | 触发时任务是否声明可以安全重复执行。 | `true` |

<a id="这一次触发是否正在执行"></a>

#### 示例 · 这一次触发是否正在执行

每次定时或手动触发都登记执行记录，用来防止同一任务被同时运行，并记录当前处理者。

```json
{
  "sequence": 42,
  "occurrence_id": "8012c99d724db341a30565a0f440a11198a4a43e6b28c9251ab191e8beaaed96",
  "task_id": "daily-report",
  "active_task": "daily-report",
  "status": "running",
  "owner": "node-1:<claim-token>",
  "leased_until": 1794873630000,
  "attempt_count": 1,
  "max_attempts": 2
}
```

8012c99d724db341a30565a0f440a11198a4a43e6b28c9251ab191e8beaaed96 正由 node-1 运行，active_task 占住 daily-report；leased_until 是本次处理资格截止时间，超时不等于外部动作肯定没发生。

<a id="table-hai-scheduler-logs"></a>

### `hai_scheduler_logs`

**从日志到执行账本是多对一，通过 `occurrence_id` 关联。** 上例的账本只有一条 `success`，其中 `attempt_count = 2`。日志写入后有两条同属 `X` 的记录，一条 `failed`、一条 `success`，各有自己的日志 `id`。执行中或日志待补写时，账本可能暂时没有日志。领取失败的观测日志可以没有对应的账本行，因此这里没有数据库外键。

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 日志主键。 | `10000000-0000-4000-8000-000000000042` |
| `occurrence_id` | `TEXT` | 是 | — | 日志关联的触发 ID。 | `8012c99d724db341a30565a0f440a11198a4a43e6b28c9251ab191e8beaaed96` |
| `task_id` | `TEXT` | 否 | — | 运行的任务 ID。 | `daily-report` |
| `task_name` | `TEXT` | 否 | — | 运行时的任务显示名。 | `Daily report` |
| `task_type` | `TEXT` | 否 | — | 任务类型。 | `hook` |
| `trigger_type` | `TEXT` | 否 | — | 定时或手动触发。 | `scheduled` |
| `trigger_source` | `TEXT` | 是 | — | 具体触发来源。 | `NULL` |
| `status` | `TEXT` | 否 | — | 日志记录的运行结果。 | `success` |
| `payload` | `JSON` | 否 | — | 详细的执行日志内容。示例节选。 | `{"status":"success"}` |
| `started_at` | `BIGINT` | 否 | — | 本次尝试开始时间。 | `1794873665000` |
| `finished_at` | `BIGINT` | 否 | — | 本次尝试完成时间。 | `1794873665125` |
| `duration` | `INTEGER` | 否 | — | 运行耗时，单位为毫秒。 | `125` |

定时触发和手动触发使用同一个任务占用标记，同一任务只能有一次活动执行。到期后如果不确定外部操作是否已完成，会保留占用标记，避免再次执行；确认结果后再处理。删除查询日志不会解除这个标记。

<a id="给人查看的任务执行历史"></a>

#### 示例 · 给人查看的任务执行历史

把一次执行的结果、耗时和诊断保存给管理页面查询；它不能代替执行占用记录。

```json
{
  "id": "10000000-0000-4000-8000-000000000042",
  "occurrence_id": "8012c99d724db341a30565a0f440a11198a4a43e6b28c9251ab191e8beaaed96",
  "task_id": "daily-report",
  "task_name": "Daily report",
  "status": "success",
  "duration": 125
}
```

这是 B 的第二次尝试，在 00:01:05 开始，125 毫秒后成功。日志有自己的 `id`，并用 `occurrence_id` 指向账本行 `X`。

模块不创建 Redis 键。服务实例利用本机计时器决定何时查找任务。能否领取、延长执行权或写入结果，以数据库里的记录与时间为准。

表结构和索引见调度器的[任务](../../../packages/scheduler/src/repositories/scheduler-repository-task.ts)、[执行](../../../packages/scheduler/src/repositories/scheduler-repository-execution.ts)与[日志](../../../packages/scheduler/src/repositories/scheduler-repository-log.ts)表定义。
