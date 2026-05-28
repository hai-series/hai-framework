---
applyTo: "**/*.svelte"
---

# Svelte 组件专属规范

> 编辑 `.svelte` 文件时自动激活。**仅记录 Svelte 组件层独有的规则**。
> 应用层通用规范（i18n、路由安全、localStorage、环境变量、@h-ai/ui 用法）见 [app-conventions.instructions.md](app-conventions.instructions.md)，不在此重复。

## 组件职责（Svelte 特有）

- 组件只负责**渲染 + 用户交互**，禁止写业务逻辑（DB / 加密 / 支付 / 网络调用）。
- 业务逻辑放在 `src/lib/services/` 或 `src/lib/stores/`，组件通过 import 调用。
- 副作用使用 Svelte 5 Runes：`$state` / `$derived` / `$effect`，禁止在模板中调用副作用函数。

## `{@html}` 安全（Svelte 独有指令）

- ❌ 禁止 `{@html userInput}` 渲染未经消毒的用户输入。
- 仅允许 `{@html}` 渲染**已经 sanitize** 的受控 HTML（Markdown 渲染器、SVG 图标等）。
- sanitize 调用必须在 services 层完成，组件只接受已清洗结果。

## 组件复用与放置

- @h-ai/ui 已有的组件**禁止重复实现**，必须直接复用。
- 应用专属组件放在 `src/lib/components/`，跨应用复用的组件提升到 @h-ai/ui。
- 组件 props 必须用 TypeScript 接口声明，**禁止 `any`**。

## Runes 与响应式

- 状态：`let count = $state(0)`，禁止用普通 `let` 表达可变响应状态。
- 派生：`$derived(...)` 优先于 `$effect` 写回赋值。
- `$effect` 只用于副作用（订阅 / 监听 / 清理），返回值用于 cleanup。

## Props 与事件

- Props 用 `let { foo, bar = defaultBar }: Props = $props()` 解构 + 默认值。
- 事件用 callback props（`onclick={...}`）而非旧的 `createEventDispatcher`。
