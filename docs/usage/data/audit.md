# @h-ai/audit 数据结构

<a id="audit-数据结构"></a>

[English](audit.en.md) · [日本語](audit.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/audit.md) · [功能说明](../function/audit.md)

例如用户读取订单后，Audit 保存操作人、目标资源、结果与发生时间。管理员可以按规则查找事件、导出指定时间范围的记录，或用保留策略限制删除。

<a id="tables"></a>

<a id="database"></a>

## 数据库

先用 `reldb.init()` 连接数据库，再调用 `audit.init()` 准备审计表。

模块使用 2 张表。

| 表名 | 用途 |
| --- | --- |
| [`hai_audit_logs`](#table-hai-audit-logs) | 查谁在什么时候对什么资源做了什么。 |
| [`hai_audit_alert_claims`](#table-hai-audit-alert-claims) | 同一规则、目标和时间段只由一个实例领取。 |

<a id="table-hai-audit-logs"></a>

### `hai_audit_logs`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT`，MySQL `VARCHAR(255)` | 否 | — | 事件主键，模块生成的值以 `audit_` 开头。 | `audit_example-42` |
| `user_id` | `TEXT`，MySQL `VARCHAR(256)` | 是 | — | 操作者的用户 ID。 | `user-42` |
| `action` | `TEXT`，MySQL `VARCHAR(256)` | 否 | — | 执行的操作。 | `read` |
| `resource` | `TEXT`，MySQL `VARCHAR(256)` | 否 | — | 资源类型。 | `orders` |
| `resource_id` | `TEXT`，MySQL `VARCHAR(256)` | 是 | — | 资源的具体 ID。 | `order-42` |
| `details` | SQLite `TEXT`、PostgreSQL `JSONB`、MySQL `JSON` | 是 | — | 排查问题时可查的业务详情。 | `{"fields":["status"]}` |
| `ip_address` | `TEXT`，MySQL `VARCHAR(256)` | 是 | — | 请求来源地址。 | `192.0.2.10` |
| `user_agent` | `TEXT`，MySQL `VARCHAR(4096)` | 是 | — | 请求的客户端标识。 | `Example Browser` |
| `category` | `TEXT`，MySQL `VARCHAR(255)` | 否 | — | 系统或业务事件，用于筛选。 | `business` |
| `outcome` | `TEXT`，MySQL `VARCHAR(255)` | 否 | — | 操作是否成功、失败或被拒绝。 | `success` |
| `severity` | `TEXT`，MySQL `VARCHAR(255)` | 否 | — | 事件严重程度。 | `info` |
| `request_id` | `TEXT`，MySQL `VARCHAR(256)` | 是 | — | 关联请求 ID。 | `req-42` |
| `trace_id` | `TEXT`，MySQL `VARCHAR(256)` | 是 | — | 关联链路 ID。 | `trace-42` |
| `scope_id` | `TEXT`，MySQL `VARCHAR(256)` | 是 | — | 事件所属的业务范围。 | `team-1` |
| `actor_snapshot` | SQLite `TEXT`、PostgreSQL `JSONB`、MySQL `JSON` | 是 | — | 事件发生时的操作者资料快照。 | `{"id":"user-42"}` |
| `created_at` | SQLite `INTEGER`、PostgreSQL/MySQL `BIGINT` | 否 | — | 由数据库时钟确定的事件时间，单位为 Unix 毫秒。 | `1794873600000` |

按 `created_at` 建索引，用于时间范围查询和清理。MySQL 日志表使用 `utf8mb4_0900_bin` 排序规则，字符串筛选区分大小写、重音和尾随空格。

<a id="example-data"></a>

<a id="以后能查清谁做过什么"></a>

#### 示例 · 以后能查清谁做过什么

业务在关键操作后记录操作者、资源和结果，供追查、审计与合规保留。

```json
{
  "id": "audit_example-42",
  "action": "read",
  "resource": "orders",
  "resource_id": "order-42",
  "user_id": "user-42",
  "details": {
    "fields": [
      "status"
    ]
  },
  "created_at": 1794873600000
}
```

`user-42` 读取了 `order-42` 的 `status`。这里节选的是存储字段。API 将 `created_at` 转成 `createdAt: Date`，本例调用 `toISOString()` 得到 `2026-11-17T00:00:00.000Z`。

筛选空间和事件后，`audit.countByOutcome` 返回成功、失败和拒绝的数量。例如 `{ total: 4, success: 2, failure: 1, denied: 1 }`。聚合读取现有审计行，排序和分页不影响统计。

<a id="table-hai-audit-alert-claims"></a>

### `hai_audit_alert_claims`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `VARCHAR(64)` | 否 | — | 按规则、目标和时间窗口计算的摘要主键。 | `<claim-digest>` |
| `rule_id` | `VARCHAR(64)` | 否 | — | 告警规则 ID。 | `failed-login` |
| `target_id` | `VARCHAR(64)` | 否 | — | 告警通知的目标 ID。 | `business` |
| `window_start` | `BIGINT` | 否 | — | 告警窗口开始时间，Unix 毫秒。 | `1794873600000` |
| `status` | `VARCHAR(16)` | 否 | — | `claimed` 已领取，`sending` 已获准发送，`submitted` 被通道接受，`queued` 已入队，`unknown` 的外部结果待核验。 | `claimed` |
| `queue_id` | `VARCHAR(64)` | 是 | — | 已排队时关联 Reach 的队列 ID。 | `notification-42` |
| `error_code` | `VARCHAR(128)` | 是 | — | 失败时用于排查的错误码。 | `NULL` |

<a id="同一告警由谁负责处理"></a>

#### 示例 · 同一告警由谁负责处理

同一规则、目标和时间段出现告警时，先登记领取，减少多个节点重复通知。

```json
{
  "id": "<claim-digest>",
  "rule_id": "failed-login",
  "target_id": "security",
  "window_start": 1794873600000,
  "status": "claimed"
}
```

此例对应 failed-login 规则和 security 目标；window_start 为 Unix 毫秒。仅有领取记录不证明人员已收到通知。

<a id="policy"></a>

### 保留策略与告警领取

开启[保留保护](../configuration/audit.md#audit-retention)时，Audit 根据本次配置安装数据库触发器，防止修改、删除或覆盖仍在保护期内的记录。共享数据库的实例使用相同配置。应用在现有事务中写入审计事件时，该事件随事务一起提交或回滚。清理和相对时间统计按数据库执行时钟计算截止时间，每天按 24 小时计算。

多个应用实例共用告警领取表。告警检查按窗口开始时间清理超过 72 小时的 `submitted` 和 `queued` 行。72 小时等于支持的最大 24 小时窗口的三倍，使用短窗口的实例也遵守这个期限。`claimed`、`sending` 和 `unknown` 继续保留供核验。送达记录由 Reach 管理。参见 [Reach 数据结构](reach.md)。

<a id="backups"></a>

<a id="object-storage"></a>

## 对象存储

模块不创建 Redis 键。启用备份后，在私有 [storage](storage.md) 下以 `hai-private/audit-backups/<id>.jsonl` 为对象键写入 JSON Lines。首行为格式、版本与截止信息，中间每行为一条事件，尾行为记录数与 SHA-256。备份对象的保留由对象存储策略管理。

### 审计备份包含哪一段记录

备份文件第一行说明格式和导出范围，之后逐行写事件，最后写条数和校验和。

```json
{
  "type": "header",
  "format": "hai-audit",
  "version": 1,
  "id": "backup-42",
  "createdAt": "2026-11-17T00:00:00.000Z",
  "cutoff": "2026-11-17T00:00:00.000Z",
  "from": null,
  "requestHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}
```

这是头行节选。`cutoff` 是上界，`from: null` 表示未指定下界。`audit.backup.verify(key)` 验证后续记录、尾行条数与校验和。
