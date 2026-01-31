# @hai/ui - UI 组件库

> Svelte 5 Runes 组件库，专为管理后台设计

## 安装

```bash
pnpm add @hai/ui
```

## 组件架构

组件按三层划分：

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

### 原子组件 (primitives)

| 组件         | 描述     | 主要属性                                 |
| ------------ | -------- | ---------------------------------------- |
| `Button`     | 按钮     | `variant`, `size`, `loading`, `disabled` |
| `IconButton` | 图标按钮 | `variant`, `size`, `disabled`            |
| `Input`      | 输入框   | `type`, `label`, `error`, `hint`         |
| `Textarea`   | 文本域   | `rows`, `maxlength`                      |
| `Select`     | 下拉选择 | `options`, `placeholder`                 |
| `Checkbox`   | 复选框   | `checked`, `label`                       |
| `Switch`     | 开关     | `checked`, `label`                       |
| `Radio`      | 单选框   | `options`, `value`, `direction`          |
| `Badge`      | 徽章     | `variant`                                |
| `Avatar`     | 头像     | `src`, `size`, `alt`                     |
| `Tag`        | 标签     | `text`, `variant`, `closable`            |
| `Spinner`    | 加载动画 | `size`                                   |
| `Progress`   | 进度条   | `value`, `max`                           |

### 组合组件 (compounds)

#### 表单组合

| 组件          | 描述     | 主要属性                             |
| ------------- | -------- | ------------------------------------ |
| `Form`        | 表单容器 | `loading`, `onsubmit`                |
| `FormField`   | 表单字段 | `label`, `error`, `hint`, `required` |
| `TagInput`    | 标签输入 | `tags`, `maxTags`, `placeholder`     |
| `MultiSelect` | 多选下拉 | `options`, `selected`, `onchange`    |

#### 反馈提示

| 组件             | 描述     | 主要属性                |
| ---------------- | -------- | ----------------------- |
| `Alert`          | 警告框   | `variant`, `closable`   |
| `Toast`          | 通知消息 | `messages`, `ondismiss` |
| `ToastContainer` | 通知容器 | 全局使用                |

#### 弹层容器

| 组件      | 描述   | 主要属性                                      |
| --------- | ------ | --------------------------------------------- |
| `Modal`   | 模态框 | `open`, `title`, `size`, `closable`, `footer` |
| `Drawer`  | 抽屉   | `open`, `position`, `title`                   |
| `Confirm` | 确认框 | `title`, `message`, `variant`, `onconfirm`    |
| `Popover` | 弹出框 | `position`, `trigger`, `offset`               |

#### 数据展示

| 组件        | 描述     | 主要属性                                            |
| ----------- | -------- | --------------------------------------------------- |
| `Card`      | 卡片容器 | `title`, `padding`, `header`, `footer`, `actions`   |
| `Table`     | 基础表格 | `data`, `columns`                                   |
| `DataTable` | 数据表格 | `data`, `columns`, `keyField`, `actions`, `loading` |

#### 导航控件

| 组件         | 描述   | 主要属性                                |
| ------------ | ------ | --------------------------------------- |
| `Tabs`       | 标签页 | `items`, `activeIndex`                  |
| `Pagination` | 分页   | `currentPage`, `totalPages`, `onchange` |
| `Breadcrumb` | 面包屑 | `items`                                 |
| `Steps`      | 步骤条 | `items`, `current`, `direction`         |

#### 悬浮交互

| 组件       | 描述     | 主要属性              |
| ---------- | -------- | --------------------- |
| `Dropdown` | 下拉菜单 | `items`, `trigger`    |
| `Tooltip`  | 提示     | `content`, `position` |

#### 状态占位

| 组件       | 描述   | 主要属性                              |
| ---------- | ------ | ------------------------------------- |
| `Skeleton` | 骨架屏 | `variant`, `width`, `height`, `count` |
| `Empty`    | 空状态 | `title`, `description`, `icon`        |
| `Result`   | 结果页 | `status`, `title`, `description`      |

#### 业务展示

| 组件            | 描述         | 主要属性                          |
| --------------- | ------------ | --------------------------------- |
| `PageHeader`    | 页面头部     | `title`, `description`, `actions` |
| `ScoreBar`      | 分数条       | `value`, `max`, `size`            |
| `SeverityBadge` | 严重程度标签 | `type`, `size`                    |

#### 应用级组件

| 组件             | 描述       | 主要属性                                   |
| ---------------- | ---------- | ------------------------------------------ |
| `FeedbackModal`  | 反馈模态框 | `open`, `onsubmit`                         |
| `SettingsModal`  | 设置模态框 | `open`, `currentLanguage`, `currentTheme`  |
| `LanguageSwitch` | 语言切换   | `currentLanguage`, `languages`, `onchange` |
| `ThemeToggle`    | 主题切换   | `currentTheme`, `onchange`                 |

### 场景组件 (scenes)

#### IAM 身份认证

| 组件                 | 描述     | 主要属性                                  |
| -------------------- | -------- | ----------------------------------------- |
| `LoginForm`          | 登录表单 | `loading`, `error`, `fields`, `onsubmit`  |
| `RegisterForm`       | 注册表单 | `loading`, `error`, `fields`, `onsubmit`  |
| `PasswordInput`      | 密码输入 | `showStrength`, `showToggle`, `minLength` |
| `ChangePasswordForm` | 修改密码 | `loading`, `error`, `onsubmit`            |
| `ForgotPasswordForm` | 忘记密码 | `mode`, `loading`, `error`, `onsubmit`    |
| `ResetPasswordForm`  | 重置密码 | `loading`, `error`, `onsubmit`            |
| `UserProfile`        | 用户资料 | `user`, `editable`, `fields`, `onsubmit`  |

#### IAM 表单使用说明

- `PasswordInput` 推荐使用受控模式（`value` + `oninput`），以保证父组件状态同步。
- 注册/重置/修改密码表单在比较两次密码时会执行 **NFKC 规范化**，避免兼容字符导致的误判。

示例：

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

#### Storage 存储

| 组件           | 描述     | 主要属性                                       |
| -------------- | -------- | ---------------------------------------------- |
| `FileUpload`   | 文件上传 | `accept`, `maxSize`, `multiple`, `uploadUrl`   |
| `ImageUpload`  | 图片上传 | `value`, `accept`, `maxSize`, `aspectRatio`    |
| `AvatarUpload` | 头像上传 | `value`, `size`, `maxSize`                     |
| `FileList`     | 文件列表 | `files`, `layout`, `deletable`, `downloadable` |

#### Crypto 加密

| 组件               | 描述     | 主要属性                                          |
| ------------------ | -------- | ------------------------------------------------- |
| `EncryptedInput`   | 加密输入 | `encrypted`, `showToggle`, `copyable`             |
| `HashDisplay`      | 哈希展示 | `hash`, `algorithm`, `truncate`, `copyable`       |
| `SignatureDisplay` | 签名展示 | `signature`, `publicKey`, `algorithm`, `verified` |

## 使用示例

### 典型 CRUD 页面

```svelte
<script>
  import {
    PageHeader, Card, DataTable, Button,
    Modal, Input, Select, Toast
  } from '@hai/ui'

  let items = $state([])
  let showCreateModal = $state(false)
  let showEditModal = $state(false)
  let selectedItem = $state(null)
  let loading = $state(false)
  let toasts = $state([])

  // 表单数据
  let formData = $state({ name: '', type: '' })

  // 表格列配置
  const columns = [
    { key: 'name', label: '名称' },
    { key: 'type', label: '类型' },
    { key: 'createdAt', label: '创建时间' },
  ]

  async function handleCreate() {
    loading = true
    try {
      const res = await fetch('/api/items', {
        method: 'POST',
        body: JSON.stringify(formData),
      })
      if (res.ok) {
        showCreateModal = false
        toasts = [...toasts, { id: Date.now(), type: 'success', message: '创建成功' }]
        // 刷新列表
      }
    } finally {
      loading = false
    }
  }
</script>

<PageHeader title="项目管理" description="管理所有项目">
  {#snippet actions()}
    <Button onclick={() => showCreateModal = true}>
      <span class='icon-[tabler--plus] size-4'></span>
      新建
    </Button>
  {/snippet}
</PageHeader>

<Card>
  <DataTable
    data={items}
    {columns}
    keyField="id"
    {loading}
  >
    {#snippet actions(item)}
      <Button size="xs" onclick={() => { selectedItem = item; showEditModal = true }}>
        编辑
      </Button>
      <Button size="xs" variant="error" onclick={() => handleDelete(item)}>
        删除
      </Button>
    {/snippet}
  </DataTable>
</Card>

<!-- 创建模态框 -->
<Modal bind:open={showCreateModal} title="新建项目">
  <form onsubmit={(e) => { e.preventDefault(); handleCreate() }} class='space-y-4'>
    <Input label="名称" bind:value={formData.name} required />
    <Select
      label="类型"
      bind:value={formData.type}
      options={[
        { value: 'a', label: '类型 A' },
        { value: 'b', label: '类型 B' },
      ]}
    />
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => showCreateModal = false}>取消</Button>
    <Button {loading} onclick={handleCreate}>创建</Button>
  {/snippet}
</Modal>

<!-- 全局通知 -->
<Toast
  messages={toasts}
  ondismiss={(id) => toasts = toasts.filter(t => t.id !== id)}
/>
```

## 样式依赖

组件基于 TailwindCSS + DaisyUI，需要在项目中配置：

```js
// tailwind.config.js
export default {
  content: ['./src/**/*.{svelte,ts}', './node_modules/@hai/ui/**/*.svelte'],
  plugins: [require('daisyui')],
  daisyui: {
    themes: ['light', 'dark', 'corporate'],
  },
}
```

## 国际化 (i18n)

@hai/ui 采用**组件内置翻译**模式：

- 场景组件（`scenes/`）内置中英文翻译，开箱即用
- 组件自动响应全局 locale 变化
- 翻译文件位于 `packages/ui/messages/{zh-CN,en-US}.json`

```svelte
<script>
  import { LoginForm } from '@hai/ui'
</script>

<!-- 无需传入翻译 props，组件自动使用当前 locale -->
<LoginForm onsubmit={handleLogin} />
```

应用层只需处理**页面级文本**（标题、错误提示、导航链接等），组件内部文本由 @hai/ui 统一管理。

### createLocaleStore

用于客户端 locale 状态管理，会自动同步到 `@hai/core` 的全局 locale 管理器：

```svelte
<script>
  import { createLocaleStore } from '@hai/ui'
  import { setLocale } from '$lib/paraglide/runtime'

  const localeStore = createLocaleStore()
</script>

<select
  value={localeStore.current}
  onchange={(e) => {
    localeStore.set(e.currentTarget.value)
    setLocale(e.currentTarget.value)
  }}
>
  {#each localeStore.supported as l}
    <option value={l.code}>{l.label}</option>
  {/each}
</select>
```

### 导出的 i18n 工具

```ts
import {
  createLocaleStore, // Svelte 响应式 locale store
  DEFAULT_LOCALE, // 默认 locale ('zh-CN')
  DEFAULT_LOCALES, // 支持的 locale 列表
  detectBrowserLocale, // 检测浏览器语言
  getGlobalLocale, // 获取当前全局 locale
  interpolate, // 字符串插值
  isLocaleSupported, // 检查 locale 是否支持
  resolveLocale, // 解析 locale（支持回退）
  setGlobalLocale, // 设置全局 locale（同步所有模块）
} from '@hai/ui'
```

## 图标

组件使用 Iconify (Tabler Icons)，需要安装：

```bash
pnpm add -D @iconify/tailwind4 @iconify-json/tabler
```

```js
// tailwind.config.js
plugins: [
  require('@iconify/tailwind4').addIconSelectors(['tabler']),
]
```
