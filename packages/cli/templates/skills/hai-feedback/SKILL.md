---
name: hai-feedback
description: "接入 @h-ai/feedback 用户反馈、业务异步证据、Webhook、管理员处理、独立通知与离线诊断包。"
---

# hai-feedback

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 用户低门槛反馈、有界诊断证据、私有附件、分页处理、通知和离线分析 |
| 适用场景 | 收集问题、接入反馈 UI/API、管理处理或分析自包含问题包 |
| 输入 | 已初始化 reldb/storage，Reach 仅在 reach 模式需要、feedback 配置、可信用户范围、可选用户说明 |
| 输出 | HaiResult、受理编号、独立材料/通知状态、受权证据及离线 ZIP |
| 限制 | 采集与 UI 解耦；默认不保存凭证或全量 Cookie/环境变量；页面回放不等同重新执行；不依赖通用 telemetry |

普通业务仍使用 `transport.maxPlaintextBytes`（auto/省略为 1 MiB）；Feedback 的报告受理、证据、附件及 ZIP 下载路由通过 `routePlaintextBytes` 单独声明由已校验反馈配置派生的 `maxTransportBytes`，不依赖反馈初始化/重试状态。路径中的 `*` 仅匹配一个完整路径段；宿主显式路由值优先。握手、adapter-node 与代理使用各路由最大容量，普通业务不会随材料预算扩大。HTTP 适配器为单独声明且大于 1 MiB 的材料路由保留最多 2 个槽，普通业务另有 16 个槽，完整响应/失败后释放；忙碌返回 503 / `hai:crypto:072`，不自动重放业务写入。

宿主启动时用 `@h-ai/api-contract/feedback` 的 `resolveFeedbackBudget(已校验反馈配置)` 预计算材料路由容量，不读取未就绪反馈模块的默认 `budget`；可选反馈失败/重试不改变普通业务上限或已配置材料容量。

## 使用路径

1. 先初始化 core、reldb 和私有 storage。notificationMode 选择 disabled/console/reach；console 默认仅输出 metadata，摘要需 consoleContent: summary 显式启用，无邮箱或 Reach 依赖；reach 模式才要求已初始化 Provider/recipients。默认 reach，生成项目显式 console。DND 由 feedback 自己的 outbox 等待，不进入 Reach 延迟队列，也不改全局通知策略。最后 feedback.init(config, { collectEvidence? })，关闭先于依赖。
2. 挂载 apiContract.feedback 与 createFeedbackProcedures；resolveContext 从服务端确定 scopeId、userId、permissions，不能相信客户端的租户、requestId 或 S3 key。创建者可补自己的材料，管理操作另检查 read/process/reopen/export。
3. createFeedbackClient 的 actions 接 typed API，policy 读取 reports.policy({})；prepare 后打开 FeedbackModal。getView() 提供附件 URL/证据/预算；annotate 支持 coordinateSpace: ratio，saveDraft 负责跨端保存，业务不自行解码图片或管理 Blob URL。onfileschange 接 addFiles 后刷新视图；首次包络冻结，重试编辑冲突保留输入。
4. FeedbackModal 内材料独立滚动、操作栏常驻；FeedbackList 不重复显示标题，由宿主提供页面标题。复用 FeedbackList/FeedbackDetail，服务端分页并按需加载材料；setStatus 带 expectedVersion。处理、材料、通知状态分别展示，上传或通知失败不抹掉已受理反馈。
5. 同一 submissionId 和证据来源/序号重试，持久化 ACK 前不释放待传材料。附件取实际 checksum，不保存公开 URL；数据库、对象存储与外部通知通道无共同事务，依靠持久任务和补偿核对。
6. 普通界面导出只传 id，由服务端当前事务固定证据快照；只有用户显式选择历史修订时才传 evidenceRevision，不沿用列表中的陈旧修订。导出固定证据修订；getExport 仅在有效快照 pending/running 时返回 CONFLICT/409，调用方只对此状态有界轮询；failed 为 OPERATION_FAILED/500，缺失/归属不符/未完成快照过期为 NOT_FOUND/404，缺少导出权限为 FORBIDDEN/403。当前修订快照过期可重新 export。离线包包含附件/查看器/索引/checksum，开发侧不持有生产凭据。用 hai feedback summary/inspect/evidence/view 或 /bundle 入口读取，不能执行导入包自带的任意脚本。
7. 验证正常、越权、容量、崩溃、断线、重复提交、租约接管和离线查看；明确真实 S3/SMTP 与 mock 的不同证据。
8. errorId 按锚点 source/request/sequence 查询前后各100条日志，不以首次归属丢弃重叠窗口上下文。到期删除报告、证据、附件、历史及含快照的任务，按前缀删除孤立 attempt；只保留前缀/24小时截止的最小墓碑清扫迟到对象，完成后删除，清理失败持续重试。

范围/用户/应用和证据关联 ID 精确匹配，不能依赖 MySQL 默认排序规则放宽相等。附件 ID 为区分大小写的有效 Unicode（1–128 字符）；ZIP 路径由摘要生成，读取 manifest 中的路径，不从 ID 或名称推导。文本脱敏覆盖常见凭据键、JSON/转义 JSON、Bearer/Basic，业务专有敏感内容仍需宿主白名单与 DOM 标记。

构建标识来自实际产物的 appVersion/buildId/commit，浏览器不能使用服务端返回的版本。CLI/base/API/fullstack 模板在编译时内联，Docker 经 build args 传入；每个目标读取自己的 package.json，同一 SSR 的 client/server 共享 buildId，无所属 Git 提交时明确 unknown。模板的 build-metadata.json 只记录这三个非敏感字段。验收需把反馈 API/ZIP 中前后端证据分别与对应产物、manifest、实际源码提交核对，不能只比较两个空值或只检查旁证文件。

annotate(id, { ...rect, mode, coordinateSpace: 'ratio' }) 直接接受 UI 的 0–1 坐标，SDK 按解码后的原图换算；省略该字段仍为像素。小数、微小、边缘、反向拖动和缩放均须验收。getView 管理预览，替换、删除和关闭时释放 URL。

草稿由 SDK 持有并通过 annotate/addFiles 等方法更新；Svelte 保存引用时使用 `$state.raw<FeedbackDraft>()`，操作成功后从 getDraft() 刷新附件视图。不要把该草稿放入深度 `$state` 代理，避免 SDK 替换图片字节后视图继续读取代理缓存的旧 bytes。

text/plain 附件在 5 MiB 范围内全文脱敏并保留安全正文，超限原文件在读取前拒绝，脱敏后字节数也不能超限；在线上传与冻结草稿后的本地追加采用同一规则。JSON 附件和结构化证据仍遵守字段长度、深度与数量限制，不能把证据字段的截断策略用于普通日志文件。

addFiles 按批次原子加入附件：任一文件失败不改变原草稿的附件或缺失标记，也不保存半批材料；成功后合并最新草稿，保留并发批次新增且总数最多 20 项。读取期间草稿切换或首次提交已冻结则返回 CONFLICT，调用方保留待选输入并让用户重新准备，不得在界面删除后继续上传隐藏文件。

并发 `init` 返回 `INIT_IN_PROGRESS`；`close` 等待有界截图退出后清理会话。截图期间关闭使 `prepare` 返回失败，不复活草稿。异步标注完成时若草稿已冻结、关闭、删除图片或被另一标注更新，则返回 `CONFLICT`，不改变已提交附件的字节或 checksum。

captureConsole/persistDraft/keyScreenshots 默认 false；持久化启用时由宿主提供非凭据用户/租户 persistenceKey。关键截图受 screenshot 总开关控制，maxKeyScreenshots 默认3/上限5，keyScreenshotThrottleMs 默认10000ms。data-feedback-action 标记关键操作，data-feedback-private 遮挡敏感区域，data-feedback-ignore 排除反馈界面自身。回放、普通 Cookie 白名单和持久化由产品明确启用。

自动截图使用 html2canvas 渲染遮挡后的克隆 DOM；跨域图片、iframe/video、未就绪网络字体可能缺失。浏览器或 CSP 限制失败时标 missing 并保留手动附件入口。

本地附件支持 PNG/JPEG/WebP、WebM/MP4、TXT/LOG、JSON、PDF、ZIP/GZ/TGZ；空 MIME 或 application/octet-stream 按受支持扩展名识别，常见别名规范化，服务端仍校验实际字节/checksum。普通输入框截图保留底色与边框，内容替换为固定遮罩字符；密码框、data-feedback-private、rr-block/rr-mask 整块遮挡。原 DOM/输入值不变，页面回放仍 maskAllInputs。验证须覆盖本地选择、实际上传、离线导出及普通/私密控件的截图像素。

## 业务补采与 Webhook

- 用 init 的第二参数 collectEvidence({ report, signal })，直接返回或 await `{ text?, data?, attachments?: [{ id, name, contentType, bytes: Uint8Array }] }`。持久 collect 任务在受理后执行，无须进程内事件总线或另建通知队列；所有同 appId 实例必须注册相同函数。按 report.id 幂等并将 signal 传给异步 I/O；businessCollectionTimeoutMs 默认 30000ms（1–300000），关闭/超时停止等待。
- text/data 作为 server:business 来源的 business 证据，FeedbackDetail 的“业务信息”页签分页展示；成功标记入库后不重复采集；附件全部保存后在持有租约的同一事务关联，详情和离线包均可读取。失败按 maxAttempts 重试并显示 collecting/failed，管理员 retry target: collect。附件 ID 稳定且 1–100 字符，server:business: 前缀由框架保留；所有附件共用 20 项和容量预算。TXT 全文脱敏；ZIP/GZIP 不解压、执行或内部脱敏，业务须压缩前脱敏。
- webhookUrl 默认空（禁用）；配置可信 HTTP(S) 目的地后独立持久 webhook 任务等待采集终态（包括失败），发送 feedback.created。notificationMode/Reach/DND 不控制 Webhook。webhookSecret 用服务端私有环境；webhookTimeoutMs 默认 10000ms（1–60000）。只接受 2xx，不跟随重定向，失败指数退避到 60s、最多 maxAttempts。
- FeedbackWebhookEvent 包含 event/eventId/createdAt/report/evidence/detailUrl?；evidence 只有修订、业务采集成功和附件元数据，无正文、存储 key 或配置凭据。首次发送冻结载荷，重试/重启复用正文及 Idempotency-Key: eventId，接收方按此持久去重；至少一次投递。旧任务的 URL 与新配置不一致会失败，不自动转投。
- 署名头 X-Hai-Feedback-Signature = sha256=HMAC-SHA256(secret, X-Hai-Feedback-Timestamp + '.' + 原始正文)，时间戳为 Unix 秒；接收方验证原始字节、恒定时间比较、时间偏差并防重放。get().jobs 提供 webhook 状态/attempts/安全 lastError；FeedbackDetail.webhook 传对应任务，管理员 retry target: webhook，需要 feedback:process 权限。
- YAML/环境映射同步 HAI_FEEDBACK_BUSINESSCOLLECTIONTIMEOUTMS、HAI_FEEDBACK_WEBHOOKURL、HAI_FEEDBACK_WEBHOOKSECRET、HAI_FEEDBACK_WEBHOOKTIMEOUTMS。函数不放 YAML 或 PUBLIC_；示例见已安装模块 README 的业务证据与 Webhook 章节。

Web 不导入原生插件。原生入口分别为 @h-ai/feedback/tauri 与 /capacitor，启动时 configureFeedbackSaving(saveTauriFeedbackFile/saveCapacitorFeedbackFile)，生成工程自动配置。平台适配拥有保存对话框、缓存与取消清理；业务仅调用 SDK。

## 资源与可用性约束

- 未提交或采集完成后不进行后台补传；临时故障（网络、5xx、408、429）按 1/2/4/8/16 秒退避，连续六次失败暂停，其他 4xx 立即暂停。材料保持不变，显式 flush/prepare 恢复；禁止在页面每秒调用 flush 绕过退避。退出身份必须 await close({ discard:true })，只等待在途请求、不再补传旧材料。验收空闲、持续故障、恢复和退出期间的请求次数与身份隔离。

- `keyScreenshots` 默认 false，需显式开启自动关键截图；手动 `prepare()` 仍可截图。截图超时会传递 AbortSignal，底层尚未结束时不允许重叠截图。默认渲染最多 10000 DOM 节点，继续受画布像素预算限制。`replay:true` 的默认 `replayStart` 为 `prepare`，打开反馈时才录制；明确需要预录时配置 `replayStart: init`。关闭反馈界面调用 `pause()` 停止 DOM 回放和截图，保留轻量日志、草稿及上传；退出身份仍调用 `close({ discard:true })`。自定义 `captureScreenshot({ signal })` 应尊重取消信号。
- 反馈是可选辅助能力，启动失败须独立标记不可用/重试；不能回滚或拖垮业务模块。服务端默认按用户日累计及 scope 存储预留限制，超额为 QUOTA_EXCEEDED/429；默认值和保守预留公式见已安装 README。固定业务文件清单、ZIP 快照和创建时间，重试不能制造新对象；导出24小时过期、报告默认30天保留，专用 worker 必须持续执行清理。不要增加正常空闲或逐请求 info 日志。

## 按需参考

- 已安装包的 README 和公开 /client、/bundle、api-contract/feedback、serv/features/feedback 类型。
- 数据库、对象存储和通知分别读取 [hai-reldb](../hai-reldb/SKILL.md)、[hai-storage](../hai-storage/SKILL.md)、[hai-reach](../hai-reach/SKILL.md)。
- 带前端的工程按其 `hai-ui` Skill 复用界面组件；纯 API 只接入服务端能力。验证遵循[分轮流程](../hai-app-tests/validation.md)。

反馈交互：当前截图优先；FeedbackModal.oncapture 连接 captureScreenshot(id?)，选择时隐藏弹窗，允许换页后补图/替换并保留输入。FeedbackForm.evidence 展开实际脱敏内容，不能把全部事件数量称作日志。onfileschange 接入后支持用户主动无声短录屏（60秒/5 MiB），视频不自动遮挡，必须支持预览/删除；停止共享、取消、超时和销毁释放流。WebM/MP4 的私有读授权、容器字节/checksum 校验、上传和离线查看须一并验证。

参考管理台和 feedback fullstack 模板显式 replay:true；SDK 缺省仍为 false。FeedbackDetail.onreplay 必须按需取得 kind:replay 的全部分页，详情“页面回放”提供播放/定位与无记录提示；原始录屏在操作现场播放。保存反馈到本地后用 hai feedback view <zip> 查看；本地包标记尚未取得的服务端证据。环境只展示实际构建/页面与服务端 envAllowlist 非凭据键，不能臆造全量环境已采集。

保存与退出：saveDraft 及 saveFeedbackFile 选择 Web 下载、Tauri 原生保存、Capacitor 缓存分享，取消返回 cancelled；生成原生工程配置 optional peer 插件及最小权限。createFeedbackReview(typedClient.feedback.reports) 负责全部回放分页、导出轮询及 retryReport(id) 失败任务重试；退出身份调用 review.close()、client.close({ discard: true }) 清理采集、草稿、预览和旧轮询。服务端环境只采实际 envAllowlist 非敏感值；verificationCode/otpCode 等默认脱敏，不把数目当材料正文。

服务策略不可用时仍可本地准备/保存，明确 server-policy-unavailable；在线提交重新校验，不能以本地预算伪装服务端受理成功。onfileschange 的第二参数 removedAttachmentIds 透传 addFiles，删除与新增原子合并且按有效容量检查。

Reach 为 optional peer，console/disabled 不安装或初始化它；reach 模式须显式安装并初始化 @h-ai/reach。凭据通知只有安全 receiptId，不保存/回传 Provider messageId。
