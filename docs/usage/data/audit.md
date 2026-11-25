# @h-ai/audit 数据结构

<a id="audit-数据结构"></a>

[English](audit.en.md) · [日本語](audit.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/audit.md) · [功能说明](../function/audit.md)

例如用户读取订单后，Audit 保存操作人、目标资源、结果与发生时间。管理员可以按规则查找事件、导出指定时间范围的记录，或用保留策略限制删除。

<a id="tables"></a>

<a id="database"></a>

## 数据库

先用 `reldb.init()` 连接数据库，再调用 `audit.init()` 准备审计表。

模块使用 3 张表。

| 表名 | 用途 |
| --- | --- |
| [`hai_audit_logs`](#table-hai-audit-logs) | 查谁在什么时候对什么资源做了什么。 |
| [`hai_audit_policy`](#table-hai-audit-policy) | 数据库据此阻止过早删除审计记录。 |
| [`hai_audit_alert_claims`](#table-hai-audit-alert-claims) | 同一规则、目标和时间段只由一个实例领取。 |

<a id="table-hai-audit-logs"></a>

### `hai_audit_logs`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 事件主键，模块生成的值以 `audit_` 开头。 | `audit_example-42` |
| `user_id` | `TEXT` | 是 | — | 操作者的用户 ID。 | `user-42` |
| `action` | `TEXT` | 否 | — | 执行的操作。 | `read` |
| `resource` | `TEXT` | 否 | — | 资源类型。 | `orders` |
| `resource_id` | `TEXT` | 是 | — | 资源的具体 ID。 | `order-42` |
| `details` | `JSON` | 是 | — | 排查问题时可查的业务详情。 | `{"fields":["status"]}` |
| `ip_address` | `TEXT` | 是 | — | 请求来源地址。 | `192.0.2.10` |
| `user_agent` | `TEXT` | 是 | — | 请求的客户端标识。 | `Example Browser` |
| `category` | `TEXT` | 否 | — | 事件类别，用于筛选。 | `business` |
| `outcome` | `TEXT` | 否 | — | 操作是否成功、失败或被拒绝。 | `success` |
| `severity` | `TEXT` | 否 | — | 事件严重程度。 | `info` |
| `request_id` | `TEXT` | 是 | — | 关联请求 ID。 | `req-42` |
| `trace_id` | `TEXT` | 是 | — | 关联链路 ID。 | `trace-42` |
| `scope_id` | `TEXT` | 是 | — | 事件所属的业务范围。 | `team-1` |
| `actor_snapshot` | `JSON` | 是 | — | 事件发生时的操作者资料快照。 | `{"id":"user-42"}` |
| `created_at` | `TIMESTAMP` | 是 | — | 事件发生的时间，模块写入时以数据库时钟为准。 | `2026-11-17T00:00:00.000Z` |

按 `created_at` 建索引，用于时间范围查询和清理。

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
  "created_at": "2026-11-17T00:00:00.000Z"
}
```

user-42 读取了 order-42；details 只记录查看 status 字段。created_at 是数据库确认的事件时间，以 UTC 日期展示。

筛选空间和事件后，`audit.countByOutcome` 返回成功、失败和拒绝的数量。例如 `{ total: 4, success: 2, failure: 1, denied: 1 }`。聚合读取现有审计行，排序和分页不影响统计。

<a id="table-hai-audit-policy"></a>

### `hai_audit_policy`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `INTEGER` | 否 | — | 固定主键，初始化插入一行。 | `1` |
| `enabled` | `INTEGER` | 否 | — | `1` 启用最短保留期，`0` 停用。初始写入 `0`。 | `1` |
| `min_days` | `INTEGER` | 否 | — | 最少保留天数，初始写入 `90`。 | `90` |

<a id="哪些日志还不允许删除"></a>

#### 示例 · 哪些日志还不允许删除

保存数据库执行的最短保留要求，避免普通清理任务提前删掉受保护事件。

```json
{
  "id": 1,
  "enabled": 1,
  "min_days": 90
}
```

id:1 是唯一策略，enabled:1 表示启用，min_days:90 要求至少保留90天；这不是每日新增一条的策略历史。

<a id="table-hai-audit-alert-claims"></a>

### `hai_audit_alert_claims`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `VARCHAR(64)` | 否 | — | 按规则、目标和时间窗口计算的摘要主键。 | `<claim-digest>` |
| `rule_id` | `VARCHAR(64)` | 否 | — | 告警规则 ID。 | `failed-login` |
| `target_id` | `VARCHAR(64)` | 否 | — | 告警通知的目标 ID。 | `business` |
| `window_start` | `BIGINT` | 否 | — | 告警窗口开始时间，Unix 毫秒。 | `1794873600000` |
| `status` | `VARCHAR(16)` | 否 | — | 领取后的处理状态。 | `claimed` |
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
  "window_start": 1794873600000
}
```

此例对应 failed-login 规则和 security 目标；window_start 为 Unix 毫秒。仅有领取记录不证明人员已收到通知。

<a id="policy"></a>

### 保留策略与告警领取

数据库根据保留策略阻止修改受保护的审计记录，也阻止删除尚未到达最短保留期的记录。应用在一个现有事务中写审计事件时，该事件随事务一起提交或回滚。多个应用实例共用告警领取表，发送记录保存在 [reach](reach.md)。

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

这是头行示例，不是完整可恢复备份；cutoff 是本次截止时间，from:null 表示未指定起点，实际还必须验证后续记录与尾行。
