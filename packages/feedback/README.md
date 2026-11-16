# @h-ai/feedback

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

[框架首页](../../README.md)

提供用户反馈、诊断现场、管理员处理与离线问题包。用户可以不填说明直接提交；反馈和结构化证据保存到关系型数据库，截图等附件进入私有对象存储，管理员通过邮件和管理界面处理。它不依赖通用 telemetry 服务。

## 快速开始

服务端先初始化 Core、RelDB 和私有 Storage。使用 Reach 投递时，还需先初始化 Reach。

示例在应用启动时初始化模块。提交函数接收可信服务端生成的 `context` 和客户端为本次提交生成的 `submissionId`。

```ts
import type { FeedbackContext } from '@h-ai/feedback'
import { feedback } from '@h-ai/feedback'

// 启动 orders 的反馈服务。此处选择在开发控制台记录反馈通知。
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

应用退出时先检查 `await feedback.close()` 的结果，再关闭依赖。重试提交使用同一个 `submissionId`。

浏览器采集、HTTP 路由和附件补传见[功能说明](../../docs/usage/function/feedback.md)。

## 配置清单

生成的项目在 `config/_feedback.yml` 中设置应用标识和反馈通知设置。应用启动代码读取该文件，把配置对象传给 `feedback.init(config, options)`。

在[模块配置清单](../../docs/usage/configuration/feedback.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

在[功能说明](../../docs/usage/function/feedback.md)中查看调用示例、输入输出、错误处理与使用要点。

- `feedback.init` / `feedback.close` / `feedback.isInitialized` / `feedback.config` / `feedback.budget` — 启动和关闭服务，查看反馈配置和每份反馈的附件、证据限额
- `feedback.submit` / `feedback.uploadAttachment` / `feedback.getAttachment` / `feedback.appendEvidence` / `feedback.completeCollection` — 提交反馈、保存或下载附件，并补交收集到的现场信息
- `feedback.list` / `feedback.get` / `feedback.getEvidence` / `feedback.setStatus` / `feedback.retry` / `feedback.runJobs` / `feedback.export` / `feedback.getExport` — 查询、处理、重试和导出
- `feedbackClient`（`@h-ai/feedback/client`） — 浏览器从此入口采集和提交诊断信息。离线包通过 `@h-ai/feedback/bundle` 读取。`@h-ai/feedback/capacitor` 和 `@h-ai/feedback/tauri` 提供各自的原生文件保存函数

## 数据结构

查看[数据结构](../../docs/usage/data/feedback.md)，了解反馈、证据、动作用队列、附件、离线包和浏览器草稿。

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

验收需分别核对单元/浏览器、SQLite/PG/MySQL、真实 S3 与 SMTP、多节点恢复和断网离线查看；构建或 mock 通过不能代替真实 Provider 和用户流程。应用接入与部署流程见[使用指南](../../docs/usage/README.md).

## 许可证

Apache-2.0
