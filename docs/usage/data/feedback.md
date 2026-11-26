# @h-ai/feedback 数据结构

[English](feedback.en.md) · [日本語](feedback.ja.md) · [功能说明](../function/feedback.md) · [配置](../configuration/feedback.md)

一份反馈下有一条由作者和处理人员共享的对话。提交反馈或发送消息时，对应材料和状态变更通过一次事务保存。时间使用 Unix 毫秒。表中必填字段均由应用写入。

<a id="database"></a>

## 数据库

| 表 | 用途 |
| --- | --- |
| [`hai_feedback_reports`](#table-hai-feedback-reports) | 保存首帖和当前处理状态。 |
| [`hai_feedback_messages`](#table-hai-feedback-messages) | 保存回复和补充请求。 |
| [`hai_feedback_attachments`](#table-hai-feedback-attachments) | 保存首帖或某条消息的附件内容。 |

<a id="table-hai-feedback-reports"></a>

### `hai_feedback_reports`

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| `id` | `VARCHAR(36)` | 否 | 调用方生成的提交 UUID，也是反馈主键。 |
| `app_id` | `VARCHAR(128)` | 否 | 发起反馈的应用 ID。 |
| `scope_id` | `VARCHAR(128)` | 否 | 从可信上下文取得的业务范围。 |
| `user_id` | `VARCHAR(128)` | 否 | 提交人的用户 ID。 |
| `body` | `TEXT` | 否 | 首帖正文。纯附件提交时为空字符串。 |
| `status` | `VARCHAR(24)` | 否 | `pending` 待处理、`awaiting_user` 待用户补充、`handled` 已处理。 |
| `created_at` | `BIGINT` | 否 | 提交时间。 |
| `updated_at` | `BIGINT` | 否 | 最近一次状态变更或消息的时间。 |

主键为 `id`。列表按应用、范围、最近活动时间分页，作者列表再按用户 ID 查找。

<a id="table-hai-feedback-messages"></a>

### `hai_feedback_messages`

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| `id` | `VARCHAR(36)` | 否 | 调用方生成的消息 UUID，也是消息主键。 |
| `report_id` | `VARCHAR(36)` | 否 | 所属反馈 ID。 |
| `author_id` | `VARCHAR(128)` | 否 | 发消息者的用户 ID。 |
| `author_role` | `VARCHAR(16)` | 否 | `author` 表示反馈作者，`staff` 表示处理人员。 |
| `kind` | `VARCHAR(16)` | 否 | `reply` 是普通回复，`request_info` 是处理人员要求补充信息。 |
| `body` | `TEXT` | 否 | 消息正文。纯附件消息时为空字符串。 |
| `created_at` | `BIGINT` | 否 | 发送时间。 |

`report_id` 关联反馈，按 `(report_id, created_at, id)` 分页。发送消息和按规则改变反馈状态在同一事务内完成。

<a id="table-hai-feedback-attachments"></a>

### `hai_feedback_attachments`

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| `id` | `VARCHAR(36)` | 否 | 服务端生成的附件 UUID。 |
| `report_id` | `VARCHAR(36)` | 否 | 所属反馈 ID。 |
| `message_id` | `VARCHAR(36)` | 是 | 所属消息 ID。为空表示附件随首帖提交。 |
| `kind` | `VARCHAR(24)` | 否 | `file` 为手动附件。首帖现场使用 `screenshot`、`browser_logs`、`server_logs`、`replay` 或 `recording`。 |
| `name` | `VARCHAR(255)` | 否 | 显示用文件名。 |
| `content_type` | `VARCHAR(128)` | 否 | 响应中的媒体类型。 |
| `size` | `INTEGER` | 否 | 原始文件字节数。 |
| `content` | `BLOB` | 否 | 数据库内的原始二进制内容。 |

按 `(report_id, message_id, id)` 查元数据。读取文件时先鉴权反馈，再读取对应附件。

例如反馈 `a5f59b38-ef92-47bb-b0a0-b0f9c07f7f93` 的首帖带有 `screen.png`，该附件的 `message_id` 为空。人员随后发出一条补充请求并附 `steps.txt`，该文件的 `message_id` 指向补充请求。两份文件通过同一个反馈权限检查。

## 附件与保留

附件二进制与元数据同库存储。列表只选取元数据，读取单个文件时才向客户端编码 Base64。SQLite 使用 BLOB，PostgreSQL 使用 BYTEA，MySQL 使用 MEDIUMBLOB。应用按自己的数据保留策略管理关系库的记录。反馈以一套新表结构初始化，适用于新数据库。
