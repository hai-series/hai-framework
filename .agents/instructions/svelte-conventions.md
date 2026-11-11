# Svelte 组件专属规范

> 适用于 `.svelte` 文件的修改。**仅记录 Svelte 组件层独有的规则**。
> 应用层通用规范（i18n、路由安全、localStorage、环境变量、@h-ai/ui 用法）见 [app-conventions.md](app-conventions.md)，不在此重复。

## 组件职责（Svelte 特有）

- SvelteKit 3 的配置统一写入 `vite.config.ts` 的 `sveltekit({...})`；纯 Svelte/Vite 才保留 `svelte.config.js`。应用内部从 `package.json#imports` 声明的 `#lib/*` 导入，并写 `.js` / `.svelte` 扩展名；环境标记用 `$app/env`。
- 路由/资产使用 `$app/paths` 的 `resolve` / `asset`。需要将构建前缀交给 HTTP、认证或加密管道时，宿主显式配置 `paths.relative: false`，再从 `resolve('/').replace(/\/$/, '')` 获取前缀，使用得到的绝对挂载目录作为服务前缀。

- 组件只负责**渲染 + 用户交互**，禁止写业务逻辑（DB / 加密 / 支付 / 网络调用）。
- 业务逻辑放在 `src/lib/services/` 或 `src/lib/stores/`，组件通过 import 调用。
- `$state` 管理状态、`$derived` 计算派生值、`$effect` 管理副作用；禁止在模板求值期间执行副作用。

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
