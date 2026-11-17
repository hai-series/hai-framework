# feedback 数据结构

[English](feedback.en.md) · [日本語](feedback.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/feedback.md) · [功能说明](../function/feedback.md)

<a id="example-data"></a>

## 这些数据用来做什么

先看用途和例子，再按需查后面的字段与保存规则。例子中的编号和业务内容是虚构的，敏感值已隐藏。时间以 2026-11-17 00:00 UTC 为起点，具体单位在说明中标明。

数据库和文件示例只列说明所需字段，不能直接当成完整写入数据；未列出的字段不表示可省略。不同例子可以展示处理过程中的不同时间。

### 用户提交的问题主单

对应结构：`hai_feedback_reports`。

保存问题描述、提交人和当前处理状态，是查看证据、附件和处理历史时的入口。

```json
{
  "id": "feedback-42",
  "number": "FB-EXAMPLE-42",
  "scope_id": "team-1",
  "user_id": "user-42",
  "app_id": "orders",
  "summary": "Example problem",
  "status": "pending",
  "collection_status": "collecting",
  "version": 1,
  "revision": 1,
  "evidence_count": 0,
  "evidence_bytes": 0,
  "created_at": 1794873600000,
  "updated_at": 1794873600000
}
```

feedback-42 属于 team-1 的 user-42，尚待处理且仍在收集材料；evidence_count:0 表示此时还没有关联证据，不代表后面步骤也没有。

### 帮助还原问题发生过程的证据

对应结构：`hai_feedback_evidence`。

把日志、错误或页面等现场信息按来源和顺序关联到反馈，便于定位当时发生了什么。

```json
{
  "id": "evidence-42",
  "report_id": "feedback-42",
  "scope_id": "team-1",
  "user_id": "user-42",
  "app_id": "orders",
  "sequence": 1,
  "timestamp": 1794873600000,
  "revision": 1,
  "bytes": 24
}
```

evidence-42 关联 feedback-42，是该来源的第1条、24字节；timestamp 表示发生时间。实际脱敏内容在 payload，本例未展开。

### 附件放在哪里、是否完整

对应结构：`hai_feedback_attachments`。

数据库不存大文件正文，只登记私有对象存储中的位置、大小和校验值。

```json
{
  "id": "attachment-42",
  "client_id": "client-file-42",
  "report_id": "feedback-42",
  "scope_id": "team-1",
  "object_key": "feedback/<scope-digest>/feedback-42/attachment-42",
  "size": 5,
  "checksum": "<checksum:redacted>"
}
```

attachment-42 指向 feedback-42 的一个5字节对象；checksum 用来核对上传内容，示例已省略真实值，不能当作公开下载链接。

### 谁把反馈状态改成了什么

对应结构：`hai_feedback_history`。

每次处理反馈时留下变更记录，方便看到处理过程和备注。

```json
{
  "id": "history-42",
  "report_id": "feedback-42",
  "payload": {
    "id": "history-42",
    "feedbackId": "feedback-42",
    "userId": "user-42",
    "from": "pending",
    "to": "handled",
    "timestamp": 1794873660000
  }
}
```

示例中 user-42 把 feedback-42 从 pending 改为 handled；timestamp 是处理时间，不是最初提交时间。

### 提交之后还要做的后台工作

对应结构：`hai_feedback_jobs`。

截图、补充证据、通知或导出需要异步完成，任务记录让节点领取、失败重试，并避免旧处理者覆盖新结果。

```json
{
  "id": "job-42",
  "app_id": "orders",
  "report_id": "feedback-42",
  "scope_id": "team-1",
  "attempts": 0,
  "token": null,
  "lease_until": 0,
  "next_run_at": 1794873600000
}
```

job-42 属于 feedback-42，尚未尝试、没有领取 token；next_run_at 表示最早可开始时间，不保证届时一定完成。

### 已经占用了多少反馈容量

对应结构：`hai_feedback_quotas`。

在受理和上传前核对条数、字节与导出预算，防止一个用户或范围无限占用存储。

```json
{
  "id": "quota-42",
  "app_id": "orders",
  "scope_id": "team-1",
  "user_id": "user-42",
  "period": 0,
  "report_count": 1,
  "reserved_bytes": 1024,
  "report_bytes": 0,
  "export_limit": 0,
  "updated_at": 1794873600000
}
```

period:0 表示范围累计计量，当前计1条反馈、预留1024字节。它是配额账本，不是用户提交内容。

### 短暂保留尚未提交的现场

对应结构：`IndexedDB checkpoint`。

浏览器临时保存采集现场，避免用户打开反馈页或刷新时立即丢失；它不是服务器长期历史。

```json
{
  "evidence": [],
  "expiresAt": 1794873900000
}
```

evidence 为空表示此例尚无已缓存证据，expiresAt 是5分钟后的截止。到期不再恢复，提交成功后清理。

## 字段、存储与清理参考

### 数据库

服务端收到提交后，把反馈、关联证据和需要执行的任务一起写入共享 [reldb](reldb.md)。这几项通过一次数据库事务全部保存，或在失败时一起回滚。除列出的 SQL 默认值外，字段由模块写入，选填字段缺失时为 NULL。时间字段以 Unix 毫秒记录。

<a id="reports"></a>

#### `hai_feedback_reports`

| 字段                                                 | 含义与约束                                                                                         |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `id`、`number`                                       | 反馈主键、展示编号                                                                                 |
| `scope_id`、`user_id`、`app_id`                      | 由服务端确定的业务范围、用户 ID 和应用 ID                                                          |
| `app_version`、`summary`                             | 可空应用版本、反馈摘要（缺失时写空字符串）                                                         |
| `submission_key`、`submission_hash`                  | 用于认出同一次提交的唯一键，以及用来核对重试内容是否一致的请求摘要                                 |
| `status`、`collection_status`、`notification_status` | 管理处理、证据采集和通知的各自状态；受理时前两项为 `pending`、`collecting`，通知状态取决于通知配置 |
| `created_at`、`updated_at`                           | 创建与更新时间                                                                                     |
| `version`、`revision`                                | 反馈版本、采集和快照使用的修订号，均从 1 开始                                                      |
| `evidence_count`、`evidence_bytes`                   | 已关联证据条数、字节数，登记时为 0                                                                 |
| `collect_deadline`、`expires_at`                     | 采集截止、反馈保留截止。反馈默认保留 30 天                                                         |
| `payload`                                            | 结构化 JSON，保存问题描述、当时所在页面等提交详情                                                  |
| `deleting`                                           | 删除流程标记，登记时为 0                                                                           |

按 `(scope_id, created_at)`、`(scope_id, status, created_at)` 建索引，支持范围内查询。

<a id="jobs"></a>

#### 证据、附件、记录和异步任务

| 表                         | 字段、默认值和约束                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hai_feedback_evidence`    | `id` 是证据主键；`report_id` 指向反馈主键，未关联反馈的临时证据可为空。`scope_id`、`user_id`、`app_id` 标识隔离范围；`source`、`sequence`、`kind` 保存来源、顺序和类别；`timestamp` 是事件时间；可空 `request_id`、`error_id` 用于关联；`revision`、`bytes`、`expires_at` 为修订号、大小、到期；`payload` 保存脱敏内容                                                                                               |
| `hai_feedback_attachments` | `id` 是附件主键；`client_id` 为客户端附件标识，`report_id`、`scope_id` 为所属反馈和范围。`object_key` 由服务端生成，`status` 表示可用等状态，`size`、`checksum` 用于核对字节与校验摘要，`updated_at` 为更新时间，`payload` 保存展示信息                                                                                                                                                                              |
| `hai_feedback_history`     | `id` 是处理历史主键，`report_id` 为关联反馈，`payload` 保存处理人、时间及状态变更等 JSON                                                                                                                                                                                                                                                                                                                             |
| `hai_feedback_jobs`        | `id` 是任务主键，`app_id`、`report_id`、`scope_id` 为归属。可空 `snapshot_revision`、`snapshot_version` 标记对应快照。`kind`、`status` 是类型与状态，可空的 `token` 指任务领取者的令牌，`lease_until` 是该领取者可以继续处理的截止时间，`attempts` 为尝试次数，`next_run_at` 为可再次领取时间。`created_at`、`updated_at` 为登记与更新时间，可空 `last_error` 是最后错误，`payload` 为入参，可空 `result` 为完成结果 |
| `hai_feedback_quotas`      | `id` 是唯一计量范围记录，`app_id`、`scope_id`、`user_id` 为计量归属，`period` 为日配额周期、范围计量（0）或单反馈计量（-1），`report_count` 为条数，`reserved_bytes` 为预留字节，`report_bytes` 为单反馈字节预算（SQL 默认 0），`export_limit` 为单反馈导出次数预算（SQL 默认 0），`updated_at` 是更新时间                                                                                                           |

证据按反馈、来源和顺序查询，也按应用、关联状态和过期时间回收。附件和历史建 `report_id` 索引。任务按 `(app_id, status, next_run_at)` 领取、按 `(report_id, snapshot_revision, snapshot_version)` 定位快照，计量记录按 `(app_id, period)` 索引。任务领取后默认可以处理 30 秒，最多尝试 5 次。

<a id="storage"></a>

### 缓存与对象键

模块不创建 Redis 键。附件、导出和截图通过私有 [storage](storage.md) 管理，业务表记录附件校验和与状态。对象路径使用 `feedback/<范围 SHA-256 前 16 位>/<反馈 ID>/` 前缀，后接附件 ID、`business/<行 ID>-<校验和>` 或 `exports/<任务 ID>.zip`。ZIP 含 `manifest.json`、反馈、证据和处理历史，以及允许导出的附件。导出对象默认保留 24 小时。

浏览器在 IndexedDB 的 `hai-feedback-v1` 数据库（版本 1）中新建 `drafts` 对象存储，每个应用和身份组合可以保存一份待发送的草稿。键 `<隔离键>:checkpoint` 另存现场信息 `evidence` 和到期时间 `expiresAt`，有效期 5 分钟。重新打开反馈页面时只读取尚未过期的草稿。成功提交后，客户端删除草稿及相应记录。

表结构和索引见 [Feedback 表定义](../../../packages/feedback/src/feedback-repository.ts)。
