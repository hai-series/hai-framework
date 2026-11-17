# audit 数据结构

[English](audit.en.md) · [日本語](audit.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/audit.md) · [功能说明](../function/audit.md)

<a id="example-data"></a>

## 这些数据用来做什么

先看用途和例子，再按需查后面的字段与保存规则。例子中的编号和业务内容是虚构的，敏感值已隐藏。时间以 2026-11-17 00:00 UTC 为起点，具体单位在说明中标明。

数据库和文件示例只列说明所需字段，不能直接当成完整写入数据；未列出的字段不表示可省略。不同例子可以展示处理过程中的不同时间。

### 以后能查清谁做过什么

对应结构：`hai_audit_logs`。

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

### 哪些日志还不允许删除

对应结构：`hai_audit_policy`。

保存数据库执行的最短保留要求，避免普通清理任务提前删掉受保护事件。

```json
{
  "id": 1,
  "enabled": 1,
  "min_days": 90
}
```

id:1 是唯一策略，enabled:1 表示启用，min_days:90 要求至少保留90天；这不是每日新增一条的策略历史。

### 同一告警由谁负责处理

对应结构：`hai_audit_alert_claims`。

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

### 审计备份包含哪一段记录

对应结构：`backup JSONL`。

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

## 字段、存储与清理参考

<a id="tables"></a>

### 数据库

应用先调用 `reldb.init()` 连接 SQLite、PostgreSQL 或 MySQL，再用 `audit.init()` 在该数据库准备审计表。下表的可空字段在未提供时存为 NULL。除列出的默认值外，写入代码负责提供字段值。

| 表                       | 字段与约束                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hai_audit_logs`         | `id` 为事件主键，由模块生成时以 `audit_` 开头。必填 `action` 为操作、`resource` 为资源类别。`created_at` 为事件时间，模块写入时使用数据库时钟。可空 `user_id` 为操作者、`resource_id` 为资源标识、`details` 为 JSON 详情、`ip_address` 为来源 IP、`user_agent` 为客户端信息、`category` 为事件分类、`outcome` 为操作结果、`severity` 为严重度、`request_id` 为请求编号、`trace_id` 为链路编号、`scope_id` 为业务范围、`actor_snapshot` 为当时的操作者 JSON 快照。按 `created_at` 建索引 |
| `hai_audit_policy`       | `id` 是单行主键，初始化写 1。`enabled` 表示是否强制最短保留期，初始 0。`min_days` 表示最低保留天数，初始 90。修改保留期配置后，模块会更新这行策略                                                                                                                                                                                                                                                                                                                                       |
| `hai_audit_alert_claims` | `id` 为按告警规则、目标和时间段生成的唯一标识，用于防止多个实例重复领取同一告警。`rule_id` 为规则、`target_id` 为告警目标、`window_start` 为告警窗口起点、`status` 为领取处理状态。可空 `queue_id` 关联 Reach 队列，`error_code` 保存可用于排查的失败码                                                                                                                                                                                                                                 |

`hai_audit_logs` 的 `details` 和 `actor_snapshot` 是 JSON，`created_at` 是时间戳（MySQL 存为毫秒精度的 `DATETIME(3)`），其余是字符串。策略表的三个字段是整数。告警表的 `window_start` 是整数，其余为字符串。

<a id="policy"></a>

#### 保留策略与告警领取

数据库根据保留策略阻止修改受保护的审计记录，也阻止删除尚未到达最短保留期的记录。应用在一个现有事务中写审计事件时，该事件随事务一起提交或回滚。多个应用实例共用告警领取表，发送记录保存在 [reach](reach.md)。

<a id="backups"></a>

### 缓存与备份对象

模块不创建 Redis 键。启用备份后，在私有 [storage](storage.md) 下以 `hai-private/audit-backups/<id>.jsonl` 为对象键写入 JSON Lines。首行为格式、版本与截止信息，中间每行为一条事件，尾行为记录数与 SHA-256。备份对象的保留由对象存储策略管理。
