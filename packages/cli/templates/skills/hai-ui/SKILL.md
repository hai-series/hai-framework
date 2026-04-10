---
name: hai-ui
description: 使用 @h-ai/ui 构建多端应用界面，包含三层组件架构（原子/组合/场景）、DaisyUI 样式 + Bits UI headless 交互、移动端组件（SafeArea/BottomNav/PullRefresh/ActionSheet/SwipeCell/InfiniteScroll/AppBar）、Design Token 系统与平台检测；当需求涉及界面、表单、表格、移动端适配或主题切换时使用。
---

# hai-ui

> `@h-ai/ui` 是基于 Svelte 5 Runes 的多端 UI 组件库，采用 DaisyUI v5 + Tailwind CSS v4 + Bits UI v2，支持 32 主题、内置中英文 i18n、自动导入。内置 Shiki 代码高亮、Design Token 系统和 7 个移动端组件。

---

## 运行环境

> **浏览器端专用。** Svelte 组件在浏览器中渲染，服务端无需引用。

---

## 适用场景

- 构建管理后台页面（表单、表格、弹窗、导航等）
- 移动端/App 界面开发（SafeArea、BottomNav、PullRefresh 等）
- 使用 Bits UI headless 交互组件（Combobox、DatePicker、Calendar）
- 使用 IAM 场景组件（登录/注册/密码/用户资料表单）
- 使用 Storage 场景组件（文件上传/图片上传/文件列表）
- 配置主题切换与 i18n 多语言
- 多端平台检测与适配

---

## 项目配置（从 npm 安装）

> 以下示例面向通过 `npm install @h-ai/ui` 引用发布包的项目。monorepo 内部使用 `workspace:*` 时路径略有不同。

### 1. 安装依赖

```bash
# 核心包
npm install @h-ai/ui

# 必须的对等依赖与构建工具
npm install -D svelte @sveltejs/kit @sveltejs/vite-plugin-svelte
npm install -D tailwindcss @tailwindcss/vite daisyui

# 图标（可选但推荐）
npm install -D @iconify/tailwind4 @iconify-json/tabler
```

### 2. svelte.config.js

```js
import { autoImportHaiUi } from '@h-ai/ui/auto-import'
import adapter from '@sveltejs/adapter-auto'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // autoImportHaiUi 必须在 vitePreprocess 之前
  preprocess: [autoImportHaiUi(), vitePreprocess()],
  compilerOptions: {
    runes: true, // 强制 Svelte 5 Runes 模式
  },
  kit: {
    adapter: adapter(),
    alias: {
      $components: './src/lib/components',
      $stores: './src/lib/stores',
    },
  },
}

export default config
```

### 3. vite.config.ts

```ts
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    sveltekit(),
    tailwindcss(),
  ],
  optimizeDeps: {
    // bits-ui 使用 Svelte 虚拟模块，需排除预构建
    exclude: ['bits-ui'],
  },
  ssr: {
    // @h-ai 包为 ESM + Svelte 组件，需 Vite 在 SSR 时处理
    noExternal: [/@h-ai\//],
  },
})
```

### 4. src/app.css

```css
/* ─── Tailwind CSS v4 ─── */
@import 'tailwindcss';

/* ─── @h-ai/ui 共享样式 ─── */
@import '@h-ai/ui/styles/global.css';   /* 基础重置、滚动条、焦点样式 */
@import '@h-ai/ui/styles/theme.css';    /* Tailwind v4 @theme Token（品牌色/阴影/动效） */

/* ─── 移动端项目追加（可选） ─── */
@import '@h-ai/ui/styles/design-tokens.css'; /* CSS 自定义属性：间距/圆角/z-index */
@import '@h-ai/ui/styles/mobile.css';        /* 安全区域/触摸优化/键盘适配 */

/* ─── 扫描 @h-ai/ui 组件中使用的 Tailwind 类名 ─── */
@source "../node_modules/@h-ai/ui/dist/**/*.{svelte,ts}";

/* ─── DaisyUI 主题 ─── */
@plugin "daisyui" {
  themes:
    light --default,
    dark --prefersdark,
    cupcake,
    emerald,
    corporate,
    nord,
    dracula,
    night,
    dim,
    business,
    sunset;
}

/* ─── 图标（可选） ─── */
@plugin "@iconify/tailwind4" {
  prefixes: tabler;
}
```

> **关键**：`@source` 行让 TailwindCSS 扫描 `@h-ai/ui` 组件中使用的 class 名，否则组件样式会丢失。路径指向 npm 安装目录下的 `dist/`。

### 5. app.html 防闪烁脚本

```html
<!doctype html>
<html lang="%lang%">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script>
    // 防止主题切换闪烁：在 DOM 渲染前应用已保存的主题
    (function(){var t=localStorage.getItem('hai-theme');if(t)document.documentElement.setAttribute('data-theme',t)})()
  </script>
  %sveltekit.head%
</head>
<body data-sveltekit-preload-data="hover">
  <div style="display: contents">%sveltekit.body%</div>
</body>
</html>
```

### 6. 平台检测

```typescript
import { detectPlatform, isMobile, isNativeApp, usePlatform } from '@h-ai/ui'

// 一次性检测
const platform = detectPlatform() // 'ios' | 'android' | 'web'
const mobile = isMobile() // boolean
const native = isNativeApp() // boolean（Capacitor 环境）

// Svelte 5 响应式（组件中使用）
const p = usePlatform()
// p.platform / p.isMobile / p.isNative
```

---

## 三层组件架构

### 原子组件（Primitives，21 个）

| 组件         | Props 要点                                                    | 说明     |
| ------------ | ------------------------------------------------------------- | -------- |
| `Button`     | `variant`, `size`, `loading`, `disabled`, `outline`, `circle` | 按钮     |
| `IconButton` | `icon: string \| Snippet`, `tooltip`, `variant`, `size`       | 图标按钮 |
| `Input`      | `value`, `type`, `size`, `error`, `placeholder`               | 输入框   |
| `Textarea`   | `value`, `rows`, `autoResize`, `error`                        | 文本域   |
| `Select`     | `value`, `options: SelectOption[]`, `placeholder`             | 下拉选择 |
| `Checkbox`   | `checked`, `label`, `indeterminate`                           | 复选框   |
| `Switch`     | `checked`, `label`, `size`                                    | 开关     |
| `Radio`      | `value`, `options`, `direction`                               | 单选组   |
| `Range`      | `value`, `min`, `max`, `step`, `variant`, `size`              | 滑块     |
| `Rating`     | `value`, `max`                                                | 评分     |
| `Badge`      | `variant`, `size`, `outline`                                  | 徽标     |
| `Avatar`     | `src`, `name`, `size`, `shape`                                | 头像     |
| `Tag`        | `text`, `variant`, `closable`                                 | 标签     |
| `Spinner`    | `size`, `variant`                                             | 加载动画 |
| `Progress`   | `value`, `max`, `striped`, `animated`                         | 进度条   |

### 组合组件（Compounds，25 + 7 移动端）

由原子组件 + Bits UI headless 交互组合。

#### 桌面端组合组件

| 组件         | Props 要点                                                         | 说明          |
| ------------ | ------------------------------------------------------------------ | ------------- |
| `Form`       | `loading`, `disabled`, `onsubmit`                                  | 表单容器      |
| `FormField`  | `label`, `name`, `error`, `hint`, `required`                       | 表单字段      |
| `Modal`      | `open`, `title`, `size`, `closeOnBackdrop`                         | 模态框        |
| `Drawer`     | `open`, `position`, `size`                                         | 抽屉          |
| `DataTable`  | `data`, `columns`, `keyField`, snippet slots                       | 数据表格      |
| `Combobox`   | `options`, `value`, `multiple`, `placeholder`, `error`, `onchange` | 可搜索选择    |
| `Calendar`   | `value`, `minValue`, `maxValue`                                    | 独立日历      |
| `DatePicker` | `value`, `minValue`, `maxValue`, `error`                           | 日期输入+弹出 |
| `Tabs`       | `items: TabItem[]`, `active`, `type`                               | 标签页        |
| `Pagination` | `page`, `total`, `pageSize`, `onchange`                            | 分页          |
| `Dropdown`   | `items: DropdownItem[]`, `trigger`                                 | 下拉菜单      |
| `Accordion`  | `items: AccordionItem[]`                                           | 折叠面板      |
| `Skeleton`   | `variant`, `count`, `animation`                                    | 骨架屏        |
| `Empty`      | `title`, `description`, `icon`                                     | 空状态        |

#### 移动端组合组件（7 个）

| 组件             | Props 要点                                                                    | 说明             |
| ---------------- | ----------------------------------------------------------------------------- | ---------------- |
| `SafeArea`       | `top`, `bottom`, `left`, `right`                                              | 安全区域容器     |
| `AppBar`         | `title`, `backHref`, `onback`, `fixed`, `transparent`, snippet `left`/`right` | 顶部导航栏       |
| `BottomNav`      | `items: BottomNavItem[]`, `active`                                            | 底部导航栏       |
| `ActionSheet`    | `open`, `title`, `items: ActionSheetItem[]`, `cancelText`, `onselect`         | 底部弹出操作面板 |
| `PullRefresh`    | `refreshing`, `onrefresh`, `threshold`, `pullText`, `releaseText`             | 下拉刷新         |
| `InfiniteScroll` | `loading`, `finished`, `threshold`, `onload`, `loadingText`, `finishedText`   | 无限滚动加载     |
| `SwipeCell`      | `leftActions`, `rightActions: SwipeCellAction[]`, `threshold`                 | 滑动操作单元格   |

**移动端组件用法示例**：

```svelte
<script lang="ts">
  import type { BottomNavItem } from '@h-ai/ui'

  const navItems: BottomNavItem[] = [
    { key: 'home', label: '首页', icon: 'tabler:home', href: '/' },
    { key: 'discover', label: '发现', icon: 'tabler:compass', href: '/discover' },
    { key: 'profile', label: '我的', icon: 'tabler:user', href: '/profile' },
  ]
</script>

<SafeArea top bottom>
  <AppBar title="首页" />
  <PullRefresh bind:refreshing onrefresh={loadData}>
    <main class="p-4">
      <!-- 页面内容 -->
    </main>
  </PullRefresh>
  <BottomNav items={navItems} active="home" />
</SafeArea>
```

**ActionSheet 用法**：

```svelte
<script lang="ts">
  import type { ActionSheetItem } from '@h-ai/ui'

  let showActions = $state(false)
  const actions: ActionSheetItem[] = [
    { key: 'camera', label: '拍照' },
    { key: 'album', label: '从相册选择' },
    { key: 'delete', label: '删除', destructive: true },
  ]
</script>

<ActionSheet bind:open={showActions} title="选择操作" items={actions} onselect={handleAction} />
```

**SwipeCell 用法**：

```svelte
<script lang="ts">
  import type { SwipeCellAction } from '@h-ai/ui'

  const rightActions: SwipeCellAction[] = [
    { key: 'edit', label: '编辑', color: '#3b82f6' },
    { key: 'delete', label: '删除', color: '#ef4444' },
  ]
</script>

<SwipeCell {rightActions} onaction={handleSwipeAction}>
  <div class="p-4">列表项内容</div>
</SwipeCell>
```

### 场景组件（Scenes）

内置中英文翻译的业务场景组件。

#### IAM 场景组件

| 组件           | Props 要点                                      | 说明     |
| -------------- | ----------------------------------------------- | -------- |
| `LoginForm`    | `showRememberMe`, `showRegisterLink`, `errors`  | 登录表单 |
| `RegisterForm` | `fields`, `minPasswordLength`, `errors`         | 注册表单 |
| `UserProfile`  | `user`, `editable`, `fields`, `avatarUploadUrl` | 用户资料 |

#### Storage 场景组件

| 组件          | Props 要点                                     | 说明     |
| ------------- | ---------------------------------------------- | -------- |
| `FileUpload`  | `accept`, `maxSize`, `uploadUrl`, `autoUpload` | 文件上传 |
| `ImageUpload` | `value`, `uploadUrl`, `aspectRatio`            | 图片上传 |
| `FileList`    | `files: FileItem[]`, `layout`, `showPreview`   | 文件列表 |

#### AI 场景组件

| 组件                 | 说明                              |
| -------------------- | --------------------------------- |
| `MarkdownRenderer`   | Markdown 渲染（内置 Shiki 高亮） |
| `AiDocumentEditor`   | AI 文档编辑器                     |

> AI 场景组件使用 Shiki（纯 ESM）进行代码高亮，支持 27 种语言，通过 CSS 变量 `--hai-hl-*` 自定义颜色。无需额外安装 Shiki，已内置。

---

## Design Token 系统

### theme.css — Tailwind v4 `@theme` Token

通过 `@import '@h-ai/ui/styles/theme.css'` 导入，提供全局设计 Token：

```css
@theme {
  --color-brand: oklch(0.6 0.2 275);
  --shadow-xs / --shadow-soft / --shadow-lifted / --shadow-float / --shadow-overlay
  --ease-out-expo / --ease-in-out
  --font-feature-tabular: 'tnum';
}
```

应用可在导入后追加自己的 `@theme` 块覆盖或扩展。

### design-tokens.css — CSS 自定义属性

```css
--hai-spacing-xs: 4px;   --hai-spacing-sm: 8px;
--hai-spacing-md: 16px;  --hai-spacing-lg: 24px;
--hai-radius-sm: 4px;    --hai-radius-md: 8px;
--hai-touch-target-min: 44px;
--hai-safe-area-top: env(safe-area-inset-top);
--hai-z-dropdown: 1000;  --hai-z-modal: 2000;  --hai-z-toast: 3000;
--hai-transition-fast: 150ms ease;
--hai-transition-normal: 250ms ease;
```

### mobile.css 提供的全局类

| 类名                    | 用途                            |
| ----------------------- | ------------------------------- |
| `.hai-safe-top`         | 上方安全区域 padding            |
| `.hai-safe-bottom`      | 下方安全区域 padding            |
| `.hai-safe-all`         | 四周安全区域 padding            |
| `.hai-scroll-container` | 优化的滚动容器（momentum 滚动） |
| `.hai-keyboard-aware`   | 虚拟键盘弹起时自动调整内容      |

---

## 主题系统

支持 32 个 DaisyUI 主题。

```typescript
import { applyTheme, getCurrentTheme, isDarkTheme, THEMES, THEME_GROUPS } from '@h-ai/ui'

applyTheme('dark')      // 应用主题（自动持久化 localStorage）
getCurrentTheme()        // 获取当前主题名
isDarkTheme('dracula')   // 检查是否暗色主题
```

---

## 代码高亮（Shiki）

AI 场景组件（`MarkdownRenderer`、`AiDocumentEditor`）内置 Shiki 代码高亮（纯 ESM，支持 Vite SSR/Client 双模式）。

### 支持语言（27 种）

typescript, javascript, python, java, go, rust, c, cpp, csharp, ruby, php, swift, kotlin, sql, html, css, json, yaml, toml, markdown, bash, shell, powershell, dockerfile, xml, graphql, plaintext

### 自定义高亮颜色

通过 CSS 变量覆盖（在 `app.css` 或组件作用域内）：

```css
:root {
  --hai-hl-keyword: #c586c0;
  --hai-hl-string: #ce9178;
  --hai-hl-comment: #6a9955;
  --hai-hl-function: #dcdcaa;
  --hai-hl-variable: #9cdcfe;
  --hai-hl-type: #4ec9b0;
  --hai-hl-number: #b5cea8;
  --hai-hl-operator: #d4d4d4;
  --hai-hl-punctuation: #808080;
  --hai-hl-foreground: #d4d4d4;
  --hai-hl-background: #1e1e1e;
}
```

---

## 重要约定

1. **Svelte 5 Runes**：使用 `$state`、`$derived`、`$effect`
2. **Snippet 插槽**：使用 `{#snippet name()}...{/snippet}` 语法
3. **自动导入例外**：`toast`、类型导入、`Range`/`FileList` 必须显式 `import`
4. **Combobox 统一单选/多选**：`MultiSelect` 已删除
5. **移动端样式**：务必引入 `design-tokens.css` + `mobile.css`，使用 SafeArea 包裹原生 App 页面
6. **`@source` 必须配置**：未配置则 TailwindCSS 无法扫描 `@h-ai/ui` 组件中的 class，样式会丢失
7. **`ssr.noExternal`**：Vite SSR 需要将 `@h-ai/*` 包纳入处理，否则 SSR 时 Svelte 组件无法正确编译

---

## 导出路径

| 路径                        | 用途                                   |
| --------------------------- | -------------------------------------- |
| `@h-ai/ui`                 | 主入口：所有组件、工具函数、类型       |
| `@h-ai/ui/auto-import`     | Svelte 预处理器：组件自动导入          |
| `@h-ai/ui/components/*`    | 按路径引用单个组件                     |
| `@h-ai/ui/styles/global.css`       | 全局基础样式（重置/滚动条/焦点）       |
| `@h-ai/ui/styles/theme.css`        | Tailwind v4 `@theme` Token            |
| `@h-ai/ui/styles/design-tokens.css`| CSS 自定义属性（间距/圆角/z-index）    |
| `@h-ai/ui/styles/mobile.css`       | 移动端优化（安全区域/触摸/键盘）       |

---

## 相关 Skills

- `hai-kit`：SvelteKit 集成（hooks.server.ts、API 端点、认证守卫）
- `hai-iam`：IAM 模块 API（与 LoginForm/RegisterForm 配合）
- `hai-capacitor`：原生 App 开发（与 SafeArea/AppBar 配合）
- `hai-api-client`：客户端数据获取
