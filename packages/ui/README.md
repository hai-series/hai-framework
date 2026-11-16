# @h-ai/ui

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/core](../core/README.md)

内置中英日文消息（`zh-CN` / `en-US` / `ja-JP`），语言选择器默认提供三种语言。

基于 Svelte 5 Runes 的多端 UI 组件库，采用 DaisyUI v5 + Tailwind CSS v4 样式 + Bits UI v2 headless 交互，内置 i18n（zh-CN / en-US / ja-JP），内置 15 个精选 DaisyUI 主题、高对比、直角商务及护眼主题。

HTTP/UI 边界只对明确的有效 4xx 状态公开业务提示；错误缺少 `httpStatus` 或状态非法时按 500 返回安全提示。手写业务错误须提供完整错误定义或显式状态，不能依赖缺省状态展示原文。

## 快速开始

[跟着最小示例完成接入](../../docs/usage/function/ui.md#最小接入示例)。

## 配置清单

在 Svelte 页面中给组件传入属性（props），例如给表格指定列和数据。应用级的主题、语言和新手引导分别从 `@h-ai/ui/theme`、`@h-ai/ui/i18n` 和 `@h-ai/ui/guide` 使用。

在[模块配置清单](../../docs/usage/configuration/ui.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

[查 API 清单](../../docs/usage/function/ui.md#api-reference)，包含调用入口、输入、返回值和用法。

[工具与产物工作台](../../docs/usage/function/ui.md#工具与产物工作台)提供参数表单、示例、任务进度、文档编辑、版本冲突与媒体预览；应用只需连接已授权的读写和执行回调。

<a id="代码工作区"></a>

[代码工作区](../../docs/usage/function/ui.md#代码工作区)

## 数据结构

模块没有自建数据库表。

查看[数据结构](../../docs/usage/data/ui.md)，查阅主题、语言和引导进度保存在浏览器的什么位置。

## 开发测试

```sh
pnpm --filter @h-ai/ui typecheck
pnpm --filter @h-ai/ui lint
pnpm --filter @h-ai/ui build
pnpm --filter @h-ai/ui test
```

## 许可证

Apache-2.0
