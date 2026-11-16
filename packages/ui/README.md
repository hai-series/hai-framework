# @h-ai/ui

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/core](../core/README.md)

内置中英日文消息（`zh-CN` / `en-US` / `ja-JP`），语言选择器默认提供三种语言。

基于 Svelte 5 Runes 的多端 UI 组件库，采用 DaisyUI v5 + Tailwind CSS v4 样式 + Bits UI v2 headless 交互，内置 i18n（zh-CN / en-US / ja-JP），内置 15 个精选 DaisyUI 主题、高对比、直角商务及护眼主题。

HTTP/UI 边界只对明确的有效 4xx 状态公开业务提示；错误缺少 `httpStatus` 或状态非法时按 500 返回安全提示。手写业务错误须提供完整错误定义或显式状态，不能依赖缺省状态展示原文。

## 快速开始

### 安装

```bash
npm install @h-ai/ui @h-ai/core
```

Node 服务端工程将 UI 与 core 都列为生产依赖，确保适配器保留 core 的日志和原生依赖加载。

### 1. 配置 package.json 的应用导入

```json
{ "imports": { "#lib/*": "./src/lib/*" } }
```

### 2. 配置 vite.config.ts

SvelteKit 3 的预处理、编译器与适配器都在 Vite 插件中配置；纯 Svelte/Vite 工程才保留 svelte.config.js。

预处理顺序为 `vitePreprocess()` 或其他样式/模板语言转换在前、`autoImportHaiUi()` 在后。自动导入读取整份 Svelte AST，不直接接受尚未转换的 SCSS、Pug 等非标准语法；保留同步调用方式。

```ts
import { autoImportHaiUi } from '@h-ai/ui/auto-import'
import { haiOptimizeExclude, haiPrebundledDeps } from '@h-ai/ui/vite'
import adapter from '@sveltejs/adapter-node'
import { sveltekit } from '@sveltejs/kit/vite'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    sveltekit({
      preprocess: [
        vitePreprocess(),
        autoImportHaiUi()
      ],
      compilerOptions: { runes: true },
      adapter: adapter(),
      paths: { relative: false },
    }),
    tailwindcss(),
  ],
  optimizeDeps: {
    exclude: [...haiOptimizeExclude],
    include: [...haiPrebundledDeps]
  },
  ssr: {
    noExternal: ['@h-ai/ui', '@h-ai/kit'],
    external: ['@h-ai/core', 'sm-crypto']
  },
})
```

### 3. 配置 src/app.css

使用 Crypto 或依赖它的 Kit/IAM 时，应用生产依赖需包含 `sm-crypto@0.5.8`。CLI 已配好这一项；手工接入时运行 `pnpm add sm-crypto@0.5.8`。仅设置 external 不够，adapter-node 还需要直接生产依赖声明才能保留原包加载。

```css
@import 'tailwindcss';
@import '@h-ai/ui/styles/global.css';
@import '@h-ai/ui/styles/theme.css';
@source "../node_modules/@h-ai/ui/dist/**/*.{svelte,js,ts}";
@source "../../../node_modules/@h-ai/ui/dist/**/*.{svelte,js,ts}";

@plugin "daisyui" {
  themes:
    light --default,
    dark --prefersdark,
    cupcake,
    emerald,
    corporate,
    nord,
    dracula,
    night;
}

/* 图标（可选） */
@plugin "@iconify/tailwind4" {
  prefixes: tabler;
}
```

> `@source` 让 TailwindCSS 扫描 `@h-ai/ui` 组件中使用的 class 名，否则组件样式会丢失。嵌套应用位于 monorepo 中时，依赖包可能被提升到工作区根 `node_modules`，所以建议同时保留两条路径。

### 4. 使用组件

```svelte
<script>
  import { Button, Card, Input } from '@h-ai/ui'
</script>

<Card title='示例表单'>
  <Input placeholder='请输入用户名' />
  <Button variant='primary' onclick={handleSubmit}>提交</Button>
</Card>
```

启用自动导入后可直接在模板中使用，无需逐个 import：

```svelte
<!-- 无需 import { Button } from '@h-ai/ui' -->
<Button variant='primary'>提交</Button>
```

> 除 `toast`、类型导入与 `Range`（会和 DOM `Range` 构造器冲突）外，其余公开 Svelte 组件都可通过 `@h-ai/ui/auto-import` 自动注入。

管理后台等只使用部分组件的页面，可直接使用公开组件目录入口；主题工具通过轻量 `@h-ai/ui/theme` 导入，避免主题消费加载根入口中的 AI、图表等组件。状态层的语言工具使用 `@h-ai/ui/i18n`，不加载组件与引导 CSS。组件路径以已安装版本的 exports 为准，不导入包内 `src/` 或 `dist/`。

自动导入器只为模板 AST 中实际使用的组件注入导入，注释、textarea 和脚本字符串中的示例不触发导入；脚本声明以及 each、await、snippet 等模板局部绑定优先。无分号、跨行及带别名的真实导入按语法树识别，已绑定的运行时组件名称不会重复注入。根入口 `@h-ai/ui` 的仅类型组件绑定按需提升为值；外部模块的同名类型无法安全合并时，构建错误会列出文件和组件名，请为类型设置别名，或用其他本地名显式导入组件。

```ts
import { Card } from '@h-ai/ui/components/compounds/index'
import { Button } from '@h-ai/ui/components/primitives/index'
import { getThemeInfo, THEMES } from '@h-ai/ui/theme'
```

## 配置清单

通过组件 props 配置交互，通过公开主题、语言和引导入口设置应用体验。

在[模块配置清单](../../docs/usage/configuration/ui.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

在[功能说明](../../docs/usage/function/ui.md)中查看调用示例、输入输出、错误处理与使用要点。

- **基础、复合与布局组件** — 搭建输入、表单、表格、弹层和页面结构
- **业务组件** — 接入 CRUD、IAM、反馈、文件、图表、AI 内容和代码工作区
- `@h-ai/ui/theme` / `@h-ai/ui/i18n` / `@h-ai/ui/toast` / `@h-ai/ui/guide` — 管理外观、语言、操作提示和新手引导
- `@h-ai/ui/vite` / `@h-ai/ui/auto-import` — 配置 Vite 依赖与自动导入

<a id="代码工作区"></a>

[代码工作区](../../docs/usage/function/ui.md#代码工作区)

## 数据结构

模块没有自建数据库表。

查看[数据结构](../../docs/usage/data/ui.md)，了解主题、语言、引导进度和组件状态的归属。

## 开发测试

```sh
pnpm --filter @h-ai/ui typecheck
pnpm --filter @h-ai/ui lint
pnpm --filter @h-ai/ui build
pnpm --filter @h-ai/ui test
```

## 许可证

Apache-2.0
