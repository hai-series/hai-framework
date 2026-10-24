# @h-ai/feedback

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

[框架首页](../../README.md)

## 简介

提供用户反馈、诊断现场、管理员处理与离线问题包。用户可以不填说明直接提交；反馈和结构化证据保存到关系型数据库，截图等附件进入私有对象存储，管理员通过邮件和管理界面处理。它不依赖通用 telemetry 服务。

## 核心功能清单

- 有界采集前后端日志、请求、错误、操作、版本与白名单环境信息；默认错误前后各最多 100 条。
- 数据库事务受理、提交/证据幂等、附件校验、独立的处理/采集/通知状态、持久化任务与租约恢复。
- 复用 `storage` 的 S3 和 `reach` 的 SMTP；首版要求 Reach DND 关闭，由 feedback 唯一持有通知重试，不等同邮件已投递。
- 浏览器截图、遮挡/标注、可选 rrweb 回放、失败重试与本地导出；`@h-ai/ui` 提供 `FeedbackModal`、`FeedbackList` 和 `FeedbackDetail`。
- 自包含 ZIP、SHA-256 校验、离线查看与按请求/错误/时间分页读取，不包含生产凭据。

## 使用入门

服务端先初始化 `core`，再检查 `reldb`、`storage`、`reach` 初始化结果，最后初始化 feedback。生产使用 PostgreSQL/MySQL、S3 私有桶和真实 SMTP，连接凭据由宿主私有配置提供；开发/隔离测试可使用非生产后端，但 Console Provider 不能证明邮件真实送达。

以下片段位于异步函数内，依赖已经初始化；`context` 必须由可信服务端认证和授权生成：

```ts
import { feedback } from '@h-ai/feedback'

const initialized = await feedback.init({
  appId: 'orders',
  appVersion: '1.0.0',
  recipients: ['admin@example.test'],
  notificationProvider: 'email',
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

默认 HTTP 接入来自 `@h-ai/serv/features/feedback` 的 `createFeedbackProcedures({ feedback, resolveContext })`。配合 `apiContract.feedback` 挂载；`resolveContext` 提供服务端确定的 `scopeId/userId/permissions`。普通提交用户只能补充自己的材料；管理权限分别为 `feedback:read/process/reopen/export`，客户端的租户 ID、requestId、附件名称不能作为授权。

范围、用户、应用及证据关联标识按精确字符串匹配，MySQL 的大小写、重音及尾空格排序规则不会放宽隔离。附件 ID 保留原值并区分大小写，接受 1–128 字符的有效 Unicode；ZIP 文件路径使用摘要生成，不能从附件 ID 或显示名称推导。非成对代理字符在受理前拒绝。

浏览器从 `@h-ai/feedback/client` 导入 `createFeedbackClient()`，通过 `init({ appId, actions })` 注入 typed API 的 submit、appendEvidence、completeCollection、upload。先调用 `prepare()` 固定现场，成功后再显示 `FeedbackModal`；`submit()` 返回受理回执，后台 `flush()` 续传。`close()` 释放监听器和记录器。Cookie 白名单、持久草稿与回放均由产品显式启用，凭证类值始终排除。

浏览器和服务端共用文本脱敏规则，覆盖常见凭据键、JSON/转义 JSON、Bearer/Basic 授权值；入库、API 与离线包保持同一脱敏结果。业务专有敏感字段仍应由宿主配置白名单和敏感区域标记。

完整客户端方法为 `init(config)`、`prepare/submit/flush/record/getDraft/annotate/addFiles/exportDraft(input?)/close`。将表单 `onfileschange` 连接 `addFiles` 后刷新草稿附件预览，用户便可在提交前标注、遮挡或删除新增图片。`data-feedback-action` 标记关键操作，`data-feedback-private` 遮挡敏感内容，`data-feedback-ignore` 排除反馈界面自身。首次发送后包络冻结；同一提交重试时修改输入会返回冲突并保留输入，可先本地导出。

`annotate(id, annotation)` 的坐标单位是浏览器解码后原图的像素。UI 的 `FeedbackAnnotation.rect` 使用 0–1 比例；在 `Image.decode()` 后，将 x/width 乘 `naturalWidth`、y/height 乘 `naturalHeight` 再调用 SDK。使用原图尺寸而非 CSS 显示尺寸，使 JPEG 方向与 SDK 解码一致；对象 URL 仍由创建方在替换或销毁时释放。

`captureConsole` 和 `persistDraft` 默认关闭；持久化启用时必须提供由宿主确定的非凭据用户/租户 `persistenceKey`。`keyScreenshots` 默认开启，仍受 `screenshot` 总开关控制；`maxKeyScreenshots` 默认 3、硬上限 5，`keyScreenshotThrottleMs` 默认 10000 毫秒。

自动截图由脱敏克隆 DOM 经 SVG foreignObject 重建可见页面。跨域图片、iframe、video 和尚未就绪的网络字体可能缺失；浏览器或 CSP 限制导致失败时明确标记 missing，用户仍可手动添加附件。

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

`FeedbackConfigSchema` 校验所有输入；主要配置为 appId、recipients、notificationProvider、adminUrl、collectionTimeoutMs、workerIntervalMs、leaseMs、maxAttempts、retentionDays、envAllowlist 及附件/证据容量。通过 `HAI_FEEDBACK_*` 显式映射 YAML；浏览器只取得允许公开的采集策略，不能拿到 SMTP/S3 密钥。

领域错误使用 `HaiFeedbackError`，包括未初始化、配置、权限、找不到、冲突、容量及 checksum 失败。所有领域 API 先检查 `success`；HTTP 200 或 Promise 完成不代表反馈、上传或邮件成功。SMTP 受理不等于管理员收件箱已投递；不确定发送存在重发边界。

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

验收需分别核对单元/浏览器、SQLite/PG/MySQL、真实 S3 与 SMTP、多节点恢复和断网离线查看；构建或 mock 通过不能代替真实 Provider 和用户流程。设计与任务入口：[方案](../../docs/feedback-module-design.md)、[任务清单](../../docs/feedback-tasks.md)。

## 许可证

Apache-2.0
