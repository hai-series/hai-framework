# @h-ai/ui

> 基于 Svelte 5 Runes 的多端 UI 组件库，采用 DaisyUI v5 + Tailwind CSS v4 样式 + Bits UI v2 headless 交互，内置 i18n（zh-CN / en-US），内置 15 个精选 DaisyUI 主题。

## 安装

```bash
npm install @h-ai/ui
```

依赖 `@h-ai/core`（会自动安装）。

## 快速开始

### 1. 配置 svelte.config.js

```js
import { autoImportHaiUi } from '@h-ai/ui/auto-import'
import adapter from '@sveltejs/adapter-auto'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: [autoImportHaiUi(), vitePreprocess()],
  compilerOptions: { runes: true },
  kit: { adapter: adapter() },
}

export default config
```

### 2. 配置 vite.config.ts

```ts
import { haiOptimizeExclude, haiPrebundledDeps } from '@h-ai/ui/vite'
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [sveltekit(), tailwindcss()],
  optimizeDeps: {
    // bits-ui 含 .svelte 源码须 exclude；@internationalized/date 须与 bits-ui 同为原始副本，
    // 否则日期组件会因双实例 instanceof 失败抛 "Unknown date type"
    exclude: [...haiOptimizeExclude],
    // 预打包 @h-ai/ui 的重型纯 JS 依赖（语法高亮 / Mermaid / PDF 等），
    // 避免首次进入业务路由时触发依赖再优化与整页刷新
    include: [...haiPrebundledDeps],
  },
  ssr: { noExternal: [/@h-ai\//] },
})
```

### 3. 配置 src/app.css

```css
@import 'tailwindcss';
@import '@h-ai/ui/styles/global.css';
@import '@h-ai/ui/styles/theme.css';
@source "../node_modules/@h-ai/ui/dist/**/*.{svelte,js,ts}";
@source "../../../node_modules/@h-ai/ui/dist/**/*.{svelte,js,ts}";

@plugin "daisyui" {
  themes: light --default, dark --prefersdark, cupcake, emerald, corporate, nord, dracula, night;
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
  import { Button, Input, Card } from '@h-ai/ui'
</script>

<Card title="示例表单">
  <Input placeholder="请输入用户名" />
  <Button variant="primary" onclick={handleSubmit}>提交</Button>
</Card>
```

启用自动导入后可直接在模板中使用，无需逐个 import：

```svelte
<!-- 无需 import { Button } from '@h-ai/ui' -->
<Button variant="primary">提交</Button>
```

> 除 `toast`、类型导入与 `Range`（会和 DOM `Range` 构造器冲突）外，其余公开 Svelte 组件都可通过 `@h-ai/ui/auto-import` 自动注入。

### data-* 属性透传

公开 Svelte 组件支持把调用方传入的 `data-*` 属性透传到组件根节点或主交互节点，便于测试选择器、埋点和自动化标记。普通未知属性不会被透传。

```svelte
<Button data-testid='save-button' data-analytics-id='settings.save'>保存</Button>
<Input data-testid='username-input' bind:value={username} />
<Modal data-testid='confirm-modal' bind:open={open}>...</Modal>
```

无需再为了 `data-testid` 单独封装按钮、输入框或弹层组件。

## 组件架构

组件按三层划分（primitives → compounds → scenes）：

```
components/
├── primitives/   # 原子组件（不可再分的基础 UI 单元）
├── compounds/    # 组合组件（由原子组件 + Bits UI headless 组合而成）
└── scenes/       # 场景组件（面向具体业务场景的完整 UI 流程）
  ├── ai/       # AI 文档 / 表格 / Markdown 预览
    ├── app/      # 应用级（设置/反馈/主题/语言切换）
  ├── crud/     # CRUD 页面 / 抽屉 / 过滤 / 删除确认
    ├── iam/      # 身份认证
    ├── storage/  # 存储管理
    └── crypto/   # 加密展示
```

## 组件清单

### 原子组件 Primitives（20 个）

| 组件             | 描述         | 主要属性                                                           |
| ---------------- | ------------ | ------------------------------------------------------------------ |
| `Button`         | 按钮         | `variant`, `size`, `loading`, `disabled`, `outline`, `circle`      |
| `IconButton`     | 图标按钮     | `icon: trusted SVG string \| Snippet`, `variant`, `size`, `tooltip`, `loading` |
| `BareButton`     | 无样式按钮   | `class`, `ariaLabel`, `role`, `tabindex`                           |
| `Input`          | 输入框       | `type`, `value`, `size`, `error`, `validationMessage`              |
| `BareInput`      | 无样式输入框 | `type`, `class`, `accept`, `multiple`                              |
| `Textarea`       | 文本域       | `value`, `rows`, `size`, `autoResize`, `error`                     |
| `Select`         | 下拉选择     | `options`, `value`, `placeholder`, `size`                          |
| `Checkbox`       | 复选框       | `checked`, `label`, `size`, `indeterminate`                        |
| `Switch`         | 开关         | `checked`, `label`, `size`                                         |
| `Radio`          | 单选组       | `options`, `value`, `direction`, `size`                            |
| `ToggleCheckbox` | 原生开关输入 | `checked`, `name`, `onchange`                                      |
| `ToggleInput`    | 原生切换输入 | `checked`, `name`                                                  |
| `ToggleRadio`    | 原生单选输入 | `checked`, `name`, `onchange`                                      |
| `Range`          | 滑块         | `value`, `min`, `max`, `step`                                      |
| `Rating`         | 评分         | `value`, `max`                                                     |
| `Badge`          | 徽章         | `variant`, `size`, `outline`                                       |
| `Avatar`         | 头像         | `src`, `name`, `size`, `shape`, `ring`                             |
| `Tag`            | 标签         | `text`, `variant`, `size`, `closable`                              |
| `Spinner`        | 加载动画     | `size`, `variant`                                                  |
| `Progress`       | 进度条       | `value`, `max`, `variant`, `striped`, `animated`                   |

### 组合组件 Compounds（33 个）

#### 表单

| 组件        | 描述     | 主要属性                                     |
| ----------- | -------- | -------------------------------------------- |
| `Form`      | 表单容器 | `loading`, `disabled`, `onsubmit`            |
| `FormField` | 表单字段 | `label`, `error`, `hint`, `required`         |
| `TagInput`  | 标签输入 | `tags`, `maxTags`, `allowDuplicates`, `size` |

#### 反馈

| 组件             | 描述     | 主要属性                          |
| ---------------- | -------- | --------------------------------- |
| `Alert`          | 警告框   | `variant`, `title`, `dismissible` |
| `ToastContainer` | 通知容器 | 全局放置，配合 `toast` 单例使用   |

#### 弹层

| 组件      | 描述   | 主要属性                                                |
| --------- | ------ | ------------------------------------------------------- |
| `Modal`   | 模态框 | `open`, `title`, `size`, `radius`, `bodyOverflow`, `showClose` |
| `Drawer`  | 抽屉   | `open`, `position`, `title`, `size`                     |
| `Confirm` | 确认框 | `open`, `title`, `message`, `variant`, `onconfirm`      |
| `Popover` | 弹出层 | `open`, `position`, `trigger`, `offset`                 |

#### 数据展示

| 组件        | 描述     | 主要属性                                 |
| ----------- | -------- | ---------------------------------------- |
| `Card`      | 卡片容器 | `title`, `bordered`, `shadow`, `padding` |
| `DataTable` | 数据表格 | `data`, `columns`, `keyField`, `loading`, `sortKey`, `sortDir`, `onsort`（列 `sortable` 可排序） |
| `Accordion` | 手风琴   | `items: AccordionItem[]`                 |
| `Timeline`  | 时间线   | `items: TimelineItem[]`                  |

#### Bits UI headless 交互

| 组件         | 描述                        | 主要属性                                            |
| ------------ | --------------------------- | --------------------------------------------------- |
| `Combobox`   | 可搜索下拉选择（单选/多选） | `options`, `value`, `multiple`, `placeholder`       |
| `Calendar`   | 独立日历                    | `value: DateValue`, `minValue`, `maxValue`          |
| `DatePicker` | 日期输入+弹出               | `value: DateValue`, `minValue`, `maxValue`, `error` |

> 日期值使用 `@internationalized/date` 的 `DateValue` / `CalendarDate` 类型。

#### 移动端 / 增强交互

| 组件             | 描述         | 主要属性                                            |
| ---------------- | ------------ | --------------------------------------------------- |
| `ActionSheet`    | 底部操作面板 | `open`, `title`, `items`, `cancelText`, `onselect`  |
| `AppBar`         | 顶部导航栏   | `title`, `backHref`, `onback`, `fixed`, `safeArea`  |
| `BottomNav`      | 底部导航栏   | `items`, `active`, `centered`, `maxWidth`           |
| `InfiniteScroll` | 无限滚动     | `loading`, `finished`, `threshold`, `onload`        |
| `PullRefresh`    | 下拉刷新     | `refreshing`, `threshold`, `onrefresh`              |
| `SafeArea`       | 安全区域容器 | `top`, `bottom`, `left`, `right`                    |
| `SwipeCell`      | 滑动操作单元 | `leftActions`, `rightActions`, `threshold`, `onaction` |

#### 导航

| 组件         | 描述     | 主要属性                                     |
| ------------ | -------- | -------------------------------------------- |
| `Tabs`       | 标签页   | `items`, `active`, `type`, `size`            |
| `Pagination` | 分页（统一 table 风格） | `page`, `total`, `pageSize`, `showTotal`, `showJumper`, `showSizeChanger` |
| `Breadcrumb` | 面包屑   | `items`, `separator`                         |
| `Steps`      | 步骤条   | `items`, `current`, `direction`, `clickable` |
| `Dropdown`   | 下拉菜单 | `items`, `trigger`, `position`               |
| `Tooltip`    | 提示     | `content`, `position`, `delay`               |

#### 状态占位

| 组件       | 描述   | 主要属性                              |
| ---------- | ------ | ------------------------------------- |
| `Skeleton` | 骨架屏 | `variant`, `width`, `height`, `count` |
| `Empty`    | 空状态 | `title`, `description`, `icon`        |
| `Result`   | 结果页 | `status`, `title`, `description`      |

#### 页面级

| 组件         | 描述     | 主要属性                                    |
| ------------ | -------- | ------------------------------------------- |
| `PageHeader` | 页面头部 | `title`, `description`，支持 `actions` 插槽 |

### 场景组件 Scenes（33 个）

#### App 应用级（7 个）

| 组件             | 描述             | 主要属性           |
| ---------------- | ---------------- | ------------------ |
| `FeedbackModal`  | 反馈模态框       | `open`, `onsubmit` |
| `SettingsModal`  | 设置模态框       | `open`, `onclose`  |
| `SettingsLayout` | 设置页布局（分区导航 + 内容区） | `title`, `description`, `sections`, `active`, `onselect` |
| `LanguageSwitch` | 语言切换         | 无需 Props         |
| `ThemeColorPicker` | 主题色选择器   | `value`, `presets`, `onchange` |
| `ThemeSelector`  | 完整主题选择面板 | 无需 Props         |
| `ThemeToggle`    | 明/暗主题切换    | 无需 Props         |

#### IAM 身份认证（9 个）

| 组件                 | 描述       | 主要属性                                              |
| -------------------- | ---------- | ----------------------------------------------------- |
| `AuthShell`          | 认证页布局（居中卡片 / 左右分栏） | `variant`, `title`, `subtitle`, `brandTitle`, `brandText`, `illustration`, `description`, `highlights` |
| `LoginForm`          | 登录表单   | `loading`, `errors`, `showRememberMe`, `onsubmit`     |
| `RegisterForm`       | 注册表单   | `loading`, `errors`, `fields`, `onsubmit`             |
| `ForgotPasswordForm` | 忘记密码   | `mode`, `loading`, `errors`, `onsubmit`               |
| `ResetPasswordForm`  | 重置密码   | `loading`, `errors`, `showCode`, `onsubmit`           |
| `ChangePasswordForm` | 修改密码   | `loading`, `errors`, `requireOldPassword`, `onsubmit` |
| `PasswordInput`      | 密码输入框 | `value`, `showToggle`, `showStrength`, `minLength`    |
| `PermGuard`          | 权限守卫   | `permissions`, `mode`, `fallback`                     |
| `UserProfile`        | 用户资料   | `user`, `editable`, `fields`, `onsubmit`              |

#### Storage 存储（4 个）

| 组件           | 描述     | 主要属性                                                 |
| -------------- | -------- | -------------------------------------------------------- |
| `FileUpload`   | 文件上传 | `accept`, `maxSize`, `maxFiles`, `multiple`, `uploadUrl` |
| `ImageUpload`  | 图片上传 | `value`, `accept`, `maxSize`, `aspectRatio`              |
| `AvatarUpload` | 头像上传 | `value`, `size`, `maxSize`, `fallback`                   |
| `FileList`     | 文件列表 | `files`, `layout`, `showDelete`, `showDownload`          |

#### Crypto 加密展示（3 个）

| 组件               | 描述     | 主要属性                                                |
| ------------------ | -------- | ------------------------------------------------------- |
| `EncryptedInput`   | 加密输入 | `value`, `encryptedValue`, `algorithm`, `showEncrypted` |
| `HashDisplay`      | 哈希展示 | `value`, `algorithm`, `copyable`, `truncate`            |
| `SignatureDisplay` | 签名展示 | `signature`, `publicKey`, `algorithm`, `verified`       |

默认算法与 `@h-ai/crypto` 对齐：加密输入使用 `SM4`，哈希展示使用 `SM3`，签名展示使用 `SM2`。

#### AI 文档与表格（4 个）

| 组件                     | 描述             | 主要属性 / 能力 |
| ------------------------ | ---------------- | ---------------- |
| `MarkdownRenderer`       | Markdown 渲染器  | `content`, `showCopyButton`, `enableHighlight` |
| `AiDocumentDownloadMenu` | 文档下载菜单     | `actions`, `ondownload` |
| `AiDocumentEditor`       | AI 文档编辑器    | `content`, `showRunButton`, `showCodePreviewToggle`, `allowUnsafeCodePreview` |
| `AiTableEditor`          | AI 表格编辑器    | `columns`, `rows`, `editable`, `ondownload` |

> `AiDocumentEditor` 默认只允许 Markdown 内置预览。HTML / JS / CSS 等高风险预览需要显式设置 `allowUnsafeCodePreview`，或通过 `oncoderun` 返回受控的预览结果。
>
> Mermaid 图表开箱即用：文档（`sourceKind='document'`）里的 ```` ```mermaid ```` 代码块在阅读态自动渲染为图表；code 模式（`sourceKind='code'` + `showCodePreviewToggle`）下可在「代码 / 预览」间切换。Mermaid 以 `securityLevel: 'strict'` 渲染为消毒后的 SVG，无需开启 `allowUnsafeCodePreview`。

#### CRUD 场景（5 个）

| 组件                 | 描述         | 主要属性 / 能力 |
| -------------------- | ------------ | ---------------- |
| `CrudPage`           | CRUD 主页面  | `crud`, `data`, `permissions`, `form`, `pagination`, `density`, `nav` |
| `CrudFilterBar`      | 过滤工具栏（搜索 + 多类型过滤 + 重置） | `filterFields`, `searchValue`, `onsearch`, `onfilterchange`, `onreset` |
| `CrudDetailPanel`    | 详情面板（抽屉/弹窗） | `open`, `item`, `fields`, `variant`, `drawerWidth`, `modalSize` |
| `CrudEditPanel`      | 编辑面板（抽屉/弹窗） | `open`, `fields`, `variant`, `drawerWidth`, `modalSize`, `onsubmit` |
| `CrudDeleteConfirm`  | 删除确认框   | `open`, `loading`, `onconfirm` |

> 列表列头默认支持点击排序（`DataTable` 内置客户端排序，受控模式可通过 `sortKey`/`sortDir`/`onsort` 接管为服务端排序）；存在搜索/过滤条件时筛选栏显示「重置」按钮。过滤工具栏支持常用控件：`select`、`boolean`、`number`、`date`、`date-range`、`text`。分页栏统一为 shadcn 风格（总数 / 每页 / 第 X / Y 页 / 首末翻页 / 跳转到）。

#### 错误页场景（1 个）

| 组件        | 描述         | 主要属性 / 能力 |
| ----------- | ------------ | ---------------- |
| `ErrorPage` | 通用错误页（内置 401/403/404/500/503 预设） | `status`, `code`, `title`, `description`, `homeUrl`, `onhome`, `onback` |

> `CrudPage` 通过 `form` 配置新建/编辑的展示形式：
>
> - `form.variant`：`'drawer'`（抽屉，默认）或 `'modal'`（弹出窗口）。
> - 抽屉：`form.drawerSize` 选预设尺寸，`form.drawerWidth` 传任意 CSS 宽度（优先级更高）。
> - 弹窗：`form.modalSize` 选预设尺寸，`form.modalWidth` / `form.modalHeight` 传任意 CSS 尺寸。
>
> `pagination` 配置分页栏（始终显示）：`showSizeChanger`、`pageSizeOptions`、`showJumper`、`showTotal` 默认开启。
>
> `density` 配置列表密度：`'normal'`（默认）或 `'compact'`（紧凑）。它只影响列表行、行内操作、分页与创建/编辑/详情表单元素，不影响页头与筛选栏。

## 使用示例

### Toast 通知

```svelte
<script>
  import { toast, ToastContainer } from '@h-ai/ui'

  function notify() {
    toast.success('操作成功')
    toast.error('操作失败')
    toast.warning('请注意')
    toast.info('提示信息', 5000) // 自定义持续时间
  }
</script>

<button onclick={notify}>通知</button>
<ToastContainer />
```

### 典型 CRUD 页面

```svelte
<script>
  import {
    PageHeader, Card, DataTable, Button,
    Modal, Input, Select, toast, ToastContainer,
  } from '@h-ai/ui'

  let items = $state([])
  let showModal = $state(false)
  let loading = $state(false)
  let formData = $state({ name: '', type: '' })

  const columns = [
    { key: 'name', label: '名称' },
    { key: 'type', label: '类型' },
    { key: 'createdAt', label: '创建时间' },
  ]

  async function handleCreate() {
    loading = true
    try {
      await fetch('/api/items', { method: 'POST', body: JSON.stringify(formData) })
      showModal = false
      toast.success('创建成功')
    } finally {
      loading = false
    }
  }
</script>

<PageHeader title="项目管理" description="管理所有项目">
  {#snippet actions()}
    <Button onclick={() => showModal = true}>新建</Button>
  {/snippet}
</PageHeader>

<Card>
  <DataTable data={items} {columns} keyField="id" {loading}>
    {#snippet actions(item)}
      <Button size="xs">编辑</Button>
      <Button size="xs" variant="error">删除</Button>
    {/snippet}
  </DataTable>
</Card>

<Modal bind:open={showModal} title="新建项目">
  <form onsubmit={(e) => { e.preventDefault(); handleCreate() }} class="space-y-4">
    <Input placeholder="名称" bind:value={formData.name} required />
    <Select
      placeholder="选择类型"
      bind:value={formData.type}
      options={[
        { value: 'a', label: '类型 A' },
        { value: 'b', label: '类型 B' },
      ]}
    />
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => showModal = false}>取消</Button>
    <Button {loading} onclick={handleCreate}>创建</Button>
  {/snippet}
</Modal>

<ToastContainer />
```

`Modal` 不传 `title` / `header` 时会保留右上角关闭按钮，但不额外渲染整条头部。需要调整圆角时可传 `radius="1.4rem"`，内部下拉等浮层需要越界显示时可传 `bodyOverflow="visible"`。

### 声明式 CRUD 页面（CrudPage）

```svelte
<script lang='ts'>
  import { createSvelteKitNavAdapter } from '@h-ai/kit/client'
  import { CrudPage } from '@h-ai/ui'

  let { data } = $props()
  const nav = createSvelteKitNavAdapter()
</script>

<CrudPage
  crud={roleCrud}
  {data}
  permissions={{ create: true, update: true, delete: true }}
  form={{ variant: 'modal', modalSize: 'lg' }}
  pagination={{ showSizeChanger: true, showJumper: true, pageSizeOptions: [10, 20, 50] }}
  density='compact'
  {nav}
/>
```

> 抽屉形式可改用 `form={{ variant: 'drawer', drawerWidth: '40rem' }}`。

### 登录页面

```svelte
<script>
  import { LoginForm } from '@h-ai/ui'

  let loading = $state(false)
  let errors = $state({})

  async function handleLogin(data) {
    loading = true
    errors = {}
    try {
      await fetch('/api/login', { method: 'POST', body: JSON.stringify(data) })
    } catch {
      errors = { general: '登录失败，请检查用户名和密码' }
    } finally {
      loading = false
    }
  }
</script>

<!-- 场景组件内置 i18n，无需传入翻译 props -->
<LoginForm {loading} {errors} onsubmit={handleLogin} showRegisterLink />
```

### PasswordInput 受控模式

```svelte
<script>
  import { PasswordInput } from '@h-ai/ui'

  let password = $state('')
</script>

<PasswordInput
  value={password}
  oninput={(e) => { password = e.currentTarget.value }}
  placeholder="请输入密码"
  showStrength
/>
```

## 样式依赖

组件基于 TailwindCSS v4 + DaisyUI。应用层 `app.css` 需要以下配置：

```css
/* 必须 */
@import 'tailwindcss';
@import '@h-ai/ui/styles/global.css';   /* 基础重置、滚动条、焦点样式 */
@import '@h-ai/ui/styles/theme.css';    /* Tailwind v4 @theme Token（品牌色/阴影/动效） */
@source "../node_modules/@h-ai/ui/dist/**/*.{svelte,js,ts}";
@source "../../../node_modules/@h-ai/ui/dist/**/*.{svelte,js,ts}";

/* 移动端项目追加（可选） */
@import '@h-ai/ui/styles/design-tokens.css'; /* CSS 自定义属性 */
@import '@h-ai/ui/styles/mobile.css';        /* 安全区域/触摸优化 */

/* DaisyUI 主题 */
@plugin "daisyui" {
  themes: light --default, dark --prefersdark, cupcake, emerald, corporate, nord, dracula, night;
}
```

- `global.css`：基础 HTML 重置、滚动条美化、表单焦点环
- `theme.css`：Tailwind v4 `@theme` 块，包含品牌色、阴影层级、动效曲线、字体特性
- `design-tokens.css`：CSS 自定义属性（间距/圆角/z-index/过渡），移动端推荐
- `mobile.css`：安全区域 padding、momentum 滚动、虚拟键盘适配、移动端 App 壳布局工具（`hai-mobile-viewport` / `hai-mobile-shell` / `hai-mobile-main`）

移动端页面推荐让 `BottomNav` 与页面壳宽度一致，避免桌面预览时底栏横跨整个视口：

```svelte
<div class="hai-mobile-viewport">
  <div class="hai-mobile-shell max-w-lg">
    <AppBar title="Home" fixed={false} safeArea />
    <main class="hai-mobile-main">...</main>
    <BottomNav items={items} active="home" centered maxWidth="lg" safeArea />
  </div>
</div>
```

### 图标

组件使用 Iconify (Tabler Icons)：

```bash
npm install -D @iconify/tailwind4 @iconify-json/tabler
```

```css
/* app.css 中追加 */
@plugin "@iconify/tailwind4" {
  prefixes: tabler;
}
```

### 主题切换

使用内置的主题工具函数管理 15 个精选 DaisyUI 主题：

```ts
import {
  applyTheme, // 应用主题（自动持久化到 localStorage）
  createThemeBootstrapScript, // 生成可注入 app.html 的首屏主题恢复脚本
  getCurrentTheme, // 获取当前主题
  getThemeInitScript, // 返回可注入到 HTML shell 的防闪烁脚本文本
  isDarkTheme, // 检查是否暗色主题
  normalizeHexColor, // 归一化 #RGB / #RRGGBB 主题色
  normalizeThemeId, // 校验主题 ID 并自动回退
  THEME_GROUPS, // 按亮色/暗色分组
  THEMES, // ThemeInfo[] — 15 个精选主题元数据
} from '@h-ai/ui'
```

简单场景可以直接使用 `getThemeInitScript()`；如果应用有自定义存储 key、主题色 CSS 变量或语言偏好，推荐在服务端通过 `createThemeBootstrapScript()` 生成脚本后再注入 `app.html`。

在 SvelteKit 的 `app.html` 中，可以先放一个占位符：

```html
<head>
  <script>%theme_bootstrap%</script>
</head>
```

然后在 `hooks.server.ts` 里注入：

```ts
import { createThemeBootstrapScript, DEFAULT_THEME_COLOR_CSS_VAR } from '@h-ai/ui'

const themeBootstrapScript = createThemeBootstrapScript({
  storageKey: 'hai-demo-preferences',
  legacyThemeStorageKey: 'hai-demo-theme',
  defaultThemeColor: '#5765f0',
  colorCssVar: DEFAULT_THEME_COLOR_CSS_VAR,
})

transformPageChunk: ({ html }) => html.replace('%theme_bootstrap%', themeBootstrapScript)
```

## 国际化 (i18n)

@h-ai/ui 采用**组件内置翻译**模式：

- 场景组件（`scenes/`）内置中英文翻译（zh-CN / en-US），开箱即用
- 组件自动响应全局 locale 变化（通过 `@h-ai/core` 同步）
- 应用层只需处理**页面级文本**，组件内部文本由 @h-ai/ui 统一管理
- 如需覆盖特定文本，通过 `submitText`、`labels` 等 props 传入

### createLocaleStore

用于客户端 locale 状态管理，自动同步到 `@h-ai/core` 全局 locale 管理器：

```svelte
<script>
  import { createLocaleStore, setGlobalLocale } from '@h-ai/ui'
  import { setLocale } from '$lib/paraglide/runtime'

  const localeStore = createLocaleStore()

  function changeLocale(code) {
    localeStore.set(code)       // 更新 UI store + 同步到 @h-ai/core
    setLocale(code)             // 同步到 Paraglide（应用层）
  }
</script>

<select value={localeStore.current} onchange={(e) => changeLocale(e.currentTarget.value)}>
  {#each localeStore.supported as l}
    <option value={l.code}>{l.label}</option>
  {/each}
</select>
```

### 导出的 i18n 工具

```ts
import {
  createLocaleStore, // Svelte 响应式 locale store
  DEFAULT_LOCALE, // 默认 locale: 'zh-CN'
  DEFAULT_LOCALES, // 支持的 locale 列表
  detectBrowserLocale, // 检测浏览器语言
  getGlobalLocale, // 获取当前全局 locale
  interpolate, // 字符串插值（如 "Hello {name}"）
  isLocaleSupported, // 检查 locale 是否支持
  resolveLocale, // 解析 locale（支持回退）
  setGlobalLocale, // 设置全局 locale（同步 @h-ai/core）
} from '@h-ai/ui'
```

## 其他导出

```ts
// 类型
import type { ButtonProps, InputProps, ModalProps } from '@h-ai/ui'
```

```ts
// 样式工具
import { cn, generateId, getSizeClass, getVariantClass } from '@h-ai/ui'
```

```ts
// Toast 单例
import { toast } from '@h-ai/ui'
```
