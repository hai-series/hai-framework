# @h-ai/feedback 功能说明

[English](feedback.en.md) · [日本語](feedback.ja.md)

在服务端用 `feedback` 接收、查询和处理用户报告。在浏览器中用 Feedback 客户端收集用户允许提供的日志、截图等排查材料。导出的 ZIP 可以用命令行工具离线查看。

[模块 README](../../../packages/feedback/README.md) · [配置清单](../configuration/feedback.md) · [数据结构](../data/feedback.md) · [反馈运维](../operations/feedback.md)

<a id="quick-start"></a>

## 最小接入示例

应用启动时先初始化 Core、RelDB 和私有 Storage，再初始化 Feedback。通知方式是 Reach 时，还须先初始化 Reach。生产部署为所有实例配置同一数据库和非公开对象存储，凭据从服务端私有配置读取。

示例在应用启动时初始化模块。提交函数接收可信服务端生成的 `context` 和客户端为本次提交生成的 `submissionId`。

```ts
import type { FeedbackContext } from '@h-ai/feedback'
import { feedback } from '@h-ai/feedback'

// 为 orders 初始化反馈服务。本地开发通过日志查看受理状态。
const initialized = await feedback.init({
  appId: 'orders',
  appVersion: '1.0.0',
  notificationMode: 'console',
  adminUrl: 'https://app.example.test/admin/feedback',
})
if (!initialized.success)
  throw new Error(initialized.error.message)

export async function submitFeedback(context: FeedbackContext, submissionId: string) {
  // 受理成功返回含编号的报告。遇到失败时，调用方读取 error。
  return feedback.submit({ appId: 'orders', submissionId }, context)
}
```

应用退出时先检查 `await feedback.close()`，再关闭 reach/storage/reldb。重复提交使用原 `submissionId`；不能在超时后换新标识绕过幂等。

<a id="api-reference"></a>

## 功能说明

下面的场景代码从本页最小接入中导入模块；除连接/关闭场景外，均在初始化成功后、关闭前运行。`value` 先检查 `HaiResult.success`，失败保留原错误，成功返回 data；只用于读取结果。各场景使用独立测试数据，不能把相邻片段当成无需清理的生产脚本。

```ts
import type { HaiResult } from '@h-ai/core'

function value<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(result.error.message, { cause: result.error })
  return result.data
}
```

<a id="service"></a>

### 准备服务与接入采集任务：`feedback`

服务端负责受理、异步采集、通知和保留期限；应用提供共享数据库、存储和可信上下文。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `feedback.init` | 准备反馈服务；先按快速开始连接数据库并准备依赖 | 先按快速开始连接数据库并准备依赖；`config` 必填，`options?` 可选 | `Promise<HaiResult<void>>` | `await feedback.init(config)` |
| `feedback.close` | 停止本实例的反馈后台工作并清理模块状态；共享依赖由应用关闭 | 共享依赖由应用关闭；无 | `Promise<HaiResult<void>>` | `await feedback.close()` |
| `feedback.runJobs` | 执行当前可领取的后台任务 | 无参数 | `processed 处理数` | `await feedback.runJobs()` |

#### 场景：准备服务与接入采集任务

```ts
const jobs = value(await feedback.runJobs()) // this round's processed count
```

init 输入来自最小接入，成功无数据；runJobs 无参数，输出本轮处理结果；close 等待并停止本实例后台任务。业务采集与 Webhook 的真实输入、重试和取消见下文。

- 有界采集前后端日志、请求、错误、操作、版本与白名单环境信息；默认错误前后各最多 100 条。
- 数据库事务受理、提交/证据幂等、附件校验、独立的处理/采集/通知状态、持久化任务与租约恢复。
- 通知由 `notificationMode` 独立选择：`disabled` 不创建通知任务；`console` 默认仅输出定位与采集状态元数据（consoleContent: metadata）；显式 consoleContent: summary 才加入通用脱敏摘要，不依赖 Reach 或邮箱；`reach` 使用任意已配置 Provider 与接收方，仅此模式要求 recipients。默认 `reach`，生成工程显式使用 `console`。Reach 免打扰期间由反馈自己的 outbox 等待，不进入 Reach 延迟队列，也不修改其他通知策略。Reach 的生产 Console Provider 限制保持不变；sent 仅表示选定通道受理，不能证明收信。
- 浏览器截图、遮挡/标注、可选 rrweb 回放、失败重试与本地导出；`@h-ai/ui` 提供 `FeedbackModal`、`FeedbackList` 和 `FeedbackDetail`。
- 自包含 ZIP、SHA-256 校验、离线查看与按请求/错误/时间分页读取，不包含生产凭据。

初始化成功后才能调用业务方法。应用代码在调用前准备实际的业务参数，校验输入和权限。收到 `HaiResult` 时先检查 `success`，成功时读 `data`，失败时读 `error`。成功结果为 `void` 时没有业务数据。返回 `null` 时表示没有找到值。

input 中的 id 是反馈 ID，attachmentId/jobId 指向同一反馈；context 来自可信认证，包含当前主体/范围/权限。evidence、submission 和 base64 均受容量及归属检查。

#### 场景：在服务端异步补充业务证据

业务系统通过 `feedback.init(config, { collectEvidence })` 注册一个服务端采集函数。它在反馈可靠入库后由持久 `collect` 任务调用，支持直接返回或 `async/await`；提交请求无需等待业务日志生成。相比进程内事件订阅，任务在重启或切换实例后仍可恢复。所有处理同一 appId 的实例必须注册相同采集函数。

下例运行在依赖已初始化的服务端；`config` 是应用从服务端配置中读出的 `FeedbackConfigInput`，业务预先生成并脱敏 `diagnostics/sanitized-logs.zip`，生产中可在回调内等待自己的日志收集服务：

```ts
import type { FeedbackConfigInput } from '@h-ai/feedback'
import { readFile } from 'node:fs/promises'
import { feedback } from '@h-ai/feedback'

async function startFeedback(config: FeedbackConfigInput) {
  const result = await feedback.init(config, {
    collectEvidence: async ({ report, signal }) => ({
      text: `Diagnostics for ${report.number}`,
      data: { businessSystem: 'orders', scopeId: report.scopeId },
      attachments: [
        {
          id: 'business-logs',
          name: 'business-logs.zip',
          contentType: 'application/zip',
          bytes: await readFile('diagnostics/sanitized-logs.zip', { signal }),
        }
      ],
    }),
  })
  if (!result.success)
    return result
  return result
}
```

`text/data` 以 `source: server:business`、`kind: business` 写入证据，详情“业务信息”页签可分页查询；附件关联同一反馈，详情下载和离线导出均包含。短文本/JSON 遵循已有脱敏、字段截断和证据预算；完整日志使用 `text/plain` 附件，会全文脱敏。ZIP/GZIP 原样存储，仅校验类型标记、字节数与 SHA-256，不解压、不执行、不自动脱敏内部文件；业务须在压缩前清理凭据和个人敏感内容。浏览器 `addFiles` 同样支持 ZIP、GZ、TGZ。

回调最多等待 `businessCollectionTimeoutMs`（默认 30000ms，1–300000）；超时或关闭触发 `signal`，框架停止等待，回调必须把 `signal` 传给自己启动的异步操作，使其也能取消。抛错、超限、非法文件或存储失败均记录采集任务失败并按 `maxAttempts` 重试；耗尽后 `collectionStatus: failed`，管理员可 `retry({ id, target: 'collect' }, context)`。回调可能重新执行，使用 report.id 实现外部操作幂等。附件全部存储完成后，证据和附件索引在持有租约的同一事务发布；成功标记入库后不再调用回调。附件 ID 稳定且为 1–100 字符，框架自动加 `server:business:` 前缀；所有附件共享 20 项、单项/合计预算，不另开无限容量。

#### 场景：向业务系统发送受理回调

配置可信服务端 `webhookUrl` 后，每次新反馈在受理事务中创建一个独立 `webhook` 任务。任务等待采集进入 complete/partial/failed，再发送 `POST application/json` 的 `feedback.created`；采集失败仍会回调。Webhook 不依赖 Reach，也不受 notificationMode 或 Reach 免打扰影响。

```yaml
businessCollectionTimeoutMs: 30000
webhookUrl: ${HAI_FEEDBACK_WEBHOOKURL:}
webhookSecret: ${HAI_FEEDBACK_WEBHOOKSECRET:}
webhookTimeoutMs: ${HAI_FEEDBACK_WEBHOOKTIMEOUTMS:10000}
```

地址默认空字符串（禁用），只允许 HTTP(S)，禁止 URL 用户凭据/fragment，不跟随重定向。地址只能由可信部署配置提供；内网地址可用于内部系统回调。签名密钥仅放服务端 `.env.local` 或部署私有环境，不使用 `PUBLIC_`。`webhookTimeoutMs` 默认 10000ms（1–60000），非 2xx、重定向、网络错误及超时均进入指数退避重试（1s 起，最多 60s），最多 `maxAttempts`（默认 5）次。

公开载荷类型为 `FeedbackWebhookEvent`，包含 `event/eventId/createdAt/report/evidence/detailUrl?`。evidence 提供修订、业务材料是否成功和附件元数据；不发送附件正文、存储 key、配置密钥或全部日志。需要正文时使用现有受权 API 或离线包。首次发送前固定载荷，重试/重启保持相同正文和 `Idempotency-Key: eventId`。接收方应先持久化并按 eventId 去重，再返回 2xx；HTTP 副作用采用至少一次投递，响应丢失仍可能重发。修改回调地址后旧任务会失败，不会自动转投新地址；待旧任务处理完再切换。

每次请求发送 `X-Hai-Feedback-Event`、`X-Hai-Feedback-Timestamp`（Unix 秒）；配置密钥时额外发送 `X-Hai-Feedback-Signature: sha256=<hex>`，计算方式为 `HMAC-SHA256(secret, timestamp + '.' + 原始请求正文)`。接收方用原始字节验签、恒定时间比较，并限制时间偏差及按 eventId 防重放。任务终态和尝试次数见 `get().jobs`，`lastError` 仅为安全错误码；管理台/Fullstack 详情展示 Webhook 状态，管理员可重试或调用 `retry({ id, target: 'webhook' }, context)`。它与 `notificationStatus` 分开记录，发送成功表示接收端返回 2xx。

#### 运行状态与领域错误

前后端分别传入其实际产物的 `appVersion/buildId/commit`；前端不能使用后端返回的版本替代自身版本。同一 SSR 构建的浏览器与服务产物复用 buildId。管理台与 CLI 生成的 base/API/fullstack 项目已接入编译期标识；`hai build` 内部生成标识，Docker 经构建参数传递。各目标从自己的 package.json 读取版本，没有所属 Git 提交时记录 `unknown`。模板的 `build-metadata.json` 仅含这三个非敏感字段，与运行代码内联值保持一致。

默认 HTTP 接入来自 `@h-ai/serv/features/feedback` 的 `createFeedbackProcedures({ feedback, resolveContext })`。配合 `apiContract.feedback` 挂载；`resolveContext` 提供服务端确定的 `scopeId/userId/permissions`。普通提交用户只能补充自己的材料；管理权限分别为 `feedback:read/process/reopen/export`，客户端的租户 ID、requestId、附件名称不能作为授权。

范围、用户、应用及证据关联标识按精确字符串匹配，MySQL 的大小写、重音及尾空格排序规则不会放宽隔离。附件 ID 保留原值并区分大小写，接受 1–128 字符的有效 Unicode；ZIP 文件路径使用摘要生成，不能从附件 ID 或显示名称推导。非成对代理字符在受理前拒绝。

[反馈配置清单](../configuration/feedback.md)列出了 `FeedbackConfigSchema` 和 `HAI_FEEDBACK_*` 的映射规则。浏览器通过受权的配置接口读取允许公开的采集策略。

```ts
const ready = feedback.isInitialized // 无需参数，服务端反馈实例已发布时为 true。
const activeAppId = feedback.config?.appId // 无需参数，读取运行配置中的应用 ID；关闭后为 undefined。
```

`feedback.config` 未初始化时为 `null`。读取到的配置属于服务端，包含通知接收方等业务数据。

领域错误使用 `HaiFeedbackError`，包括未初始化、配置、权限、找不到、冲突、容量及 checksum 失败。所有领域 API 先检查 `success`；HTTP 200 或 Promise 完成不代表反馈、上传或邮件成功。SMTP 受理不等于管理员收件箱已投递；不确定发送存在重发边界。

#### 容量、保留与依赖故障

服务端从 `@h-ai/feedback` 导入 `feedback`。`maxTotalBytes` 默认 32 MiB（4–40 MiB）。`feedback.budget` 从同一总量推导单附件、附件总量、双份证据与 Base64/加密传输预算；默认单附件 5 MiB、附件合计 22 MiB、证据 4 MiB/2000 条，并预留 2 MiB 给历史、元数据和查看器。受理前检查附件声明总量，补采原子检查证据预算，处理历史限制 256 KiB，避免成功受理后因容量永久无法导出。客户端通过受权 `reports.policy({})` 取得有效值，表单展示容量；

普通业务仍使用 `transport.maxPlaintextBytes`（auto/省略为 1 MiB）；Feedback 的报告受理、证据、附件及 ZIP 下载路由通过 `routePlaintextBytes` 单独声明容量。启动时用 `@h-ai/api-contract/feedback` 的 `resolveFeedbackBudget(已校验的反馈配置).maxTransportBytes` 预计算，避免可选反馈故障/重试期间缓存模块默认预算。路径中的 `*` 仅匹配一个完整路径段；优先使用应用为该路由明确设置的值。握手、adapter-node 与代理使用各路由最大容量，普通业务不会随材料预算扩大。HTTP 适配器为单独声明且大于 1 MiB 的材料路由保留最多 2 个槽，普通业务另有 16 个槽，完整响应/失败后释放；忙碌返回 503 / `hai:crypto:072`，不自动重放业务写入。

服务端错误窗口待写材料同时限制 3000 条、8 MiB 和 5 分钟；按最多 32 条/256 KiB 批量幂等写入，数据库失败指数退避到 30 秒，丢失保留 missing 原因。worker 空闲指数退避到 30 秒，本节点提交/重试/导出会唤醒；`workerIntervalMs:0` 由专用 worker 驱动。临时证据按 appId 每批最多 100 条清理，使用复合过期索引。

`maxReportsPerUserDay` 默认 20，`maxBytesPerUserDay` 默认 2 GiB，`maxStoredBytesPerScope` 默认 10 GiB，`maxExportsPerReport` 默认 5，`exportRetentionHours` 默认 24。受理在同一共享数据库事务中按数据库 UTC 日、app/scope/user 预留 `maxTotalBytes * (maxExportsPerReport + 1)` 字节，覆盖报告及历史 ZIP；受理时固定报告容量与导出数量，调高配置不突破既有预留；是保守容量预留，非磁盘实时计量。重复 submissionId 不重复计费，超限返回 `QUOTA_EXCEEDED`（429）且不创建报告或对象。成功到期删除报告才释放 scope 预留；日累计计数不退还。导出到期禁止下载并限批删对象，固定快照/创建时间与条件写复用同一个 ZIP，业务补采首次上传前冻结文件清单，重试不能变化 ID/内容制造无限对象。运维可查看 `hai_feedback_quotas` 的 scope 行（period=0）已预留量及到期 cleanup 任务积压；它不等于云存储账单。

参考管理台与 fullstack 的 feedback 启动失败仅使反馈不可用，30 秒独立重试且同类故障不重复输出告警；策略接口也返回 503。业务必需的数据库、缓存、IAM 和审计仍遵守原失败策略；不能捕获整个 runtime.start 后继续使用已经回滚的模块。关闭先停止反馈与重试任务，再释放借用依赖。

#### 日志通知的隐私边界

`consoleContent` 默认为 `metadata`，只打印反馈编号、应用、版本、构建标识和采集状态。设置 `summary` 会额外打印经过通用脱敏的摘要。确认摘要不会包含应用自己的敏感数据后再启用。这个选项仅影响 `console` 通知方式，无需初始化 Reach。

服务端环境证据与反馈受理共同提交；环境写入失败不留下已受理但缺失环境的半成品，相同 submissionId 可安全重试。管理界面用 `createFeedbackReview(...).retryReport(id)` 重试可恢复材料与失败通知/Webhook，控制器去重目标并传播失败，退出调用 close 阻止迟到请求继续编排。

<a id="reports"></a>

### 提交、查询与处理反馈：`feedback`

用户提交反馈后保存受理 ID，管理员按权限读取现场并用版本号更新处理状态。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `feedback.submit` | 受理一份反馈 | input, context | `報告` | `await feedback.submit(submission, context)` |
| `feedback.list` | 筛选并分页查询反馈 | input, context | `报告分页` | `await feedback.list({ page: 1, pageSize: 20 }, context)` |
| `feedback.get` | 读取反馈详情 | id, context | `报告、附件、历史、任务` | `await feedback.get(reportId, context)` |
| `feedback.getEvidence` | 分页读取诊断证据 | input, context | `证据分页` | `await feedback.getEvidence({ id: reportId, page: 1, pageSize: 20 }, context)` |
| `feedback.setStatus` | 按版本条件变更处理状态 | input, context | `更新后的报告` | `await feedback.setStatus({ id: reportId, status: 'handled', expectedVersion: version }, context)` |
| `feedback.retry` | 重新调度指定失败任务 | input, context | `void` | `await feedback.retry({ id: reportId, target: 'collect' }, context)` |

#### 场景：提交、查询与处理反馈

输入 context 来自服务端认证并具备 feedback:create/read/process 权限。报告 ID 来自 submit 的成功数据，修改版本来自紧接着读取的 detail.report.version。重试通知只对确有可恢复失败的报告调用；成功不表示收件人已读。

```ts
import type { FeedbackContext } from '@h-ai/feedback'

async function processReport(context: FeedbackContext, submissionId: string) {
  const report = value(await feedback.submit({ appId: 'orders', submissionId }, context))
  const page = value(await feedback.list({ page: 1, pageSize: 20 }, context)) // authorized report page
  const detail = value(await feedback.get(report.id, context))
  const evidence = value(await feedback.getEvidence({ id: report.id, page: 1, pageSize: 20 }, context))
  const handled = value(await feedback.setStatus({ id: report.id, status: 'handled', expectedVersion: detail.report.version }, context))
  return { report, page, evidence, handled } // same report ID; handled has the new version
}

async function retryNotification(id: string, context: FeedbackContext) {
  return feedback.retry({ id, target: 'notify' }, context) // HaiResult<void>, caller checks success
}
```

#### 查询权限、版本冲突与保留边界

`list/get/getEvidence` 返回受权记录、详情与分页证据；`setStatus({ id, status, expectedVersion }, context)` 以版本检查执行处理/撤销。`retry` 仅重排可恢复项。`export` 固定证据修订并创建任务，通过 `getExport` 获取已生成的 ZIP；导出未完成不伪装成功。材料缺失和截断随包保留，回放不是重新执行业务。

用 `feedback.getExport()` 查询导出时，服务端先验证反馈归属和 `feedback:export` 权限。导出任务仍为 `pending` 或 `running`，且导出所用的报告副本还有效时，返回 `CONFLICT`（409），可在有限时间内继续查询。任务失败时返回 `OPERATION_FAILED`（500），管理员核对后可调用 `feedback.retry()`。任务不存在、不属于这份反馈或报告副本已过期时返回 `NOT_FOUND`（404）。缺少导出权限时返回 `FORBIDDEN`（403）。导出副本过期后可对当前版本重新调用 `feedback.export()`。已完成的 ZIP 在读取时仍会核对文件校验和。

按 `errorId` 查看错误时，用错误产生的来源、请求和日志位置来选取前后各最多 100 条。两处错误的日志范围重叠时，两处都能看到共有的日志。

报告到期后，后台任务删除报告、证据、附件、历史和待导出记录。未附着到报告的上传也按对象路径前缀删除。为了清掉较晚才传完的文件，后台额外保留该前缀和 24 小时的截止时间，其间多次扫描，不保留报告或附件内容。清理失败时会重试。

<a id="evidence"></a>

### 追加材料与读取附件：`feedback`

受理后的补充材料仍绑定原报告与身份；附件要检查类型、字节与内容摘要。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `feedback.appendEvidence` | 追加一批诊断证据 | input, context | `确认 ID 数组与证据修订` | `await feedback.appendEvidence({ id: reportId, evidence }, context)` |
| `feedback.completeCollection` | 标记本轮证据采集完成 | input, context | `报告` | `await feedback.completeCollection({ id: reportId }, context)` |
| `feedback.uploadAttachment` | 上传已授权的反馈附件 | input, context | `附件元数据` | `await feedback.uploadAttachment({ id: reportId, attachmentId, dataBase64 }, context)` |
| `feedback.getAttachment` | 读取已授权的附件 | input, context | `文件名、类型与 base64` | `await feedback.getAttachment({ id: reportId, attachmentId }, context)` |

#### 场景：追加材料与读取附件

id 是原受理报告，context 与报告归属一致。每条证据携带稳定 id/source/sequence；上传输入来自已声明附件的字节编码，不能换 ID 绕过声明和配额。

```ts
import type { FeedbackContext, FeedbackUploadInput } from '@h-ai/feedback'

async function appendMaterials(context: FeedbackContext, upload: FeedbackUploadInput) {
  const id = upload.id
  const receipt = value(await feedback.appendEvidence({ id, evidence: [{
    id: 'event-demo-1', source: 'browser', sequence: 1, kind: 'business',
    timestamp: Date.now(), data: { state: 'checkout-failed' },
  }] }, context)) // acknowledged IDs and evidenceRevision
  const attachment = value(await feedback.uploadAttachment(upload, context)) // saved attachment metadata
  const bytes = value(await feedback.getAttachment({ id, attachmentId: upload.attachmentId }, context))
  const completed = value(await feedback.completeCollection({ id, missing: [] }, context)) // updated report
  return { receipt, attachment, bytes, completed }
}
```

<a id="exports"></a>

### 导出与读取离线诊断包：`feedback`

导出先创建任务并固定证据修订，完成后读取 ZIP；本地查看器不重新执行业务。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `feedback.export` | 申请固定证据修订的离线包 | input, context | `导出任务` | `await feedback.export({ id: reportId }, context)` |
| `feedback.getExport` | 读取已完成的离线包 | input, context | `ZIP 文件名、类型与 base64` | `await feedback.getExport({ id: reportId, jobId }, context)` |

#### 场景：导出与读取离线诊断包

管理员从已读取报告取得 id，export 返回任务 ID。下面只检查一次生成结果：尚未完成返回 CONFLICT，调用方可以有界等待后再查；不要把它当空 ZIP。

```ts
import type { FeedbackContext } from '@h-ai/feedback'

async function requestArchive(id: string, context: FeedbackContext) {
  const job = value(await feedback.export({ id }, context)) // persistent job receipt
  return feedback.getExport({ id, jobId: job.id }, context) // HaiResult<FeedbackAttachmentData>
}
```

#### 场景：在终端读取离线包

```sh
hai feedback summary feedback-FB-1.zip
hai feedback inspect feedback-FB-1.zip
hai feedback evidence feedback-FB-1.zip --request-id req-1 --page 1 --page-size 20
hai feedback view feedback-FB-1.zip
```

`view` 只监听本机 loopback，使用随机路径和内置查看器，Ctrl+C 关闭；无需生产网络。程序也可从 `@h-ai/feedback/bundle` 使用 `createFeedbackBundle`、`readFeedbackBundle`、`summarizeFeedbackBundle`、`queryFeedbackBundle`，无需初始化反馈服务。

#### 场景：解码附件并交给平台保存

从 `@h-ai/feedback/client` 导入 `createFeedbackClient()`。以下 `feedbackClient` 是返回的独立实例，`actions` 是应用提供的 typed HTTP 适配器。返回 `HaiResult` 的步骤须检查 `success`。

```ts
import { getFeedbackBundleViewerFiles } from '@h-ai/feedback/bundle'
import { feedbackDataBytes, saveFeedbackFile } from '@h-ai/feedback/client'

const bytes = feedbackDataBytes({ name: 'sample.txt', contentType: 'text/plain', dataBase64: 'YQ==' }) // 将附件 DTO 中的 Base64 解码成正文 Uint8Array。
const saved = value(await saveFeedbackFile(bytes, 'sample.txt', 'text/plain')) // 交给当前平台的保存工具。读取 HaiResult<FeedbackSaveResult>。
const viewer = getFeedbackBundleViewerFiles()['viewer/index.html'] // 无需输入，取得离线包内置查看器入口的字节。
```

<a id="browser-capture"></a>

### 采集浏览器现场与草稿：`createFeedbackClient`

每个产品会话创建独立客户端；打开反馈面板前固定现场，发送或导出后按身份和预览生命周期清理。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `feedbackClient.init` | 启动浏览器现场采集 | `FeedbackClientConfig` | `Promise<HaiResult<void>>` | `await feedbackClient.init(config)` |
| `feedbackClient.prepare` | 为本次反馈准备现场材料 | `—` | `Promise<HaiResult<FeedbackDraft>>` | `await feedbackClient.prepare()` |
| `feedbackClient.captureScreenshot` | 采集当前页面截图 | `attachmentId?: string` | `Promise<HaiResult<void>>` | `await feedbackClient.captureScreenshot()` |
| `feedbackClient.getDraft` | 读取当前草稿 | `—` | `FeedbackDraft \| undefined` | `feedbackClient.getDraft()` |
| `feedbackClient.getView` | 读取供界面展示的状态 | `—` | `FeedbackDraftView` | `feedbackClient.getView()` |
| `feedbackClient.releasePreviews` | 释放临时预览资源 | `—` | `void` | `feedbackClient.releasePreviews()` |
| `feedbackClient.addFiles` | 添加用户选择的附件 | `files: readonly File[], removedAttachmentIds?: readonly string[]` | `Promise<HaiResult<void>>` | `await feedbackClient.addFiles(files, removedAttachmentIds)` |
| `feedbackClient.annotate` | 把标注与遮挡写入图片 | `attachmentId: string, FeedbackImageAnnotation` | `Promise<HaiResult<void>>` | `await feedbackClient.annotate(attachmentId, annotation)` |
| `feedbackClient.record` | 记录一条应用现场事实 | `kind, data; requestId?, errorId?` | `void` | `feedbackClient.record({ kind: 'business', data: { state: 'ready' } })` |
| `feedbackClient.submit` | 提交当前反馈草稿 | `FeedbackClientSubmitInput?` | `Promise<HaiResult<FeedbackReport>>` | `await feedbackClient.submit({ description: 'Checkout failed' })` |
| `feedbackClient.flush` | 补交待确认的证据 | `—` | `Promise<HaiResult<void>>` | `await feedbackClient.flush()` |
| `feedbackClient.exportDraft` | 生成本地诊断包 | `—` | `Promise<HaiResult<Uint8Array>>` | `await feedbackClient.exportDraft()` |
| `feedbackClient.saveDraft` | 保存本地草稿 | `—` | `Promise<HaiResult<FeedbackSaveResult>>` | `await feedbackClient.saveDraft()` |
| `feedbackClient.pause` | 暂停现场采集 | `—` | `void` | `feedbackClient.pause()` |
| `feedbackClient.close` | 停止采集并释放资源 | `{ discard?: boolean }` | `Promise<void>` | `await feedbackClient.close({ discard: true })` |

#### 场景：采集浏览器现场与草稿

```ts
import type { FeedbackClientConfig } from '@h-ai/feedback/client'
import { createFeedbackClient } from '@h-ai/feedback/client'
export async function capture(config: FeedbackClientConfig) {
  const feedbackClient = createFeedbackClient()
  value(await feedbackClient.init(config))
  try {
    feedbackClient.record({ kind: 'business', data: { state: 'ready' } })
    const draft = value(await feedbackClient.prepare())
    const current = feedbackClient.getDraft() // current draft or undefined
    const view = feedbackClient.getView() // preview URLs, evidence and missing materials
    value(await feedbackClient.captureScreenshot()) // refreshes the screenshot attachment
    value(await feedbackClient.addFiles([new File(['demo log'], 'demo.txt', { type: 'text/plain' })]))
    const receipt = value(await feedbackClient.submit({ description: 'Checkout failed' })) // accepted report ID/number
    value(await feedbackClient.flush()) // resumes pending evidence upload
    const archive = value(await feedbackClient.exportDraft()) // Uint8Array ZIP
    const saved = value(await feedbackClient.saveDraft()) // inspect saved.status; cancelled is not a saved file
    feedbackClient.releasePreviews() // releases generated object URLs
    feedbackClient.pause() // pauses active collection while retaining the draft
    return { draft, receipt, archive, saved }
  }
  finally {
    await feedbackClient.close({ discard: true })
  }
}
```

config.actions 由应用 typed HTTP 适配器提供，不是占位的网络实现。截图、文件、标注、submit/flush/saveDraft 的输入与结果按下面操作说明；保存成功也可能是用户取消，不能显示已保存。

#### 采集、脱敏与草稿并发边界

`keyScreenshots` 默认 false，需显式开启自动关键截图；手动 `prepare()` 仍可截图。截图超时会传递 AbortSignal，底层尚未结束时不允许重叠截图。默认渲染最多 10000 DOM 节点，继续受画布像素预算限制。`replay:true` 的默认 `replayStart` 为 `prepare`，打开反馈时才录制；明确需要预录时配置 `replayStart: init`。关闭反馈界面调用 `pause()` 停止 DOM 回放和截图，保留轻量日志、草稿及上传；退出身份仍调用 `close({ discard:true })`。自定义 `captureScreenshot({ signal })` 应尊重取消信号。

反馈受理后，SDK 后台补传附件和后续证据。网络、5xx、408 或 429 失败按 1、2、4、8、16 秒重试，连续六次失败后暂停；其他 4xx 立即暂停。草稿和附件保持不变，修复网络或重新认证后，通过 `flush()` 或再次准备反馈显式重试。未提交反馈、采集已完成时不发起后台补传。`close({ discard: true })` 等待已开始的请求结束，不再发起旧草稿的后续请求；切换账号时，应用应先等待关闭完成，再为新账号初始化客户端。

自动截图使用 html2canvas 渲染经遮挡的克隆 DOM。跨域图片、iframe、video 和尚未就绪的网络字体可能缺失；浏览器或 CSP 限制导致失败时明确标记 missing，用户仍可手动添加附件。

`saveDraft(input?)` 统一本地导出与保存：Web 下载、Tauri 原生保存对话框、Capacitor 缓存文件原生分享。取消返回 `status: 'cancelled'`；错误仍返回失败。生成的移动端和桌面端模板已声明插件与对应的 Tauri 权限。手工接入的应用要按目标平台安装对应插件。`createFeedbackReview(typedClient.feedback.reports)` 提供 `loadReplay(id)` 与可取消的 `exportReport(id)`，不再由应用分页和轮询。退出身份调用 `review.close()` 与 `client.close({ discard: true })`，停止采集、轮询，清理预览和持久草稿。

Web 客户端不解析或安装原生插件。手工搭建的 Tauri 应用从 `@h-ai/feedback/tauri` 导入 `saveTauriFeedbackFile`，Capacitor 应用从 `@h-ai/feedback/capacitor` 导入 `saveCapacitorFeedbackFile`，并在启动时调用 configureFeedbackSaving(saver)；生成工程已接入，业务无需处理原生文件生命周期。

浏览器从 `@h-ai/feedback/client` 创建自己的客户端实例，离线查看工具从 `@h-ai/feedback/bundle` 导入。

浏览器从 `@h-ai/feedback/client` 导入 `createFeedbackClient()`，通过 `init({ appId, actions })` 注入 typed API 的 submit、appendEvidence、completeCollection、upload。先调用 `prepare()` 固定现场，成功后再显示 `FeedbackModal`；`submit()` 返回受理回执，后台 `flush()` 续传。`close()` 释放监听器和记录器。Cookie 白名单、持久草稿与回放均由产品显式启用，凭证类值始终排除。

浏览器和服务端共用文本脱敏规则，覆盖常见凭据键、JSON/转义 JSON、Bearer/Basic 授权值；写入数据库、接口和离线包使用同样的脱敏规则。应用仍需标出页面上的敏感区域，并明确哪些字段允许采集。

`text/plain` 附件在 5 MiB 文件上限内全文脱敏，保留安全正文和末尾日志，不套用结构化证据的单字段截断。超过上限的原文件在读取前拒绝，脱敏结果仍受同一附件字节上限约束。JSON 附件和结构化证据继续限制字段长度、深度及数量，可能被裁剪；需要完整日志时使用纯文本附件。待提交附件与首次包络冻结后本地导出的新增附件使用相同规则。

完整客户端方法为 `init(config)`、`prepare/captureScreenshot(attachmentId?)/submit/flush/record/getDraft/getView/annotate/addFiles/exportDraft/saveDraft/pause/close`。将表单 `onfileschange` 连接 `addFiles` 后刷新草稿附件预览，用户便可在提交前标注、遮挡或删除新增图片。`data-feedback-action` 标记关键操作，`data-feedback-private` 遮挡敏感内容，`data-feedback-ignore` 排除反馈界面自身。首次发送后包络冻结；同一提交重试时修改输入会返回冲突并保留输入，可先本地导出。

`addFiles` 按批次原子添加：全部文件通过校验才合并，任一失败均保留原附件和缺失标记，不保存半批文件。并发成功批次不会相互覆盖，合并后仍最多 20 项；读取期间草稿切换或首次包络冻结时返回 `CONFLICT`，不会补入包络之外的隐藏上传。

本地附件支持 PNG/JPEG/WebP、WebM/MP4、TXT/LOG、JSON、PDF 和 ZIP/GZIP。浏览器未提供 MIME 或只提供 `application/octet-stream` 时按受支持扩展名补齐，常见 MIME 别名会规范化；服务端仍校验真实文件字节和 checksum。不支持的格式显示具体提示。普通输入控件的截图保留底色与边框，内容替换为固定遮罩字符；密码框、`data-feedback-private`、`.rr-block` 和 `.rr-mask` 继续整块遮挡。仅修改截图克隆，原页面和输入值不变。

`annotate(id, { ...rect, mode, coordinateSpace: 'ratio' })` 直接接受 UI 的 0–1 坐标，由 SDK 按解码后的原图换算，支持小数、小于 1% 的区域、反向拖动、边缘与 CSS 缩放。省略 coordinateSpace 仍使用原图像素。`getView()` 管理并复用预览 URL；替换、删除和关闭时释放。业务无需 Image.decode 或 URL.createObjectURL。

并发 `init` 返回 `INIT_IN_PROGRESS`；`close` 等待有界截图退出后清理会话。截图期间关闭使 `prepare` 返回失败，不复活草稿。异步标注完成时若草稿已冻结、关闭、删除图片或被另一标注更新，则返回 `CONFLICT`，不改变已提交附件的字节或 checksum。

草稿由 SDK 持有并通过 `annotate`、`addFiles` 等方法更新。在 Svelte 组件中保存这份草稿时使用 `$state.raw<FeedbackDraft>()`，操作成功后从 `getDraft()` 刷新附件视图；不要将 SDK 草稿放入深度 `$state` 代理，否则 SDK 替换图片字节后，代理可能继续返回已缓存的旧字节。

#### 场景：在反馈界面截图、遮挡与查看回放

当前页面截图优先展示；`captureScreenshot(attachmentId?)` 补充当前页面，传附件 ID 则替换原截图。`FeedbackModal` 的 `oncapture` 接入此方法，选取时隐藏弹窗，允许切换页面后点击“截取当前页面”，并保留说明。`FeedbackForm.evidence` 展开显示已脱敏的日志、请求、环境和回放事件；`evidenceSummary` 补充缺失说明。浏览器环境取实际 URL（去查询参数/hash）、视口、语言和构建标识；服务端环境仅采集 `envAllowlist` 中的非凭据键，缺失值为 null。

支持录屏的浏览器可在反馈中选择“录屏 → 开始录屏”，授权页面/窗口后录制无声视频，最多 60 秒 / 5 MiB，低帧率和码率；停止共享、取消、超时和组件销毁均释放流。录屏是用户主动选择的原始画面，不会自动遮挡敏感信息，停止后可预览和删除。WebM/MP4 与其他附件使用相同的私有存储、校验和及 5 MiB 限制；不支持录屏的浏览器可直接添加视频文件。

参考管理台和启用 feedback 的 fullstack 模板显式启用 `replay: true`；SDK 默认仍关闭。管理员在反馈详情的“页面回放”播放或定位页面操作，应用提供的 `onreplay` 回调需要分页读取完整 `kind: replay` 事件，不能只传普通材料的一页。无记录时明确提示；录屏在“操作现场”预览。保存反馈到本地后可用 `hai feedback view <zip>` 查看附件、录屏和回放；本地包明确缺少尚未取得的服务端材料。

构建身份统一限制 128 字符；显式非法 HAI_BUILD_ID/HAI_BUILD_COMMIT 在构建时拒绝，错误不回显私密值。默认脱敏包含 verificationCode、otpCode、短信/邮件/一次性/二次验证码；业务 code 字段不会一概隐藏。

服务策略暂不可用时，客户端按有界本地预算继续采集并标记 server-policy-unavailable，允许本地导出；在线提交前重新获取有效策略，失败不受理。addFiles(files, removedAttachmentIds?) 在同一原子批次移除已删除的旧附件，容量显示与实际合并一致。

console/disabled 无 Reach npm 依赖；选 reach 模式需显式安装 @h-ai/reach（optional peer）并由应用启动代码初始化。凭据通知只返回生成的 receiptId，不保存或回传可能携带载荷的 Provider messageId。

#### 场景：提交前遮挡选中的图片区域

annotation 来自用户在附件预览中选择的区域，attachmentId 来自同一草稿图片；在 submit 冻结包络之前调用。成功只表示图片修改已提交到草稿，随后刷新 getView。

```ts
import type { FeedbackBrowserClient } from '@h-ai/feedback/client'

async function redactImage(client: FeedbackBrowserClient, attachmentId: string,
  annotation: Parameters<FeedbackBrowserClient['annotate']>[1]) {
  const changed = await client.annotate(attachmentId, annotation)
  if (!changed.success)
    return changed
  return client.getView() // refreshed preview and attachment state
}
```

## 错误处理

调用返回 `HaiResult` 的操作后，先检查 `result.success`。失败时在服务端保留错误码、追踪编号和已去除敏感信息的原因。创建客户端、读取流和关闭模块的返回方式见各节示例。
