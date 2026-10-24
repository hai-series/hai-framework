---
name: hai-feedback
description: "接入 @h-ai/feedback 用户反馈、前后端现场、管理员处理、邮件通知与离线诊断包。"
---

# hai-feedback

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 用户低门槛反馈、有界诊断证据、私有附件、分页处理、通知和离线分析 |
| 适用场景 | 收集问题、接入反馈 UI/API、管理处理或分析自包含问题包 |
| 输入 | 已初始化 reldb/storage/reach、feedback 配置、可信用户范围、可选用户说明 |
| 输出 | HaiResult、受理编号、独立材料/通知状态、受权证据及离线 ZIP |
| 限制 | 采集与 UI 解耦；默认不保存凭证或全量 Cookie/环境变量；页面回放不等同重新执行；不依赖通用 telemetry |

## 使用路径

1. 先初始化 core 与 reldb/storage/reach，逐步检查 success；生产采用共享数据库、S3 私有桶和真实 SMTP。首版要求 reach 的全局 DND 关闭，feedback 独占通知 outbox；已有 queueId/get 不代表 enqueue 与反馈回执能原子提交。最后 feedback.init，关闭时 feedback 在依赖之前关闭。
2. 挂载 apiContract.feedback 与 createFeedbackProcedures；resolveContext 从服务端确定 scopeId、userId、permissions，不能相信客户端的租户、requestId 或 S3 key。创建者可补自己的材料，管理操作另检查 read/process/reopen/export。
3. 浏览器 createFeedbackClient 通过 init(config) 的 actions 注入 typed API。方法为 prepare/submit/flush/record/getDraft/annotate/addFiles/exportDraft(input?)/close。先 prepare 固定现场，再显示可空说明的 FeedbackModal；onfileschange 先 addFiles、刷新预览后才能标注/遮挡/删除新图片。首次发送包络冻结，重试时编辑冲突必须保留输入。
4. 复用 FeedbackList/FeedbackDetail，服务端分页并按需加载材料；setStatus 带 expectedVersion。处理、材料、邮件状态分别展示，上传或通知失败不抹掉已受理反馈。
5. 同一 submissionId 和证据来源/序号重试，持久化 ACK 前不释放待传材料。附件取实际 checksum，不保存公开 URL；数据库/S3/SMTP 无共同事务，依靠持久任务和补偿核对。
6. 普通界面导出只传 id，由服务端当前事务固定证据快照；只有用户显式选择历史修订时才传 evidenceRevision，不沿用列表中的陈旧修订。导出固定证据修订；getExport 仅在有效快照 pending/running 时返回 CONFLICT/409，调用方只对此状态有界轮询；failed 为 OPERATION_FAILED/500，缺失/归属不符/未完成快照过期为 NOT_FOUND/404，缺少导出权限为 FORBIDDEN/403。当前修订快照过期可重新 export。离线包包含附件/查看器/索引/checksum，开发侧不持有生产凭据。用 hai feedback summary/inspect/evidence/view 或 /bundle 入口读取，不能执行导入包自带的任意脚本。
7. 验证正常、越权、容量、崩溃、断线、重复提交、租约接管和离线查看；明确真实 S3/SMTP 与 mock 的不同证据。
8. errorId 按锚点 source/request/sequence 查询前后各100条日志，不以首次归属丢弃重叠窗口上下文。到期删除报告、证据、附件、历史及含快照的任务，按前缀删除孤立 attempt；只保留前缀/24小时截止的最小墓碑清扫迟到对象，完成后删除，清理失败持续重试。

范围/用户/应用和证据关联 ID 精确匹配，不能依赖 MySQL 默认排序规则放宽相等。附件 ID 为区分大小写的有效 Unicode（1–128 字符）；ZIP 路径由摘要生成，读取 manifest 中的路径，不从 ID 或名称推导。文本脱敏覆盖常见凭据键、JSON/转义 JSON、Bearer/Basic，业务专有敏感内容仍需宿主白名单与 DOM 标记。

构建标识来自实际产物的 appVersion/buildId/commit，浏览器不能使用服务端返回的版本。CLI/base/API/fullstack 模板在编译时内联，Docker 经 build args 传入；每个目标读取自己的 package.json，同一 SSR 的 client/server 共享 buildId，无所属 Git 提交时明确 unknown。模板的 build-metadata.json 只记录这三个非敏感字段。验收需把反馈 API/ZIP 中前后端证据分别与对应产物、manifest、实际源码提交核对，不能只比较两个空值或只检查旁证文件。

SDK 的 annotate(id, annotation) 使用浏览器解码后原图的像素；UI FeedbackAnnotation.rect 使用 0–1 比例。宿主应在 Image.decode() 后，将 x/width 乘 naturalWidth、y/height 乘 naturalHeight，不能使用 CSS 显示尺寸；这样与 SDK 的 JPEG 方向和图像尺寸一致。附件元数据没有 width/height 字段，不臆造该能力；对象 URL 由创建方在替换或销毁时释放。

草稿由 SDK 持有并通过 annotate/addFiles 等方法更新；Svelte 保存引用时使用 `$state.raw<FeedbackDraft>()`，操作成功后从 getDraft() 刷新附件视图。不要把该草稿放入深度 `$state` 代理，避免 SDK 替换图片字节后视图继续读取代理缓存的旧 bytes。

text/plain 附件在 5 MiB 范围内全文脱敏并保留安全正文，超限原文件在读取前拒绝，脱敏后字节数也不能超限；在线上传与冻结草稿后的本地追加采用同一规则。JSON 附件和结构化证据仍遵守字段长度、深度与数量限制，不能把证据字段的截断策略用于普通日志文件。

addFiles 按批次原子加入附件：任一文件失败不改变原草稿的附件或缺失标记，也不保存半批材料；成功后合并最新草稿，保留并发批次新增且总数最多 20 项。读取期间草稿切换或首次提交已冻结则返回 CONFLICT，调用方保留待选输入并让用户重新准备，不得在界面删除后继续上传隐藏文件。

单附件 5 MiB 原始字节经 Base64 后约需 6.67 MiB，另需 JSON 空间；参考管理台和启用 feedback 的新 API/fullstack 项目在既有 kit.transport.maxPlaintextBytes 或 serv.transport.maxPlaintextBytes 配置 8388608（8 MiB），框架全局默认仍为 1 MiB。客户端缺省随服务端握手，显式较小本地上限仍可拒绝。8 MiB 平文推导加密请求体预算 16,809,984 字节，生产 adapter-node BODY_SIZE_LIMIT 与代理须匹配，未启用加密时按实际 JSON 大小设置；框架部署自动推导，不新增 feedback 配置/API。hai add 保留宿主已有配置，需宿主显式调整。

captureConsole/persistDraft 默认 false；持久化启用时由宿主提供非凭据用户/租户 persistenceKey。keyScreenshots 默认 true，受 screenshot 总开关控制，maxKeyScreenshots 默认3/上限5，keyScreenshotThrottleMs 默认10000ms。data-feedback-action 标记关键操作，data-feedback-private 遮挡敏感区域，data-feedback-ignore 排除反馈界面自身。回放、普通 Cookie 白名单和持久化由产品明确启用。

自动截图从脱敏克隆 DOM 经 SVG foreignObject 重建可见页面；跨域图片、iframe/video、未就绪网络字体可能缺失。浏览器或 CSP 限制失败时标 missing 并保留手动附件入口。

## 按需参考

- 已安装包的 README 和公开 /client、/bundle、api-contract/feedback、serv/features/feedback 类型。
- 数据库、对象存储和通知分别读取 [hai-reldb](../hai-reldb/SKILL.md)、[hai-storage](../hai-storage/SKILL.md)、[hai-reach](../hai-reach/SKILL.md)。
- UI 复用 [hai-ui](../hai-ui/SKILL.md)，验证遵循 [分轮流程](../hai-app-tests/validation.md)。
