# @h-ai/ui

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/core](../core/README.md)

内置中英日文消息（`zh-CN` / `en-US` / `ja-JP`），语言选择器默认提供三种语言。

基于 Svelte 5 Runes 的多端 UI 组件库，采用 DaisyUI v5 + Tailwind CSS v4 样式 + Bits UI v2 headless 交互，内置 i18n（zh-CN / en-US / ja-JP），提供 15 个精选 DaisyUI 主题以及高对比、直角商务、护眼和液态玻璃主题。

HTTP/UI 边界只对明确的有效 4xx 状态公开业务提示；错误缺少 `httpStatus` 或状态非法时按 500 返回安全提示。手写业务错误须提供完整错误定义或显式状态，不能依赖缺省状态展示原文。

## 快速开始

使用 pnpm 安装：`pnpm add @h-ai/ui`。

[跟着最小示例完成接入](../../docs/usage/function/ui.md#quick-start)。 [依赖与接入顺序](../../docs/usage/function/ui.md#module-dependencies)。

## 配置清单

本模块没有独立的运行配置文件。文件归属见[配置说明](../../docs/usage/configuration/ui.md)，调用参数或响应结构见[参考页](../../docs/usage/function/ui.md#call-options)。

## 功能说明

[查 API 清单](../../docs/usage/function/ui.md#api-reference)，包含调用入口、输入、返回值和用法。

从[组件图鉴](../../docs/usage/function/ui.md#component-catalog)浏览每个公开组件的用途、Svelte 用法和截图。

[主题切换](../../docs/usage/function/ui.md#theme)支持通过现有选择器应用浅色液态玻璃主题（`liquid-glass`）并保存偏好。宿主可通过 `ThemeSelector` 的 `themeIds` 限定可选的内置主题。

[工具与产物工作台](../../docs/usage/function/ui.md#工具与产物工作台)提供参数表单、示例、任务进度、文档编辑、版本冲突与媒体预览；应用只需连接已授权的读写和执行回调。

<a id="代码工作区"></a>

[代码工作区](../../docs/usage/function/ui.md#代码工作区)
私有 Markdown 可使用 [图片策略与源码选区](../../docs/usage/function/ui.md#private-document-media)控制网络图片并定位用户选择的原文。


[调度输入](../../docs/usage/function/ui.md#schedule-input)复用日期选择器，支持 IANA 时区、分钟精度和五段 Cron。

[预览已授权文件](../../docs/usage/function/ui.md#file-preview)

## 数据结构

模块没有自建数据库表。

查看[数据结构](../../docs/usage/data/ui.md)，查阅主题、语言和引导进度保存在浏览器的什么位置。

## 开发测试

```sh
pnpm --filter @h-ai/ui typecheck
pnpm --filter @h-ai/ui check
pnpm --filter @h-ai/ui lint
pnpm --filter @h-ai/ui build
pnpm --filter @h-ai/ui test
```

## 许可证

Apache-2.0
