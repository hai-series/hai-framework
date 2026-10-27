# @h-ai/feedback

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

[框架首页](../../README.md)

## 简介

提供用户反馈、诊断现场、管理员处理与离线问题包。用户可以不填说明直接提交；反馈和结构化证据保存到关系型数据库，截图等附件进入私有对象存储，管理员通过邮件和管理界面处理。它不依赖通用 telemetry 服务。

## 核心功能清单

- 有界采集前后端日志、请求、错误、操作、版本与白名单环境信息；默认错误前后各最多 100 条。
- 数据库事务受理、提交/证据幂等、附件校验、独立的处理/采集/通知状态、持久化任务与租约恢复。
- 通知由 `notificationMode` 独立选择：`disabled` 不创建通知任务；`console` 默认仅输出定位与采集状态元数据（consoleContent: metadata）；显式 consoleContent: summary 才加入通用脱敏摘要，不依赖 Reach 或邮箱；`reach` 使用任意已配置 Provider 与接收方，仅此模式要求 recipients。默认 `reach` 保持旧配置兼容，新生成工程显式使用 `console`。Reach 免打扰期间由反馈自己的 outbox 等待，不进入 Reach 延迟队列，也不修改其他通知策略。Reach 的生产 Console Provider 限制保持不变；sent 仅表示选定通道受理，不能证明收信。
- 浏览器截图、遮挡/标注、可选 rrweb 回放、失败重试与本地导出；`@h-ai/ui` 提供 `FeedbackModal`、`FeedbackList` 和 `FeedbackDetail`。
- 自包含 ZIP、SHA-256 校验、离线查看与按请求/错误/时间分页读取，不包含生产凭据。

## 使用入门

服务端先初始化 core、reldb 和私有 storage，再初始化 feedback；仅 reach 通知模式需先初始化 Reach。生产使用共享数据库和私有对象存储，连接凭据由宿主管理。

以下片段位于异步函数内，依赖已经初始化；`context` 必须由可信服务端认证和授权生成：

```ts
import { feedback } from '@h-ai/feedback'

const initialized = await feedback.init({
  appId: 'orders',
  appVersion: '1.0.0',
  notificationMode: 'console',
  adminUrl: 'https://app.example.test/admin/feedback',
})
if (!initialized.success)
  return initialized

const context = { scopeId: 'tenant-1', userId: 'user-1', permissions: ['feedback:create'] }
const submitted = await feedback.submit({ appId: 'orders', submissionId: 'stable-client-operation' }, context)
if (!submitted.success)
  return submitted
// submitted.data.number 是可靠受理编号，材料和邮件仍有各自状态。
return submitted
```

应用退出时先检查 `await feedback.close()`，再关闭 reach/storage/reldb。重复提交使用原 `submissionId`；不能在超时后换新标识绕过幂等。

前后端分别传入其实际产物的 `appVersion/buildId/commit`；前端不能使用后端返回的版本替代自身版本。同一 SSR 构建的浏览器与服务产物复用 buildId。管理台与 CLI 生成的 base/API/fullstack 项目已接入编译期标识；`hai build` 内部生成标识，Docker 经构建参数传递。各目标从自己的 package.json 读取版本，没有所属 Git 提交时记录 `unknown`。模板的 `build-metadata.json` 仅含这三个非敏感字段，与运行代码内联值保持一致。

默认 HTTP 接入来自 `@h-ai/serv/features/feedback` 的 `createFeedbackProcedures({ feedback, resolveContext })`。配合 `apiContract.feedback` 挂载；`resolveContext` 提供服务端确定的 `scopeId/userId/permissions`。普通提交用户只能补充自己的材料；管理权限分别为 `feedback:read/process/reopen/export`，客户端的租户 ID、requestId、附件名称不能作为授权。

范围、用户、应用及证据关联标识按精确字符串匹配，MySQL 的大小写、重音及尾空格排序规则不会放宽隔离。附件 ID 保留原值并区分大小写，接受 1–128 字符的有效 Unicode；ZIP 文件路径使用摘要生成，不能从附件 ID 或显示名称推导。非成对代理字符在受理前拒绝。

浏览器从 `@h-ai/feedback/client` 导入 `createFeedbackClient()`，通过 `init({ appId, actions })` 注入 typed API 的 submit、appendEvidence、completeCollection、upload。先调用 `prepare()` 固定现场，成功后再显示 `FeedbackModal`；`submit()` 返回受理回执，后台 `flush()` 续传。`close()` 释放监听器和记录器。Cookie 白名单、持久草稿与回放均由产品显式启用，凭证类值始终排除。

浏览器和服务端共用文本脱敏规则，覆盖常见凭据键、JSON/转义 JSON、Bearer/Basic 授权值；入库、API 与离线包保持同一脱敏结果。业务专有敏感字段仍应由宿主配置白名单和敏感区域标记。

`text/plain` 附件在 5 MiB 文件上限内全文脱敏，保留安全正文和末尾日志，不套用结构化证据的单字段截断。超过上限的原文件在读取前拒绝，脱敏结果仍受同一附件字节上限约束。JSON 附件和结构化证据继续限制字段长度、深度及数量，可能被裁剪；需要完整日志时使用纯文本附件。待提交附件与首次包络冻结后本地导出的新增附件使用相同规则。

完整客户端方法为 `init(config)`、`prepare/captureScreenshot(attachmentId?)/submit/flush/record/getDraft/getView/annotate/addFiles/exportDraft/saveDraft/pause/close`。将表单 `onfileschange` 连接 `addFiles` 后刷新草稿附件预览，用户便可在提交前标注、遮挡或删除新增图片。`data-feedback-action` 标记关键操作，`data-feedback-private` 遮挡敏感内容，`data-feedback-ignore` 排除反馈界面自身。首次发送后包络冻结；同一提交重试时修改输入会返回冲突并保留输入，可先本地导出。

`addFiles` 按批次原子添加：全部文件通过校验才合并，任一失败均保留原附件和缺失标记，不保存半批文件。并发成功批次不会相互覆盖，合并后仍最多 20 项；读取期间草稿切换或首次包络冻结时返回 `CONFLICT`，不会补入包络之外的隐藏上传。

本地附件支持 PNG/JPEG/WebP、WebM/MP4、TXT/LOG、JSON、PDF 和 ZIP/GZIP。浏览器未提供 MIME 或只提供 `application/octet-stream` 时按受支持扩展名补齐，常见 MIME 别名会规范化；服务端仍校验真实文件字节和 checksum。不支持的格式显示具体提示。普通输入控件的截图保留底色与边框，内容替换为固定遮罩字符；密码框、`data-feedback-private`、`.rr-block` 和 `.rr-mask` 继续整块遮挡。仅修改截图克隆，原页面和输入值不变。

`annotate(id, { ...rect, mode, coordinateSpace: 'ratio' })` 直接接受 UI 的 0–1 坐标，由 SDK 按解码后的原图换算，支持小数、小于 1% 的区域、反向拖动、边缘与 CSS 缩放。省略 coordinateSpace 仍使用原图像素。`getView()` 管理并复用预览 URL；替换、删除和关闭时释放。业务无需 Image.decode 或 URL.createObjectURL。

并发 `init` 返回 `INIT_IN_PROGRESS`；`close` 等待有界截图退出后清理会话。截图期间关闭使 `prepare` 返回失败，不复活草稿。异步标注完成时若草稿已冻结、关闭、删除图片或被另一标注更新，则返回 `CONFLICT`，不改变已提交附件的字节或 checksum。

草稿由 SDK 持有并通过 `annotate`、`addFiles` 等方法更新。Svelte 宿主保存该引用时使用 `$state.raw<FeedbackDraft>()`，操作成功后从 `getDraft()` 刷新附件视图；不要将 SDK 草稿放入深度 `$state` 代理，否则 SDK 替换图片字节后，代理可能继续返回已缓存的旧字节。

`maxTotalBytes` 默认 32 MiB（4–40 MiB）。`feedback.budget` 从同一总量推导单附件、附件总量、双份证据与 Base64/加密传输预算；默认单附件 5 MiB、附件合计 22 MiB、证据 4 MiB/2000 条，并预留 2 MiB 给历史、元数据和查看器。受理前检查附件声明总量，补采原子检查证据预算，处理历史限制 256 KiB，避免成功受理后因容量永久无法导出。客户端通过受权 `reports.policy({})` 取得有效值，表单展示容量；

普通业务仍使用 `transport.maxPlaintextBytes`（auto/省略为 1 MiB）；Feedback 的报告受理、证据、附件及 ZIP 下载路由通过 `routePlaintextBytes` 单独声明容量。启动时用 `@h-ai/api-contract/feedback` 的 `resolveFeedbackBudget(已校验的反馈配置).maxTransportBytes` 预计算，避免可选反馈故障/重试期间缓存模块默认预算。路径中的 `*` 仅匹配一个完整路径段；宿主显式路由值优先。握手、adapter-node 与代理使用各路由最大容量，普通业务不会随材料预算扩大。HTTP 适配器为单独声明且大于 1 MiB 的材料路由保留最多 2 个槽，普通业务另有 16 个槽，完整响应/失败后释放；忙碌返回 503 / `hai:crypto:072`，不自动重放业务写入。

`keyScreenshots` 默认 false，需显式开启自动关键截图；手动 `prepare()` 仍可截图。截图超时会传递 AbortSignal，底层尚未结束时不允许重叠截图。默认渲染最多 10000 DOM 节点，继续受画布像素预算限制。`replay:true` 的默认 `replayStart` 为 `prepare`，打开反馈时才录制；明确需要预录时配置 `replayStart: init`。关闭反馈界面调用 `pause()` 停止 DOM 回放和截图，保留轻量日志、草稿及上传；退出身份仍调用 `close({ discard:true })`。自定义 `captureScreenshot({ signal })` 应尊重取消信号。

自动截图由脱敏克隆 DOM 经 SVG foreignObject 重建可见页面。跨域图片、iframe、video 和尚未就绪的网络字体可能缺失；浏览器或 CSP 限制导致失败时明确标记 missing，用户仍可手动添加附件。

`saveDraft(input?)` 统一本地导出与保存：Web 下载、Tauri 原生保存对话框、Capacitor 缓存文件原生分享。取消返回 `status: 'cancelled'`；错误仍返回失败。原生插件为可选 peer，生成 App/Desktop 已配置依赖与 Tauri 权限；自定义宿主需安装对应插件。`createFeedbackReview(typedClient.feedback.reports)` 提供 `loadReplay(id)` 与可取消的 `exportReport(id)`，不再由应用分页和轮询。退出身份调用 `review.close()` 与 `client.close({ discard: true })`，停止采集、轮询，清理预览和持久草稿。

Web 客户端不解析或安装原生插件。自定义 Tauri/Capacitor 宿主分别从 @h-ai/feedback/tauri 或 @h-ai/feedback/capacitor 导入 saveTauriFeedbackFile/saveCapacitorFeedbackFile，并在启动时调用 configureFeedbackSaving(saver)；生成工程已接入，业务无需处理原生文件生命周期。

### 反馈现场与交付检查

当前页面截图优先展示；`captureScreenshot(attachmentId?)` 补充当前页面，传附件 ID 则替换原截图。`FeedbackModal` 的 `oncapture` 接入此方法，选取时隐藏弹窗，允许切换页面后点击“截取当前页面”，并保留说明。`FeedbackForm.evidence` 展开显示已脱敏的日志、请求、环境和回放事件；`evidenceSummary` 补充缺失说明。浏览器环境取实际 URL（去查询参数/hash）、视口、语言和构建标识；服务端环境仅采集 `envAllowlist` 中的非凭据键，缺失值为 null。

支持录屏的浏览器可在反馈中选择“录屏 → 开始录屏”，授权页面/窗口后录制无声视频，最多 60 秒 / 5 MiB，低帧率和码率；停止共享、取消、超时和组件销毁均释放流。录屏是用户主动选择的原始画面，不会自动遮挡敏感信息，停止后可预览和删除。WebM/MP4 与其他附件使用相同的私有存储、校验和及 5 MiB 限制；不支持录屏的浏览器可直接添加视频文件。

参考管理台和启用 feedback 的 fullstack 模板显式启用 `replay: true`；SDK 默认仍关闭。管理员在反馈详情的“页面回放”播放或定位页面操作，宿主 `onreplay` 须分页读取完整 `kind: replay` 事件，不能只传普通材料的一页。无记录时明确提示；录屏在“操作现场”预览。保存反馈到本地后可用 `hai feedback view <zip>` 查看附件、录屏和回放；本地包明确缺少尚未取得的服务端材料。

构建身份统一限制 128 字符；显式非法 HAI_BUILD_ID/HAI_BUILD_COMMIT 在构建时拒绝，错误不回显私密值。默认脱敏包含 verificationCode、otpCode、短信/邮件/一次性/二次验证码；业务 code 字段不会一概隐藏。

服务策略暂不可用时，客户端按有界本地预算继续采集并标记 server-policy-unavailable，允许本地导出；在线提交前重新获取有效策略，失败不受理。addFiles(files, removedAttachmentIds?) 在同一原子批次移除已删除的旧附件，容量显示与实际合并一致。

console/disabled 无 Reach npm 依赖；选 reach 模式需显式安装 @h-ai/reach（optional peer）并由宿主初始化。凭据通知只返回生成的 receiptId，不保存或回传可能携带载荷的 Provider messageId。

### 业务证据扩展

业务系统通过 `feedback.init(config, { collectEvidence })` 注册一个服务端采集函数。它在反馈可靠入库后由持久 `collect` 任务调用，支持直接返回或 `async/await`；提交请求无需等待业务日志生成。相比进程内事件订阅，任务在重启或切换实例后仍可恢复。所有处理同一 appId 的实例必须注册相同采集函数。

下例运行在依赖已初始化的服务端；`config` 为宿主加载的 `FeedbackConfigInput`，业务预先生成并脱敏 `diagnostics/sanitized-logs.zip`，生产中可在回调内等待自己的日志收集服务：

```ts
import type { FeedbackConfigInput } from '@h-ai/feedback'
import { readFile } from 'node:fs/promises'
import { feedback } from '@h-ai/feedback'

async function startFeedback(config: FeedbackConfigInput) {
  const result = await feedback.init(config, {
    collectEvidence: async ({ report, signal }) => ({
      text: `Diagnostics for ${report.number}`,
      data: { businessSystem: 'orders', scopeId: report.scopeId },
      attachments: [{
        id: 'business-logs',
        name: 'business-logs.zip',
        contentType: 'application/zip',
        bytes: await readFile('diagnostics/sanitized-logs.zip', { signal }),
      }],
    }),
  })
  if (!result.success)
    return result
  return result
}
```

`text/data` 以 `source: server:business`、`kind: business` 写入证据，详情“业务信息”页签可分页查询；附件关联同一反馈，详情下载和离线导出均包含。短文本/JSON 遵循已有脱敏、字段截断和证据预算；完整日志使用 `text/plain` 附件，会全文脱敏。ZIP/GZIP 原样存储，仅校验类型标记、字节数与 SHA-256，不解压、不执行、不自动脱敏内部文件；业务须在压缩前清理凭据和个人敏感内容。浏览器 `addFiles` 同样支持 ZIP、GZ、TGZ。

回调最多等待 `businessCollectionTimeoutMs`（默认 30000ms，1–300000）；超时或关闭触发 `signal`，框架停止等待，宿主必须将 signal 传给异步操作。抛错、超限、非法文件或存储失败均记录采集任务失败并按 `maxAttempts` 重试；耗尽后 `collectionStatus: failed`，管理员可 `retry({ id, target: 'collect' }, context)`。回调可能重新执行，使用 report.id 实现外部操作幂等。附件全部存储完成后，证据和附件索引在持有租约的同一事务发布；成功标记入库后不再调用回调。附件 ID 稳定且为 1–100 字符，框架自动加 `server:business:` 前缀；所有附件共享 20 项、单项/合计预算，不另开无限容量。

### Webhook 回调

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

### 查询、处理与导出

`list/get/getEvidence` 返回受权记录、详情与分页证据；`setStatus({ id, status, expectedVersion }, context)` 以版本检查执行处理/撤销。`retry` 仅重排可恢复项。`export` 固定证据修订并创建任务，通过 `getExport` 获取已生成的 ZIP；导出未完成不伪装成功。材料缺失和截断随包保留，回放不是重新执行业务。

`getExport` 先检查范围及 `feedback:export` 权限。有效快照的 `pending/running` 任务返回 `CONFLICT`（409，生成中），调用方仅对此状态有界轮询；`failed` 返回 `OPERATION_FAILED`（500），需显示失败并由管理员决定是否 `retry`。任务不存在、不属于该反馈或待生成快照已过期时返回 `NOT_FOUND`（404），缺少导出权限返回 `FORBIDDEN`（403）。当前修订的生成快照过期后可重新 `export`；已完成 ZIP 的下载仍校验存储读取及 checksum。

按 `errorId` 查询时以错误锚点的来源、请求和序号取前后各最多 100 条日志；重叠窗口保留各自锚点，不按日志首次归属的 errorId 丢弃上下文。到期任务清理报告、证据、附件、历史及含快照的任务，并按对象前缀删除孤立上传 attempt。随后只保留不含现场的前缀/24 小时截止墓碑，反复清理迟到对象后删除；清理故障持续重试。

### 离线工具

```sh
hai feedback summary feedback-FB-1.zip
hai feedback inspect feedback-FB-1.zip
hai feedback evidence feedback-FB-1.zip --request-id req-1 --page 1 --page-size 20
hai feedback view feedback-FB-1.zip
```

`view` 只监听本机 loopback，使用随机路径和内置查看器，Ctrl+C 关闭；无需生产网络。程序也可从 `@h-ai/feedback/bundle` 使用 `createFeedbackBundle`、`readFeedbackBundle`、`summarizeFeedbackBundle`、`queryFeedbackBundle`，无需初始化反馈服务。

### 配置与错误

`FeedbackConfigSchema` 校验所有输入；主要配置为 appId、notificationMode、recipients、maxTotalBytes、notificationProvider、adminUrl、collectionTimeoutMs、workerIntervalMs、leaseMs、maxAttempts、retentionDays、envAllowlist 及附件/证据容量。通过 `HAI_FEEDBACK_*` 显式映射 YAML；浏览器只取得允许公开的采集策略，不能拿到 SMTP/S3 密钥。

领域错误使用 `HaiFeedbackError`，包括未初始化、配置、权限、找不到、冲突、容量及 checksum 失败。所有领域 API 先检查 `success`；HTTP 200 或 Promise 完成不代表反馈、上传或邮件成功。SMTP 受理不等于管理员收件箱已投递；不确定发送存在重发边界。

### 资源、配额与辅助服务故障

服务端错误窗口待写材料同时限制 3000 条、8 MiB 和 5 分钟；按最多 32 条/256 KiB 批量幂等写入，数据库失败指数退避到 30 秒，丢失保留 missing 原因。worker 空闲指数退避到 30 秒，本节点提交/重试/导出会唤醒；`workerIntervalMs:0` 由专用 worker 驱动。临时证据按 appId 每批最多 100 条清理，使用复合过期索引。

`maxReportsPerUserDay` 默认 20，`maxBytesPerUserDay` 默认 2 GiB，`maxStoredBytesPerScope` 默认 10 GiB，`maxExportsPerReport` 默认 5，`exportRetentionHours` 默认 24。受理在同一共享数据库事务中按数据库 UTC 日、app/scope/user 预留 `maxTotalBytes * (maxExportsPerReport + 1)` 字节，覆盖报告及历史 ZIP；受理时固定报告容量与导出数量，调高配置不突破既有预留；是保守容量预留，非磁盘实时计量。重复 submissionId 不重复计费，超限返回 `QUOTA_EXCEEDED`（429）且不创建报告或对象。成功到期删除报告才释放 scope 预留；日累计计数不退还。导出到期禁止下载并限批删对象，固定快照/创建时间与条件写复用同一个 ZIP，业务补采首次上传前冻结文件清单，重试不能变化 ID/内容制造无限对象。运维可查看 `hai_feedback_quotas` 的 scope 行（period=0）已预留量及到期 cleanup 任务积压；它不等于云存储账单。

参考管理台与 fullstack 的 feedback 启动失败仅使反馈不可用，30 秒独立重试且同类故障不重复输出告警；策略接口也返回 503。业务必需的数据库、缓存、IAM 和审计仍遵守原失败策略；不能捕获整个 runtime.start 后继续使用已经回滚的模块。关闭先停止反馈与重试任务，再释放借用依赖。

### console 通知的隐私边界

`consoleContent` 默认为 `metadata`：仅记录反馈编号、应用/版本/构建定位与采集状态，不输出说明、summary、附件、证据、通知正文或接收地址。需要通用脱敏摘要时显式设为 `summary`；通用脱敏不能识别所有业务秘密。该选项不需要 Reach，也不改变 disabled/reach 的通道语义。旧配置的 console 日志默认随本次升级收紧。

服务端环境证据与反馈受理共同提交；环境写入失败不留下已受理但缺失环境的半成品，相同 submissionId 可安全重试。管理界面用 `createFeedbackReview(...).retryReport(id)` 重试可恢复材料与失败通知/Webhook，控制器去重目标并传播失败，退出调用 close 阻止迟到请求继续编排。

## 开发测试

```sh
pnpm --filter @h-ai/feedback typecheck
pnpm --filter @h-ai/feedback lint
pnpm --filter @h-ai/feedback build
pnpm --filter @h-ai/feedback test
pnpm --filter @h-ai/cli test:scaffold-gates
# 上述构建完成后，运行真实 Chromium 离线查看/回放验收；不会重建 dist。
node packages/cli/tests/feedback-offline-browser.mjs
```

验收需分别核对单元/浏览器、SQLite/PG/MySQL、真实 S3 与 SMTP、多节点恢复和断网离线查看；构建或 mock 通过不能代替真实 Provider 和用户流程。应用接入与部署流程见[使用指南](../../docs/usage/README.md)。

## 许可证

Apache-2.0
