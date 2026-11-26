# @h-ai/feedback 数据结构

<a id="feedback-数据结构"></a>

[English](feedback.en.md) · [日本語](feedback.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/feedback.md) · [功能说明](../function/feedback.md)

用户提交问题后，Feedback 保存反馈单、证据及后续任务，管理员可以用同一个反馈 ID 查处理进度。附件由对象存储保管，用户尚未提交的草稿可暂存在浏览器。

<a id="database"></a>

## 数据库

服务端收到提交后，把反馈、关联证据和需要执行的任务一起写入共享 [reldb](reldb.md)。这几项通过一次数据库事务全部保存，或在失败时一起回滚。除列出的 SQL 默认值外，字段由模块写入，选填字段缺失时为 NULL。时间字段以 Unix 毫秒记录。

模块使用 6 张表。

| 表名 | 用途 |
| --- | --- |
| [`hai_feedback_reports`](#table-hai-feedback-reports) | 查问题、提交人和当前处理进度。 |
| [`hai_feedback_evidence`](#table-hai-feedback-evidence) | 按来源和顺序查采集到的事件。 |
| [`hai_feedback_attachments`](#table-hai-feedback-attachments) | 查附件对象位置、状态，校验文件是否完整。 |
| [`hai_feedback_history`](#table-hai-feedback-history) | 查谁在什么时候改变了反馈状态。 |
| [`hai_feedback_jobs`](#table-hai-feedback-jobs) | 记录待执行的补采、通知、Webhook、导出和到期清理，由后台进程执行和恢复。 |
| [`hai_feedback_quotas`](#table-hai-feedback-quotas) | 提交或导出前核对条数、字节和次数预算。 |

<a id="reports"></a>

<a id="table-hai-feedback-reports"></a>

### `hai_feedback_reports`

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
| `revision` | `INTEGER` | 否 | — | 证据修订号，用于关联同一份证据快照。 | `2` |
| `evidence_count` | `INTEGER` | 否 | — | 当前关联的证据条数。 | `1` |
| `evidence_bytes` | `BIGINT` | 否 | — | 当前证据占用的字节数。 | `0` |
| `collect_deadline` | `BIGINT` | 否 | — | 接受补充证据的截止时间。 | `1794873630000` |
| `expires_at` | `BIGINT` | 否 | — | 反馈的保留截止时间。 | `1797465600000` |
| `payload` | `JSON` | 否 | — | 问题描述、类别、联系方式、页面 URL、构建标识和提交号。状态、版本、用户和时间从各自的列读取。 | `{"category":"bug"}` |
| `deleting` | `INTEGER` | 否 | — | 进入删除流程时为 `1`，普通查询只读 `0` 的记录。 | `0` |

按 `(scope_id, created_at)`、`(scope_id, status, created_at)` 建索引，支持范围内查询。

提交键由范围、用户、应用和客户端提交 ID 计算。同一个键重试时，用请求摘要核对内容，原样重试返回原反馈，修改内容会返回冲突。

管理员改处理状态时，`version` 加一，用于拦住基于旧版本的并发修改。写入一批新证据或首次确认附件可读时，`revision` 加一。导出同时记录这两个值。

<a id="example-data"></a>


#### 示例 · 用户提交的问题主单

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
  "revision": 2,
  "evidence_count": 1,
  "created_at": 1794873600000,
  "updated_at": 1794873600000
}
```

这是受理后的字段节选。`team-1` 的 `user-42` 提交了 `feedback-42`，报告待处理。第一条环境证据已随受理事务入库，证据修订号为 2，其他材料仍可补传。

类别早已保存在报告的 `payload.category`，例如 `"bug"`。本人列表以 `scope_id`、`user_id` 等现有字段限定范围。本人和管理列表均排除已过期或正在删除的报告，详情、附件及导出也在数据库时钟到达 `expires_at` 时失效。

<a id="table-hai-feedback-evidence"></a>

### `hai_feedback_evidence`

索引支持按反馈、来源及顺序读取证据，也支持按应用、关联状态和到期时间回收。

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
| `revision` | `INTEGER` | 否 | — | 证据所在的修订版本。 | `3` |
| `bytes` | `INTEGER` | 否 | — | 证据占用的字节。 | `24` |
| `expires_at` | `BIGINT` | 否 | — | 到期后可清理。 | `1797465600000` |
| `payload` | `JSON` | 否 | — | 脱敏后的事件内容节选。 | `{"message":"Request failed"}` |

<a id="帮助还原问题发生过程的证据"></a>

#### 示例 · 帮助还原问题发生过程的证据

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
  "revision": 3,
  "bytes": 24
}
```

evidence-42 关联 feedback-42，是该来源的第1条、24字节；timestamp 以 Unix 毫秒记录发生时间。实际脱敏内容在 payload，本例未展开。

<a id="table-hai-feedback-attachments"></a>

### `hai_feedback_attachments`

按 `report_id` 查该反馈的附件，并通过 `object_key` 找对象存储中的字节。

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

<a id="附件放在哪里是否完整"></a>

#### 示例 · 附件放在哪里、是否完整

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

<a id="table-hai-feedback-history"></a>

### `hai_feedback_history`

`hai_feedback_reports` 保存当前状态。每次状态真正变化时，同一事务会在这张表追加一条记录，详情和诊断包因此能显示谁改过、从哪个状态改到哪个状态，以及何时修改。

详情按 `report_id` 一次读出该反馈的所有处理记录，只有查找和关联用的 ID 单独成列。`payload` 保存整条 `FeedbackHistory`，包括处理人、前后状态、时间和可选备注。其他表也使用 JSON，例如报告的诊断信息、证据内容、不同任务的输入和结果。像报告当前状态、任务执行时间这类用于查询和调度的字段，单独成列。若要经常跨反馈按处理人和时间查询，再考虑为这些字段建列和索引。

| 字段 | 类型 | 可空 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 否 | — | 处理记录主键。 | `history-42` |
| `report_id` | `TEXT` | 否 | — | 所属反馈 ID。 | `feedback-42` |
| `payload` | `JSON` | 否 | — | 处理人、处理时间、变更前后的状态和可选备注。 | `{"id":"history-42","feedbackId":"feedback-42","userId":"operator-7","from":"pending","to":"handled","timestamp":1794873660000}` |

<a id="谁把反馈状态改成了什么"></a>

#### 示例 · 谁把反馈状态改成了什么

```json
{
  "id": "history-42",
  "report_id": "feedback-42",
  "payload": {
    "id": "history-42",
    "feedbackId": "feedback-42",
    "userId": "operator-7",
    "from": "pending",
    "to": "handled",
    "timestamp": 1794873660000,
    "note": "已确认订单查询恢复"
  }
}
```

管理员 `operator-7` 把 `feedback-42` 从 `pending` 改为 `handled`。`userId` 是本次操作人，`timestamp` 是修改发生的时间。备注在写入前脱敏。

<a id="jobs"></a>

<a id="table-hai-feedback-jobs"></a>

### `hai_feedback_jobs`

这张表让反馈可以先返回编号，服务进程重启后仍能继续执行未完成的工作。受理时登记服务端补采和到期清理，按配置登记通知和 Webhook。导出任务在管理员申请时创建。截图和附件上传由浏览器发起。

**领取**是后台进程用一次条件更新取得任务的临时执行权，管理员无需操作。进程按 `(app_id, status, next_run_at)` 找到可执行的任务，写入执行令牌和租期。执行中续租。进程退出后，同一应用的其他进程可在租期过后接手。记录结果时会核验租期和令牌，旧进程无法覆盖新进程的结果。租期默认 30 秒，普通任务默认最多尝试 5 次。导出按 `(report_id, snapshot_revision, snapshot_version)` 找快照。[任务执行与恢复](../function/feedback.md#feedback-job-execution)

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
| `attempts` | `INTEGER` | 否 | — | 已领取的执行次数，包含领取后退出的尝试。仅等待材料或免打扰解除的轮次不计入。 | `0` |
| `next_run_at` | `BIGINT` | 否 | — | 最早可以再次领取的时间。 | `1794873600000` |
| `created_at` | `BIGINT` | 否 | — | 登记时间。 | `1794873600000` |
| `updated_at` | `BIGINT` | 否 | — | 最近更新时间。 | `1794873600000` |
| `last_error` | `TEXT` | 是 | — | 最近一次处理失败的错误信息。 | `NULL` |
| `payload` | `JSON` | 否 | — | 任务输入及进度。导出登记证据修订号和条数，另固定报告、附件元数据和处理历史。 | `{}` |
| `result` | `JSON` | 是 | — | 任务完成后记录的结果。 | `NULL` |

申请导出时固定 `snapshot_revision`、`snapshot_version` 和 `payload.evidenceCount`。执行时读取该修订及之前的证据，核对条数后生成 ZIP。采集状态为 `partial` 时仍可导出已有材料。如果反馈到期或固定的证据行缺失，导出会失败。

<a id="提交之后还要做的后台工作"></a>

#### 示例 · ZIP 导出任务等待执行

管理员申请导出后立即拿到任务 ID。下面列出这条任务尚未被领取时的调度字段。

```json
{
  "id": "job-42",
  "app_id": "orders",
  "report_id": "feedback-42",
  "scope_id": "team-1",
  "kind": "export",
  "status": "pending",
  "attempts": 0,
  "token": null,
  "lease_until": 0,
  "next_run_at": 1794873600000
}
```

`job-42` 属于 `feedback-42`，尚未执行。`next_run_at` 是最早可领取时间。若首个进程生成到一半就退出，之后取得租约的进程会重新生成 ZIP，任务 ID 保持相同。

<a id="table-hai-feedback-quotas"></a>

### `hai_feedback_quotas`

按 `(app_id, period)` 查询使用量。

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

<a id="已经占用了多少反馈容量"></a>

#### 示例 · 已经占用了多少反馈容量

在受理和上传前核对条数、字节与导出预算，防止一个用户或范围无限占用存储。

```json
{
  "id": "quota-42",
  "app_id": "orders",
  "scope_id": "team-1",
  "user_id": "",
  "period": 0,
  "report_count": 1,
  "reserved_bytes": 201326592,
  "report_bytes": 0,
  "export_limit": 0,
  "updated_at": 1794873600000
}
```

`period=0` 表示应用内范围累计计量，`user_id` 为空字符串。正值表示数据库 UTC 日的起点，并按用户分别计量。`period=-1` 的记录以反馈 ID 为主键。默认每份反馈预留 192 MiB，范围容量在到期反馈清理成功后释放。[配额设置](../configuration/feedback.md#configuration-fields)

<a id="storage"></a>

<a id="object-storage"></a>

## 对象存储

模块不创建 Redis 键。附件、导出和截图通过私有 [storage](storage.md) 管理，业务表记录附件校验和与状态。对象路径使用 `feedback/<范围 SHA-256 前 16 位>/<反馈 ID>/` 前缀，后接附件 ID、`business/<行 ID>-<校验和>` 或 `exports/<任务 ID>.zip`。ZIP 含 `manifest.json`、反馈、证据和处理历史，以及允许导出的附件。导出对象默认保留 24 小时。

范围段取服务端 `scopeId` 的 UTF-8 字节的 SHA-256，再截取前 16 个十六进制字符。比如 `team-1` 为 `7e2a2d5f9a3050f8`，`team-2` 为 `7774b28c6138ba1a`，`华东/客服` 为 `6d306a1b1891f5e8`。同一反馈的对象集中在一个前缀下，便于后台清理。文件读取仍检查报告权限。

例如，同一范围内反馈 `feedback-42` 的导出对象键形如 `feedback/7e2a2d5f9a3050f8/feedback-42/exports/<任务 ID>.zip`。

<a id="browser-storage"></a>

## 浏览器存储

浏览器在 IndexedDB 数据库 `hai-feedback-v1`（版本 1）的 `drafts` 中使用 2 类键。启用草稿持久化时，`<scope-key>` 由应用 ID 和宿主提供的身份隔离键组成，例如 `orders:team-1:user-42`。提交成功后清除草稿和检查点。

| 键 | 用途 | 有效期 |
| --- | --- | --- |
| `<scope-key>` | 待发送的反馈草稿 | 24 小时 |
| `<scope-key>:checkpoint` | 打开反馈页前暂存的证据 | 5 分钟 |

### `<scope-key>`

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

### `<scope-key>:checkpoint`

| 字段 | 类型 | 说明 | 示例 |
| --- | --- | --- | --- |
| `evidence` | `object[]` | 打开反馈前暂存的证据。 | `[]` |
| `expiresAt` | `number` | 检查点截止时间，Unix 毫秒。只恢复未过期的证据。 | `1794873900000` |

表结构和索引见 [Feedback 表定义](../../../packages/feedback/src/feedback-repository.ts)。

### 短暂保留尚未提交的现场

浏览器临时保存采集现场，避免用户打开反馈页或刷新时立即丢失；它不是服务器长期历史。

```json
{
  "evidence": [],
  "expiresAt": 1794873900000
}
```

evidence 为空表示此例尚无已缓存证据，expiresAt 是5分钟后的截止。到期不再恢复，提交成功后清理。
