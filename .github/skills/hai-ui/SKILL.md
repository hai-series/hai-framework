---
name: hai-ui
description: "Use when: building UI with @h-ai/ui, including Svelte 5 Runes components, DaisyUI/Bits UI integration, forms, tables, dialogs, mobile components, theme switching, Markdown/AI output rendering, and Mermaid document/code previews. 使用 @h-ai/ui 构建界面、多端组件、主题系统、AI 输出展示与 Mermaid 文档/代码预览时使用。"
---

# hai-ui — @h-ai/ui 快速指南

`@h-ai/ui` 提供 Svelte 5 Runes 组件库，覆盖 primitives / compounds / scenes 三层组件架构，以及主题、i18n、Toast、平台检测、AI 输出展示等能力。

> 完整安装步骤、全量组件清单与长示例见 `packages/cli/templates/skills/hai-ui/SKILL.md`；本文件保留工作区内最常用的集成要点，避免上下文过重。

## 使用边界

- 浏览器端界面优先复用 `@h-ai/ui` 现有组件，禁止在 app 内重复造轮子。
- Svelte 组件使用 Svelte 5 Runes（`$state` / `$derived` / `$effect`）。
- 页面级文案走应用自己的 i18n；`@h-ai/ui` 组件内置文案由 UI 包统一提供。
- `toast`、类型导入以及 `Range` 需要显式 `import`；其它公开 Svelte 组件可自动导入。

## 必备集成

### Svelte 预处理

```js
import { autoImportHaiUi } from '@h-ai/ui/auto-import'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

export default {
  preprocess: [autoImportHaiUi(), vitePreprocess()],
  compilerOptions: { runes: true },
}
```

`autoImportHaiUi()` 必须放在 `vitePreprocess()` 前面。

### Vite / SSR

```ts
export default defineConfig({
  plugins: [sveltekit(), tailwindcss()],
  optimizeDeps: { exclude: ['bits-ui'] },
  ssr: { noExternal: [/@h-ai\//] },
})
```

### 样式导入

```css
@import 'tailwindcss';
@import '@h-ai/ui/styles/global.css';
@import '@h-ai/ui/styles/theme.css';
@import '@h-ai/ui/styles/design-tokens.css';
@import '@h-ai/ui/styles/mobile.css';

@source "../node_modules/@h-ai/ui/dist/**/*.{svelte,js,ts}";
@source "../../../node_modules/@h-ai/ui/dist/**/*.{svelte,js,ts}";
```

未配置 `@source` 时，Tailwind 不会扫描 `@h-ai/ui` 组件类名，样式会丢失。

## 常用能力

- primitives：`Button`、`Input`、`Textarea`、`Badge`、`Avatar`、`Spinner` 等。
- compounds：`Form`、`Modal`、`Drawer`、`DataTable`（列头支持排序）、`Tabs`、`Combobox`、`DatePicker` 等。
- mobile：`SafeArea`、`AppBar`、`BottomNav`、`PullRefresh`、`ActionSheet`、`SwipeCell`。
- scenes：IAM / Storage / CRUD / AI / 错误页 / 设置 场景组件。

## 场景组件速查

| 组件 | 用途 |
| --- | --- |
| `ErrorPage` | 通用错误页，内置 `401/403/404/500/503` 预设；`status` 驱动预设，`onhome`/`onback` 自定义跳转。SvelteKit 在 `+error.svelte` 中按 `page.status` 使用 |
| `SettingsLayout` | 设置页布局：顶部标题/描述 + 左侧分区导航（`sections` + `active` + `onselect`）+ 右侧内容（children） |
| `AuthShell` | 认证页布局：`variant='card'`（居中卡片）或 `'split'`（左右分栏）；split 支持 `brandTitle`/`brandText`，也支持 `illustration`/`description`/`highlights` 自由内容 |

### DataTable 排序

- 列定义加 `sortable: true` 即可点击列头排序；默认客户端排序当前数据。
- 受控（服务端）排序：传 `sortKey` / `sortDir` 并实现 `onsort(key, dir)`。
- `CrudPage` 的列表列默认 `sortable`，筛选栏在有搜索/过滤条件时显示「重置」按钮。
- `Pagination` 统一为 table 风格（shadcn 表格分页：总数 + 每页 + 第 X / Y 页 + 首/上/下/末 + 跳转到），`CrudPage` 默认采用；过滤工具栏为无卡片平铺布局，支持 `select/boolean/number/date/date-range/text`。

## AI 场景组件

| 组件 | 用途 |
| --- | --- |
| `MarkdownRenderer` | Markdown 渲染（内置 Shiki 代码高亮） |
| `AiDocumentDownloadMenu` | AI 文档下载菜单 |
| `AiDocumentEditor` | AI 文档编辑器，支持大纲、复制、代码/预览切换、Mermaid |
| `AiTableEditor` | AI 结构化表格展示与编辑 |

### AiDocumentEditor 与 Mermaid

- `sourceKind='document'`：文档里的 ```` ```mermaid ```` 代码块会在阅读态自动渲染为图表。
- `sourceKind='code'` + `codeLanguage='mermaid'` + `showCodePreviewToggle`：保留源码视图，并可切换到 Mermaid 图表预览。
- Mermaid 使用懒加载 + `securityLevel: 'strict'`，输出为消毒后的 SVG；**不需要** `allowUnsafeCodePreview`。
- `allowUnsafeCodePreview` 仍只用于 HTML / JS / CSS 等高风险预览。

文档模式示例：

```svelte
<AiDocumentEditor
  title="订单履约流程"
  sourceKind="document"
  content={`# 流程\n\n\`\`\`mermaid\nflowchart TD\n  A[下单] --> B[发货]\n\`\`\``}
  showToolbar
  showOutline
/>
```

代码模式示例：

```svelte
<AiDocumentEditor
  title="订单状态机"
  sourceKind="code"
  codeLanguage="mermaid"
  content={`stateDiagram-v2\n  [*] --> 待支付\n  待支付 --> 已支付`}
  showCodePreviewToggle
  showCopyButton
  showOutline={false}
/>
```

## CRUD 场景组件（CrudPage）

`CrudPage` 基于 `kit.crud.define()` 的资源定义，自动渲染列表 + 搜索过滤 + 分页 + 详情 + 编辑/新建 + 删除确认。

| 配置项 | 说明 |
| --- | --- |
| `form.variant` | `'drawer'`（抽屉，默认）或 `'modal'`（弹出窗口） |
| `form.drawerSize` / `form.drawerWidth` | 抽屉尺寸预设 / 自定义 CSS 宽度（宽度优先） |
| `form.modalSize` / `form.modalWidth` / `form.modalHeight` | 弹窗尺寸预设 / 自定义宽高 |
| `pagination.showSizeChanger` | 每页条数选择器（默认开启） |
| `pagination.pageSizeOptions` | 每页条数候选项（默认 `[10, 20, 50, 100]`） |
| `pagination.showJumper` / `pagination.showTotal` | 跳页输入 / 总数（默认开启） |
| `density` | 列表密度：`'normal'`（默认）或 `'compact'`；仅影响列表行、行内操作、分页与创建/编辑/详情表单 |

分页栏始终显示，不再因数据量小而隐藏。

```svelte
<CrudPage
  crud={roleCrud}
  {data}
  permissions={{ create: true, update: true, delete: true }}
  form={{ variant: 'modal', modalSize: 'lg' }}
  pagination={{ showSizeChanger: true, showJumper: true }}
  density='compact'
  {nav}
/>
```

## data-* 属性透传

- 公开 Svelte 组件支持调用方直接传入 `data-*` 属性；组件会把它们透传到根节点或主交互节点。
- 推荐测试和自动化直接使用 `data-testid`、`data-analytics-id` 等属性，不要为了测试 ID 在应用层重复封装 `Button/Input/Modal`。
- 只透传 `data-*`，不要依赖未声明的普通属性透传。


## 主题与平台
- 主题：`applyTheme()`、`getCurrentTheme()`、`isDarkTheme()`。
- 平台：`detectPlatform()`、`isMobile()`、`isNativeApp()`、`usePlatform()`。

## 重要约定

1. 组件优先复用 `@h-ai/ui`，不要在 app 中重复实现同类组件。
2. 页面级文案与业务逻辑放在应用层；UI 组件只做展示与交互。
3. `@h-ai/*` 需纳入 `ssr.noExternal`，否则 SSR 下 Svelte 组件可能无法正确编译。
4. `{@html}` 只能渲染已清洗的受控内容；`AiDocumentEditor` / `MarkdownRenderer` 已内置安全处理链。

## 相关 Skills

- `hai-kit`：SvelteKit 路由、服务端控制流、端点集成
- `hai-iam`：认证鉴权 + IAM 场景组件搭配
- `hai-capacitor`：原生 App 场景（SafeArea / AppBar / BottomNav）
