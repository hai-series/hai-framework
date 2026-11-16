# feedback 数据结构

[数据结构索引](README.md) · [模块配置](../configuration/feedback.md) · [功能说明](../function/feedback.md)

## 数据库

服务端收到提交后，把反馈、关联证据和需要执行的任务一起写入共享 [reldb](reldb.md)。这几项通过一次数据库事务全部保存，或在失败时一起回滚。除列出的 SQL 默认值外，字段由模块写入，选填字段缺失时为 NULL。时间字段以 Unix 毫秒记录。

### `hai_feedback_reports`

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

### 证据、附件、记录和异步任务

| 表                         | 字段、默认值和约束                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hai_feedback_evidence`    | `id` 是证据主键；`report_id` 指向反馈主键，未关联反馈的临时证据可为空。`scope_id`、`user_id`、`app_id` 标识隔离范围；`source`、`sequence`、`kind` 保存来源、顺序和类别；`timestamp` 是事件时间；可空 `request_id`、`error_id` 用于关联；`revision`、`bytes`、`expires_at` 为修订号、大小、到期；`payload` 保存脱敏内容                                                                                               |
| `hai_feedback_attachments` | `id` 是附件主键；`client_id` 为客户端附件标识，`report_id`、`scope_id` 为所属反馈和范围。`object_key` 由服务端生成，`status` 表示可用等状态，`size`、`checksum` 用于核对字节与校验摘要，`updated_at` 为更新时间，`payload` 保存展示信息                                                                                                                                                                              |
| `hai_feedback_history`     | `id` 是处理历史主键，`report_id` 为关联反馈，`payload` 保存处理人、时间及状态变更等 JSON                                                                                                                                                                                                                                                                                                                             |
| `hai_feedback_jobs`        | `id` 是任务主键，`app_id`、`report_id`、`scope_id` 为归属。可空 `snapshot_revision`、`snapshot_version` 标记对应快照。`kind`、`status` 是类型与状态，可空的 `token` 指任务领取者的令牌，`lease_until` 是该领取者可以继续处理的截止时间，`attempts` 为尝试次数，`next_run_at` 为可再次领取时间。`created_at`、`updated_at` 为登记与更新时间，可空 `last_error` 是最后错误，`payload` 为入参，可空 `result` 为完成结果 |
| `hai_feedback_quotas`      | `id` 是唯一计量范围记录，`app_id`、`scope_id`、`user_id` 为计量归属，`period` 为日配额周期、范围计量（0）或单反馈计量（-1），`report_count` 为条数，`reserved_bytes` 为预留字节，`report_bytes` 为单反馈字节预算（SQL 默认 0），`export_limit` 为单反馈导出次数预算（SQL 默认 0），`updated_at` 是更新时间                                                                                                           |

证据按反馈、来源和顺序查询，也按应用、关联状态和过期时间回收。附件和历史建 `report_id` 索引。任务按 `(app_id, status, next_run_at)` 领取、按 `(report_id, snapshot_revision, snapshot_version)` 定位快照，计量记录按 `(app_id, period)` 索引。任务领取后默认可以处理 30 秒，最多尝试 5 次。

## 缓存与对象键

模块不创建 Redis 键。附件、导出和截图通过私有 [storage](storage.md) 管理，业务表记录附件校验和与状态。对象路径使用 `feedback/<范围 SHA-256 前 16 位>/<反馈 ID>/` 前缀，后接附件 ID、`business/<行 ID>-<校验和>` 或 `exports/<任务 ID>.zip`。ZIP 含 `manifest.json`、反馈、证据和处理历史，以及允许导出的附件。导出对象默认保留 24 小时。

浏览器在 IndexedDB 的 `hai-feedback-v1` 数据库（版本 1）中新建 `drafts` 对象存储，每个应用和身份组合可以保存一份待发送的草稿。键 `<隔离键>:checkpoint` 另存现场信息 `evidence` 和到期时间 `expiresAt`，有效期 5 分钟。重新打开反馈页面时只读取尚未过期的草稿。成功提交后，客户端删除草稿及相应记录。
