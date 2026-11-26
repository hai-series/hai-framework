# @h-ai/feedback 数据结构

[English](feedback.en.md) · [日本語](feedback.ja.md) · [功能说明](../function/feedback.md) · [配置](../configuration/feedback.md)

用户提交「订单详情点不开」并随首帖发一段录屏时，反馈状态写入首帖表，视频字节写入附件表。处理人员在同一份反馈中要求补充并附上操作步骤，新的消息写入消息表，步骤文件关联该消息。作者和处理人员按权限读取这同一组记录。

<a id="database"></a>

## 数据库

Feedback 初始化时在宿主已连接的关系库中创建以下三张表和对应索引。时间使用 Unix 毫秒。字段表中的「无」表示 DDL 没有声明默认值，应用写入实际值或允许的空值。

| 表 | 每行代表什么 | 何时写入 |
| --- | --- | --- |
| [`hai_feedback_reports`](#table-hai-feedback-reports) | 一份反馈的首帖和当前状态 | 用户提交时创建，回复或状态更新时更新活动时间。 |
| [`hai_feedback_messages`](#table-hai-feedback-messages) | 一条回复或一条补充请求 | 作者或处理人员发送消息。 |
| [`hai_feedback_attachments`](#table-hai-feedback-attachments) | 一份材料或手动附件的元数据及字节 | 随首帖或消息一起保存。 |

<a id="table-hai-feedback-reports"></a>

### `hai_feedback_reports`

| 字段 | 类型 | 可空 | 数据库默认值 | 用途 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `VARCHAR(36)` | 否 | 无 | 调用方为本次提交生成的 UUID，也是主键。 | `a5f59b38-ef92-47bb-b0a0-b0f9c07f7f93` |
| `app_id` | `VARCHAR(128)` | 否 | 无 | Feedback 实例的 `appId`。 | `orders` |
| `scope_id` | `VARCHAR(128)` | 否 | 无 | 可信上下文中的业务范围。 | `sales-cn` |
| `user_id` | `VARCHAR(128)` | 否 | 无 | 提交人 ID，用于查询自己的反馈。 | `user-42` |
| `body` | `TEXT` | 否 | 无 | 首帖正文，仅发材料时可为空字符串。 | `订单详情点不开` |
| `status` | `VARCHAR(24)` | 否 | 无 | 当前状态，初次写入 `pending`。 | `awaiting_user` |
| `created_at` | `BIGINT` | 否 | 无 | 首帖提交时间。 | `1795500000000` |
| `updated_at` | `BIGINT` | 否 | 无 | 首次等于创建时间，之后记录消息发送或状态变更时间。 | `1795500300000` |

`hai_feedback_reports_activity` 索引按 `(app_id, scope_id, updated_at, id)` 支持处理列表。`hai_feedback_reports_author` 按 `(app_id, scope_id, user_id, updated_at, id)` 支持作者列表。两者按活动时间倒序，相同时间按 ID 倒序。

| `status` | 含义 | 进入条件 |
| --- | --- | --- |
| `pending` | 待处理 | 创建首帖、作者回复待补充反馈、或处理人员主动标记待处理。 |
| `awaiting_user` | 待用户补充 | 处理人员发送补充请求。 |
| `handled` | 已处理 | 处理人员标记已处理。 |

<a id="table-hai-feedback-messages"></a>

### `hai_feedback_messages`

| 字段 | 类型 | 可空 | 数据库默认值 | 用途 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `VARCHAR(36)` | 否 | 无 | 调用方为本次发送生成的 `messageId`，也是主键。 | `deed074b-1ef4-4a47-9adf-731349dd1c56` |
| `report_id` | `VARCHAR(36)` | 否 | 无 | 指向首帖的外键。 | `a5f59b38-ef92-47bb-b0a0-b0f9c07f7f93` |
| `author_id` | `VARCHAR(128)` | 否 | 无 | 当前发消息者的用户 ID。 | `operator-7` |
| `author_role` | `VARCHAR(16)` | 否 | 无 | `author` 表示作者回复，`staff` 表示处理人员发送。 | `staff` |
| `kind` | `VARCHAR(16)` | 否 | 无 | `reply` 为回复，`request_info` 为补充请求。 | `request_info` |
| `body` | `TEXT` | 否 | 无 | 消息正文，仅发附件时可为空字符串。 | `请按附件步骤操作，再发一张错误截图` |
| `created_at` | `BIGINT` | 否 | 无 | 消息发送时间。 | `1795500300000` |

`hai_feedback_messages_report` 索引按 `(report_id, created_at, id)` 支持读取对话，最近的消息在前。处理人员改状态更新的是首帖，同一反馈中的交流存为消息行。

<a id="table-hai-feedback-attachments"></a>

### `hai_feedback_attachments`

| 字段 | 类型 | 可空 | 数据库默认值 | 用途 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `VARCHAR(36)` | 否 | 无 | 服务端生成的附件 UUID，也是主键。 | `0ed0398d-475d-47bc-b769-d1eddcd820c4` |
| `report_id` | `VARCHAR(36)` | 否 | 无 | 指向附件所属的反馈。 | `a5f59b38-ef92-47bb-b0a0-b0f9c07f7f93` |
| `message_id` | `VARCHAR(36)` | 是 | 无 | 随首帖保存时写 `NULL`，随消息保存时指向该消息。 | `deed074b-1ef4-4a47-9adf-731349dd1c56` |
| `kind` | `VARCHAR(24)` | 否 | 无 | 文件或首帖现场的类别。 | `file` |
| `name` | `VARCHAR(255)` | 否 | 无 | 展示和下载使用的文件名。 | `steps.txt` |
| `content_type` | `VARCHAR(128)` | 否 | 无 | 校验后返回的媒体类型。 | `application/octet-stream` |
| `size` | `INTEGER` | 否 | 无 | 原始字节数。 | `5` |
| `content` | SQLite `BLOB`、PostgreSQL `BYTEA`、MySQL `MEDIUMBLOB` | 否 | 无 | 文件二进制内容。 | UTF-8 文本 `Steps` 的 5 个字节 |

`hai_feedback_attachments_message` 索引按 `(report_id, message_id, id)` 支持查询首帖或对话中的附件元数据。读取文件前按应用、范围和权限核对反馈，再按 `report_id` 和附件 ID 读取。手动附件中无法识别为可安全预览的类型会以 `application/octet-stream` 提供下载。

<a id="attachment-examples"></a>

#### 材料分类和记录示例

| `kind` | 来源 | 文件名示例 | 归属 |
| --- | --- | --- | --- |
| `file` | 用户手动选择的图片或文件 | `steps.txt` | 首帖或消息 |
| `screenshot` | 自动截取或手动重截的页面 | `screenshot.png` | 首帖 |
| `browser_logs` | 打开首帖弹窗时冻结的浏览器日志 | `browser-logs.json` | 首帖 |
| `server_logs` | 提交时按发送人及范围取得的 Core 日志 | `server-logs.json` | 首帖 |
| `replay` | 脱敏操作回放事件 | `operation-replay.json` | 首帖 |
| `recording` | 用户授权录制的短视频 | `recording-1795500000000.webm` | 首帖 |

例如上面的反馈记录中，首帖录屏的 `report_id` 指向该反馈，`message_id` 为 `NULL`。处理人员的 `request_info` 消息附带 `steps.txt`，因此步骤文件的 `message_id` 是 `deed074b-1ef4-4a47-9adf-731349dd1c56`。提交补充请求后，`hai_feedback_reports.status` 为 `awaiting_user`。作者接着新增一条带错误截图的 `reply`，该图片的 `kind` 为 `file` 并指向回复消息，状态回到 `pending`。

<a id="storage-and-reads"></a>

## 写入和读取

提交首帖时，首帖及附件在同一次关系库事务中保存。发送消息时，消息、附件、反馈状态和最近活动时间在同一事务中保存。调用方应保留一次操作的 UUID，以便未收到响应时重试并取回已保存的记录。该重试返回原记录，编辑后的正文或附件需要使用新操作 ID 另行发送。

列表返回反馈摘要。`get` 返回一份反馈和首帖附件元数据，`listMessages` 返回消息及各自的附件元数据。元数据含 `id`、`kind`、`name`、`contentType` 和 `size`。只有调用 `getAttachment` 时才读取单个二进制内容并编码为 Base64。以下是前述步骤文件的成功结果中的 `data`，`U3RlcHM=` 解码后为 `Steps`。

```json
{
  "name": "steps.txt",
  "contentType": "application/octet-stream",
  "dataBase64": "U3RlcHM="
}
```

<a id="retention"></a>

## 运行时数据与保留

| 数据 | 保存位置 | 可用范围 |
| --- | --- | --- |
| 打开反馈前的浏览器日志、操作事件 | 当前登录页面内存 | 在页面会话内缓冲，取最近 5 分钟内的可用数据。刷新页面或退出后重新开始。 |
| 可关联的服务端请求日志 | 当前服务进程内存 | 整个实例缓冲最多 5000 条、4 MiB。附加到首帖时，再按同一用户和业务范围取最近 5 分钟、最多 1000 条和 512 KiB。进程重启会清空缓冲。 |
| 已发送的首帖、对话、文件 | 上述三张关系库表 | 提交成功后可用，存储期限由宿主决定。 |

附件随内容存入关系库，应用不需要配置对象存储。首帖和消息都无模块内置自动过期。宿主按自己的保留策略管理数据库记录。外键启用时，删除反馈会级联删除消息和附件，删除单条消息会级联清理该消息的附件。

[反馈运维](../operations/feedback.md)
