# feedback 数据结构

[English](feedback.en.md) · [日本語](feedback.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/feedback.md) · [功能说明](../function/feedback.md)

<a id="example-data"></a>

## 这些数据用来做什么

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

这是反馈主单的字段节选。`feedback-42` 属于 `team-1` 的 `user-42`，尚待处理且仍在收集材料；`evidence_count:0` 表示此时还没有关联证据，不代表后面步骤也没有。`created_at` 和 `updated_at` 是 Unix 毫秒。

类别早已保存在报告的 `payload.category`，例如 `"bug"`。本人列表以 `scope_id`、`user_id` 等现有字段限定范围，已过期或正在删除的报告不会进入分页。

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

evidence-42 关联 feedback-42，是该来源的第1条、24字节；timestamp 以 Unix 毫秒记录发生时间。实际脱敏内容在 payload，本例未展开。

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

模块使用 6 张表。

| 表名 | 用途 |
| --- | --- |
| [`hai_feedback_reports`](#table-hai-feedback-reports) | 查问题、提交人和当前处理进度。 |
| [`hai_feedback_evidence`](#table-hai-feedback-evidence) | 按来源和顺序查采集到的事件。 |
| [`hai_feedback_attachments`](#table-hai-feedback-attachments) | 查附件对象位置、状态，校验文件是否完整。 |
| [`hai_feedback_history`](#table-hai-feedback-history) | 查谁在什么时候改变了反馈状态。 |
| [`hai_feedback_jobs`](#table-hai-feedback-jobs) | 领取证据采集、通知或导出等后台任务。 |
| [`hai_feedback_quotas`](#table-hai-feedback-quotas) | 提交或导出前核对条数、字节和次数预算。 |

<a id="reports"></a>

<a id="table-hai-feedback-reports"></a>

#### `hai_feedback_reports`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 反馈主键。 | `feedback-42` |
| `scope_id` | `TEXT` | 否 | — | 反馈所属的业务范围。 | `team-1` |
| `user_id` | `TEXT` | 否 | — | 提交人 ID。 | `user-42` |
| `app_id` | `TEXT` | 否 | — | 提交反馈的应用 ID。 | `orders` |
| `number` | `TEXT` | 否 | — | 供用户或客服查找的编号。 | `FB-EXAMPLE-42` |
| `app_version` | `TEXT` | 是 | — | 用户提交时的应用版本。 | `1.4.2` |
| `summary` | `TEXT` | 否 | — | 简短的问题描述。 | `Example problem` |
| `submission_key` | `TEXT` | 否 | — | 唯一的提交标识，相同提交可安全重试。 | `<submission-key>` |
| `submission_hash` | `TEXT` | 否 | — | 提交内容摘要，用于核对重试是否为同一请求。 | `<request-digest>` |
| `status` | `TEXT` | 否 | — | 反馈处理状态。 | `pending` |
| `collection_status` | `TEXT` | 否 | — | 证据采集状态。 | `collecting` |
| `notification_status` | `TEXT` | 否 | — | 反馈通知的处理状态。 | `pending` |
| `created_at` | `BIGINT` | 否 | — | 提交时间。 | `1794873600000` |
| `updated_at` | `BIGINT` | 否 | — | 最近更新时间。 | `1794873600000` |
| `version` | `INTEGER` | 否 | — | 主单版本，用于检查并发修改。 | `1` |
| `revision` | `INTEGER` | 否 | — | 证据修订号，用于关联同一份证据快照。 | `1` |
| `evidence_count` | `INTEGER` | 否 | — | 当前关联的证据条数。 | `0` |
| `evidence_bytes` | `BIGINT` | 否 | — | 当前证据占用的字节数。 | `0` |
| `collect_deadline` | `BIGINT` | 否 | — | 接受补充证据的截止时间。 | `1794873630000` |
| `expires_at` | `BIGINT` | 否 | — | 反馈的保留截止时间。 | `1797465600000` |
| `payload` | `JSON` | 否 | — | 分类和问题详情等业务资料，示例只展示分类。 | `{"category":"bug"}` |
| `deleting` | `INTEGER` | 否 | — | 进入删除流程时为 `1`，普通查询只读 `0` 的记录。 | `0` |

按 `(scope_id, created_at)`、`(scope_id, status, created_at)` 建索引，支持范围内查询。

<a id="table-hai-feedback-evidence"></a>

#### `hai_feedback_evidence`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 证据主键。 | `evidence-42` |
| `report_id` | `TEXT` | 是 | — | 关联的反馈 ID。暂未关联时为空。 | `feedback-42` |
| `scope_id` | `TEXT` | 否 | — | 证据的业务范围。 | `team-1` |
| `user_id` | `TEXT` | 否 | — | 证据关联的用户 ID。 | `user-42` |
| `app_id` | `TEXT` | 否 | — | 证据来源应用的 ID。 | `orders` |
| `source` | `TEXT` | 否 | — | 证据来源。 | `browser` |
| `sequence` | `BIGINT` | 否 | — | 同一来源中事件的顺序。 | `1` |
| `kind` | `TEXT` | 否 | — | 采集事件的类别。 | `error` |
| `timestamp` | `BIGINT` | 否 | — | 事件发生时间。 | `1794873600000` |
| `request_id` | `TEXT` | 是 | — | 关联请求 ID。 | `req-42` |
| `error_id` | `TEXT` | 是 | — | 关联错误 ID。 | `err-42` |
| `revision` | `INTEGER` | 否 | — | 证据所在的修订版本。 | `1` |
| `bytes` | `INTEGER` | 否 | — | 证据占用的字节。 | `24` |
| `expires_at` | `BIGINT` | 否 | — | 到期后可清理。 | `1797465600000` |
| `payload` | `JSON` | 否 | — | 脱敏后的事件内容节选。 | `{"message":"Request failed"}` |

<a id="table-hai-feedback-attachments"></a>

#### `hai_feedback_attachments`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 附件主键。 | `attachment-42` |
| `client_id` | `TEXT` | 否 | — | 客户端为同一个附件提交的标识。 | `client-file-42` |
| `report_id` | `TEXT` | 否 | — | 所属反馈 ID。 | `feedback-42` |
| `scope_id` | `TEXT` | 否 | — | 附件所属的业务范围。 | `team-1` |
| `object_key` | `TEXT` | 否 | — | 模块生成的私有文件对象键。 | `feedback/<scope-digest>/feedback-42/attachment-42` |
| `status` | `TEXT` | 否 | — | 文件能否用于读取或导出。 | `available` |
| `size` | `BIGINT` | 否 | — | 文件大小，单位是字节。 | `5` |
| `checksum` | `TEXT` | 否 | — | 用于校验文件是否完整的摘要。 | `<checksum:redacted>` |
| `updated_at` | `BIGINT` | 否 | — | 最近更新时间。 | `1794873600000` |
| `payload` | `JSON` | 否 | — | 供用户查看的附件信息节选。 | `{"name":"error.txt"}` |

<a id="table-hai-feedback-history"></a>

#### `hai_feedback_history`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 处理记录主键。 | `history-42` |
| `report_id` | `TEXT` | 否 | — | 所属反馈 ID。 | `feedback-42` |
| `payload` | `JSON` | 否 | — | 处理人、处理时间和变更前后的状态。 | `{"id":"history-42","feedbackId":"feedback-42","userId":"user-42","from":"pending","to":"handled","timestamp":1794873660000}` |

<a id="jobs"></a>

<a id="table-hai-feedback-jobs"></a>

#### `hai_feedback_jobs`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 任务主键。 | `job-42` |
| `app_id` | `TEXT` | 否 | — | 所属应用 ID。 | `orders` |
| `snapshot_revision` | `INTEGER` | 是 | — | 任务对应的证据修订号。 | `1` |
| `snapshot_version` | `INTEGER` | 是 | — | 任务对应的反馈版本。 | `1` |
| `report_id` | `TEXT` | 否 | — | 关联反馈 ID。 | `feedback-42` |
| `scope_id` | `TEXT` | 否 | — | 任务所属的业务范围。 | `team-1` |
| `kind` | `TEXT` | 否 | — | 后台任务的类型。 | `export` |
| `status` | `TEXT` | 否 | — | 任务是否在等待、执行或已经结束。 | `pending` |
| `token` | `TEXT` | 是 | — | 当前领取者的令牌。 | `null` |
| `lease_until` | `BIGINT` | 否 | — | 当前领取的截止时间，`0` 表示尚未领取。 | `0` |
| `attempts` | `INTEGER` | 否 | — | 执行了多少次。 | `0` |
| `next_run_at` | `BIGINT` | 否 | — | 最早可以再次领取的时间。 | `1794873600000` |
| `created_at` | `BIGINT` | 否 | — | 登记时间。 | `1794873600000` |
| `updated_at` | `BIGINT` | 否 | — | 最近更新时间。 | `1794873600000` |
| `last_error` | `TEXT` | 是 | — | 最近一次处理失败的错误信息。 | `NULL` |
| `payload` | `JSON` | 否 | — | 任务执行所需的输入。 | `{}` |
| `result` | `JSON` | 是 | — | 任务完成后记录的结果。 | `NULL` |

<a id="table-hai-feedback-quotas"></a>

#### `hai_feedback_quotas`

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 配额记录主键。 | `quota-42` |
| `app_id` | `TEXT` | 否 | — | 计量的应用 ID。 | `orders` |
| `scope_id` | `TEXT` | 否 | — | 计量的业务范围。 | `team-1` |
| `user_id` | `TEXT` | 否 | — | 计量的用户 ID。 | `user-42` |
| `period` | `BIGINT` | 否 | — | 日配额周期，或者范围累计 `0`、单反馈 `-1`。 | `0` |
| `report_count` | `BIGINT` | 否 | — | 已计入的反馈条数。 | `1` |
| `reserved_bytes` | `BIGINT` | 否 | — | 已预留的字节数。 | `1024` |
| `report_bytes` | `BIGINT` | 否 | `0` | 单条反馈的字节预算。 | `0` |
| `export_limit` | `INTEGER` | 否 | `0` | 单条反馈的导出次数预算。 | `0` |
| `updated_at` | `BIGINT` | 否 | — | 配额最近更新时间。 | `1794873600000` |

证据按反馈、来源和顺序查询，也按应用、关联状态和过期时间回收。附件和历史建 `report_id` 索引。任务按 `(app_id, status, next_run_at)` 领取、按 `(report_id, snapshot_revision, snapshot_version)` 定位快照，计量记录按 `(app_id, period)` 索引。任务领取后默认可以处理 30 秒，最多尝试 5 次。

<a id="storage"></a>

### 缓存与对象键

模块不创建 Redis 键。附件、导出和截图通过私有 [storage](storage.md) 管理，业务表记录附件校验和与状态。对象路径使用 `feedback/<范围 SHA-256 前 16 位>/<反馈 ID>/` 前缀，后接附件 ID、`business/<行 ID>-<校验和>` 或 `exports/<任务 ID>.zip`。ZIP 含 `manifest.json`、反馈、证据和处理历史，以及允许导出的附件。导出对象默认保留 24 小时。

#### 浏览器草稿和采集检查点

浏览器在 IndexedDB 数据库 `hai-feedback-v1`（版本 1）的 `drafts` 中使用 2 类键。启用草稿持久化时，`<scope-key>` 由应用 ID 和宿主提供的身份隔离键组成，例如 `orders:team-1:user-42`。提交成功后清除草稿和检查点。

| 键 | 用途 | 有效期 |
| --- | --- | --- |
| `<scope-key>` | 待发送的反馈草稿 | 24 小时 |
| `<scope-key>:checkpoint` | 打开反馈页前暂存的证据 | 5 分钟 |

##### `<scope-key>`

| 字段 | 类型 | 说明 | 示例 |
| --- | --- | --- | --- |
| `submissionId` | `string` | 本次草稿的提交标识。 | `submission-42` |
| `anchorTime` | `number` | 开始反馈或出错时间，Unix 毫秒。 | `1794873600000` |
| `anchorKind` | `string` | 打开反馈时的来源，可为 feedback 或 error。 | `feedback` |
| `errorId` | `string` | 可选的错误 ID。 | `err-42` |
| `evidence` | `object[]` | 已经捕获的证据。 | `[]` |
| `attachments` | `object[]` | 待传附件和字节内容。 | `[]` |
| `missing` | `string[]` | 无法收集的材料及原因。 | `[]` |
| `expiresAt` | `number` | 草稿截止时间，Unix 毫秒。读取过期草稿时删除。 | `1794960000000` |
| `report` | `object` | 可选的服务器反馈记录。 | `{…}` |
| `submission` | `object` | 首次提交的入参，通信中断后可按原内容重试。 | `{…}` |
| `userInputFingerprint` | `string` | 用来辨认用户是否更改了本次重试的表单。 | `<fingerprint>` |

##### `<scope-key>:checkpoint`

| 字段 | 类型 | 说明 | 示例 |
| --- | --- | --- | --- |
| `evidence` | `object[]` | 打开反馈前暂存的证据。 | `[]` |
| `expiresAt` | `number` | 检查点截止时间，Unix 毫秒。只恢复未过期的证据。 | `1794873900000` |

表结构和索引见 [Feedback 表定义](../../../packages/feedback/src/feedback-repository.ts)。
