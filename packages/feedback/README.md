# @h-ai/feedback

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

[框架首页](../../README.md)

提供用户反馈、诊断现场、管理员处理与离线问题包。用户可以不填说明直接提交；反馈和结构化证据保存到关系型数据库，截图等附件进入私有对象存储，管理员通过邮件和管理界面处理。它不依赖通用 telemetry 服务。

## 快速开始

使用 pnpm 安装：`pnpm add @h-ai/feedback @h-ai/reldb @h-ai/storage`。

[跟着最小示例完成接入](../../docs/usage/function/feedback.md#quick-start)。 [依赖与接入顺序](../../docs/usage/function/feedback.md#module-dependencies)。

## 配置清单

生成的项目在 `config/_feedback.yml` 中设置应用标识和反馈通知设置。应用启动代码读取该文件，把配置对象传给 `feedback.init(config, options)`。

在[模块配置清单](../../docs/usage/configuration/feedback.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

[查 API 清单](../../docs/usage/function/feedback.md#api-reference)，包含调用入口、输入、返回值和用法。

`feedback.listMine` 提供当前作者的报告分页。本人和管理列表都可按类别筛选。通知、补采与回放的恢复边界见[功能说明](../../docs/usage/function/feedback.md#service)，未补传材料可先[保存到本地](../../docs/usage/function/feedback.md#browser-capture)。

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
