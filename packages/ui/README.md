# @hai/ui - UI 组件库

> 基于 Svelte 5 Runes 的管理后台 UI 组件库，采用 DaisyUI + TailwindCSS 样式方案，内置 i18n（zh-CN / en-US），支持 32+ 主题。

## 安装

```bash
pnpm add @hai/ui
```

依赖 `@hai/core`（会自动安装）。

## 快速开始

```svelte
<script>
  import { Button, Input, Card } from '@hai/ui'
</script>

<Card title="示例表单">
  <Input placeholder="请输入用户名" />
  <Button variant="primary" onclick={handleSubmit}>提交</Button>
</Card>
```

## 自动导入（推荐）

启用预处理器后，页面中可直接使用 `@hai/ui` 组件，无需逐个 import：

```js
// svelte.config.js
import adapter from '@sveltejs/adapter-auto'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import { autoImportHaiUi } from '@hai/ui/auto-import'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: [autoImportHaiUi(), vitePreprocess()],
  kit: { adapter: adapter() },
}

export default config
```

启用后可直接在模板中使用：

```svelte
<!-- 无需 import { Button } from '@hai/ui' -->
<Button variant="primary">提交</Button>
```

## 组件架构

组件按三层划分（primitives → compounds → scenes）：

```
components/
├── primitives/   # 原子组件（不可再分的基础 UI 单元）
├── compounds/    # 组合组件（由原子组件组合而成）
└── scenes/       # 场景组件（面向具体业务场景的完整 UI 流程）
    ├── iam/      # 身份认证
    ├── storage/  # 存储管理
    └── crypto/   # 加密展示
```

## 组件清单

### 原子组件 Primitives（20 个）

| 组件 | 描述 | 主要属性 |
|------|------|----------|
| `Button` | 按钮 | `variant`, `size`, `loading`, `disabled`, `outline`, `circle` |
| `IconButton` | 图标按钮 | `icon`, `variant`, `size`, `tooltip`, `loading` |
| `BareButton` | 无样式按钮 | `class`, `ariaLabel`, `role`, `tabindex` |
| `Input` | 输入框 | `type`, `value`, `size`, `error`, `validationMessage` |
| `BareInput` | 无样式输入框 | `type`, `class`, `accept`, `multiple` |
| `Textarea` | 文本域 | `value`, `rows`, `size`, `autoResize`, `error` |
| `Select` | 下拉选择 | `options`, `value`, `placeholder`, `size` |
| `Checkbox` | 复选框 | `checked`, `label`, `size`, `indeterminate` |
| `Switch` | 开关 | `checked`, `label`, `size` |
| `Radio` | 单选组 | `options`, `value`, `direction`, `size` |
| `ToggleCheckbox` | 原生开关输入 | `checked`, `name`, `onchange` |
| `ToggleInput` | 原生切换输入 | `checked`, `name` |
| `ToggleRadio` | 原生单选输入 | `checked`, `name`, `onchange` |
| `Range` | 滑块 | `value`, `min`, `max`, `step` |
| `Rating` | 评分 | `value`, `max` |
| `Badge` | 徽章 | `variant`, `size`, `outline` |
| `Avatar` | 头像 | `src`, `name`, `size`, `shape`, `ring` |
| `Tag` | 标签 | `text`, `variant`, `size`, `closable` |
| `Spinner` | 加载动画 | `size`, `variant` |
| `Progress` | 进度条 | `value`, `max`, `variant`, `striped`, `animated` |

### 组合组件 Compounds（35 个）

#### 表单

| 组件 | 描述 | 主要属性 |
|------|------|----------|
| `Form` | 表单容器 | `loading`, `disabled`, `onsubmit` |
| `FormField` | 表单字段 | `label`, `error`, `hint`, `required` |
| `TagInput` | 标签输入 | `tags`, `maxTags`, `allowDuplicates`, `size` |
| `MultiSelect` | 多选下拉 | `options`, `selected`, `onchange` |

#### 反馈

| 组件 | 描述 | 主要属性 |
|------|------|----------|
| `Alert` | 警告框 | `variant`, `title`, `dismissible` |
| `Toast` | 通知消息 | `message`, `variant`, `duration`, `position` |
| `ToastContainer` | 通知容器 | 全局放置，配合 `toast` 单例使用 |

#### 弹层

| 组件 | 描述 | 主要属性 |
|------|------|----------|
| `Modal` | 模态框 | `open`, `title`, `size`, `closeOnBackdrop`, `showClose` |
| `Drawer` | 抽屉 | `open`, `position`, `title`, `size` |
| `Confirm` | 确认框 | `open`, `title`, `message`, `variant`, `onconfirm` |
| `Popover` | 弹出层 | `open`, `position`, `trigger`, `offset` |

#### 数据展示

| 组件 | 描述 | 主要属性 |
|------|------|----------|
| `Card` | 卡片容器 | `title`, `bordered`, `shadow`, `padding` |
| `Table` | 基础表格 | `data`, `columns`, `striped`, `hoverable` |
| `DataTable` | 数据表格 | `data`, `columns`, `keyField`, `loading` |
| `Accordion` | 手风琴 | `items: AccordionItem[]` |
| `Timeline` | 时间线 | `items: TimelineItem[]` |
| `ScoreBar` | 分数条 | `value`, `max`, `size` |
| `SeverityBadge` | 严重程度标签 | `type`, `size` |

#### 导航

| 组件 | 描述 | 主要属性 |
|------|------|----------|
| `Tabs` | 标签页 | `items`, `active`, `type`, `size` |
| `Pagination` | 分页 | `page`, `total`, `pageSize`, `showTotal` |
| `Breadcrumb` | 面包屑 | `items`, `separator` |
| `Steps` | 步骤条 | `items`, `current`, `direction`, `clickable` |
| `Dropdown` | 下拉菜单 | `items`, `trigger`, `position` |
| `Tooltip` | 提示 | `content`, `position`, `delay` |

#### 状态占位

| 组件 | 描述 | 主要属性 |
|------|------|----------|
| `Skeleton` | 骨架屏 | `variant`, `width`, `height`, `count` |
| `Empty` | 空状态 | `title`, `description`, `icon` |
| `Result` | 结果页 | `status`, `title`, `description` |

#### 业务 / 应用级

| 组件 | 描述 | 主要属性 |
|------|------|----------|
| `PageHeader` | 页面头部 | `title`, `description`，支持 `actions` 插槽 |
| `FeedbackModal` | 反馈模态框 | `open`, `onsubmit` |
| `SettingsModal` | 设置模态框 | `open`, `currentLanguage`, `currentTheme` |
| `LanguageSwitch` | 语言切换 | `currentLanguage`, `languages`, `onchange` |
| `ThemeSelector` | 主题选择器 | 完整主题选择面板 |
| `ThemeToggle` | 主题切换 | `currentTheme`, `onchange` |

### 场景组件 Scenes（14 个）

#### IAM 身份认证（7 个）

| 组件 | 描述 | 主要属性 |
|------|------|----------|
| `LoginForm` | 登录表单 | `loading`, `errors`, `showRememberMe`, `onsubmit` |
| `RegisterForm` | 注册表单 | `loading`, `errors`, `fields`, `onsubmit` |
| `ForgotPasswordForm` | 忘记密码 | `mode`, `loading`, `errors`, `onsubmit` |
| `ResetPasswordForm` | 重置密码 | `loading`, `errors`, `showCode`, `onsubmit` |
| `ChangePasswordForm` | 修改密码 | `loading`, `errors`, `requireOldPassword`, `onsubmit` |
| `PasswordInput` | 密码输入框 | `value`, `showToggle`, `showStrength`, `minLength` |
| `UserProfile` | 用户资料 | `user`, `editable`, `fields`, `onsubmit` |

#### Storage 存储（4 个）

| 组件 | 描述 | 主要属性 |
|------|------|----------|
| `FileUpload` | 文件上传 | `accept`, `maxSize`, `maxFiles`, `multiple`, `uploadUrl` |
| `ImageUpload` | 图片上传 | `value`, `accept`, `maxSize`, `aspectRatio` |
| `AvatarUpload` | 头像上传 | `value`, `size`, `maxSize`, `fallback` |
| `FileList` | 文件列表 | `files`, `layout`, `showDelete`, `showDownload` |

#### Crypto 加密展示（3 个）

| 组件 | 描述 | 主要属性 |
|------|------|----------|
| `EncryptedInput` | 加密输入 | `value`, `encryptedValue`, `algorithm`, `showEncrypted` |
| `HashDisplay` | 哈希展示 | `value`, `algorithm`, `copyable`, `truncate` |
| `SignatureDisplay` | 签名展示 | `signature`, `publicKey`, `algorithm`, `verified` |

## 使用示例

### Toast 通知

```svelte
<script>
  import { toast, ToastContainer } from '@hai/ui'

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
  } from '@hai/ui'

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

### 登录页面

```svelte
<script>
  import { LoginForm } from '@hai/ui'

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
  import { PasswordInput } from '@hai/ui'

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

组件基于 TailwindCSS v4 + DaisyUI。在应用层 `app.css` 中声明主题：

```css
/* app.css */
@import 'tailwindcss';

@plugin "daisyui" {
  themes: light --default, dark --prefersdark, cupcake, bumblebee, emerald,
    corporate, retro, valentine, garden, aqua, lofi, pastel, fantasy,
    wireframe, cmyk, autumn, acid, lemonade, winter, nord,
    synthwave, cyberpunk, halloween, forest, black, luxury, dracula,
    business, night, coffee, dim, sunset
}
```

### 图标

组件使用 Iconify (Tabler Icons)：

```bash
pnpm add -D @iconify/tailwind4 @iconify-json/tabler
```

```css
/* app.css */
@plugin "@iconify/tailwind4" {
  prefixes: tabler
}
```

### 主题切换

使用内置的主题工具函数管理 32 个 DaisyUI 主题：

```ts
import {
  THEMES,           // ThemeInfo[] — 全部 32 个主题元数据
  THEME_GROUPS,     // 按亮色/暗色分组
  applyTheme,       // 应用主题（自动持久化到 localStorage）
  getCurrentTheme,  // 获取当前主题
  isDarkTheme,      // 检查是否暗色主题
  getThemeInitScript, // 防闪烁脚本（放在 app.html <head> 中）
} from '@hai/ui'
```

在 `app.html` 中添加防闪烁脚本：

```html
<head>
  <script>{@html getThemeInitScript()}</script>
</head>
```

## 国际化 (i18n)

@hai/ui 采用**组件内置翻译**模式：

- 场景组件（`scenes/`）内置中英文翻译（zh-CN / en-US），开箱即用
- 组件自动响应全局 locale 变化（通过 `@hai/core` 同步）
- 应用层只需处理**页面级文本**，组件内部文本由 @hai/ui 统一管理
- 如需覆盖特定文本，通过 `submitText`、`labels` 等 props 传入

### createLocaleStore

用于客户端 locale 状态管理，自动同步到 `@hai/core` 全局 locale 管理器：

```svelte
<script>
  import { createLocaleStore, setGlobalLocale } from '@hai/ui'
  import { setLocale } from '$lib/paraglide/runtime'

  const localeStore = createLocaleStore()

  function changeLocale(code) {
    localeStore.set(code)       // 更新 UI store + 同步到 @hai/core
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
  createLocaleStore,    // Svelte 响应式 locale store
  DEFAULT_LOCALE,       // 默认 locale: 'zh-CN'
  DEFAULT_LOCALES,      // 支持的 locale 列表
  detectBrowserLocale,  // 检测浏览器语言
  getGlobalLocale,      // 获取当前全局 locale
  interpolate,          // 字符串插值（如 "Hello {name}"）
  isLocaleSupported,    // 检查 locale 是否支持
  resolveLocale,        // 解析 locale（支持回退）
  setGlobalLocale,      // 设置全局 locale（同步 @hai/core）
} from '@hai/ui'
```

## 其他导出

```ts
// 样式工具
import { cn, getVariantClass, getSizeClass, generateId } from '@hai/ui'

// Toast 单例
import { toast } from '@hai/ui'

// 类型（50+ 接口）
import type { ButtonProps, InputProps, ModalProps, ... } from '@hai/ui'
```
