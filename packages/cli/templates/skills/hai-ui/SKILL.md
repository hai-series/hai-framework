---
name: hai-ui
description: 使用 @h-ai/ui 构建应用界面，包含三层组件架构（原子/组合/场景）、自动导入、主题系统与 i18n 集成；当需求涉及表单、表格、Modal、Toast、上传组件、登录/注册表单或主题切换时使用。
---

# hai-ui

> `@h-ai/ui` 是基于 Svelte 5 Runes 的应用界面 UI 组件库，采用 DaisyUI + TailwindCSS v4，支持 32 主题、内置中英文 i18n、自动导入。

---

## 适用场景

- 构建管理后台页面（表单、表格、弹窗、导航等）
- 使用 IAM 场景组件（登录/注册/密码/用户资料表单）
- 使用 Storage 场景组件（文件上传/图片上传/文件列表）
- 配置主题切换与 i18n 多语言
- 需要了解组件 Props 接口

---

## 使用步骤

### 1. 配置自动导入

```typescript
// svelte.config.js
import { autoImportHaiUi } from '@h-ai/ui/auto-import'

const config = {
  preprocess: [autoImportHaiUi(), vitePreprocess()],
}
```

配置后，模板中直接使用组件名，无需手动 import（支持全部 58 个组件）。

### 2. 在模板中使用

```svelte
<script lang="ts">
  // 自动导入模式下无需 import
  let name = $state('')
</script>

<Card title="用户信息">
  <FormField label="姓名" required>
    <Input bind:value={name} placeholder="请输入姓名" />
  </FormField>
  <Button variant="primary" onclick={() => save()}>保存</Button>
</Card>
```

---

## 三层组件架构

### 原子组件（Primitives）

基础交互元素，无业务依赖。

| 组件         | Props 要点                                                    | 说明     |
| ------------ | ------------------------------------------------------------- | -------- |
| `Button`     | `variant`, `size`, `loading`, `disabled`, `outline`, `circle` | 按钮     |
| `IconButton` | `icon`, `tooltip`, `variant`, `size`                          | 图标按钮 |
| `Input`      | `value`, `type`, `size`, `error`, `placeholder`               | 输入框   |
| `Textarea`   | `value`, `rows`, `autoResize`, `error`                        | 文本域   |
| `Select`     | `value`, `options: SelectOption[]`, `placeholder`             | 下拉选择 |
| `Checkbox`   | `checked`, `label`, `indeterminate`                           | 复选框   |
| `Switch`     | `checked`, `label`, `size`                                    | 开关     |
| `Radio`      | `value`, `options`, `direction`                               | 单选组   |
| `Badge`      | `variant`, `size`, `outline`                                  | 徽标     |
| `Avatar`     | `src`, `name`, `size`, `shape`                                | 头像     |
| `Tag`        | `text`, `variant`, `closable`                                 | 标签     |
| `Spinner`    | `size`, `variant`                                             | 加载动画 |
| `Progress`   | `value`, `max`, `striped`, `animated`                         | 进度条   |

**通用类型**：

```typescript
type Variant = 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info' | 'ghost' | 'link' | 'outline'
type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl'
```

### 组合组件（Compounds）

由原子组件组合，处理通用交互模式。

| 组件                       | Props 要点                                   | 说明     |
| -------------------------- | -------------------------------------------- | -------- |
| `Form`                     | `loading`, `disabled`, `onsubmit`            | 表单容器 |
| `FormField`                | `label`, `name`, `error`, `hint`, `required` | 表单字段 |
| `Alert`                    | `variant`, `title`, `dismissible`            | 提示框   |
| `Toast` + `ToastContainer` | 通过 `toast.success()` 等调用                | 全局消息 |
| `Modal`                    | `open`, `title`, `size`, `closeOnBackdrop`   | 模态框   |
| `Drawer`                   | `open`, `position`, `size`                   | 抽屉     |
| `Confirm`                  | `open`, `title`, `message`, `onconfirm`      | 确认框   |
| `Card`                     | `title`, `bordered`, `shadow`, `padding`     | 卡片     |
| `Table`                    | `data`, `columns: TableColumn[]`, `loading`  | 表格     |
| `Tabs`                     | `items: TabItem[]`, `active`, `type`         | 标签页   |
| `Pagination`               | `page`, `total`, `pageSize`, `onchange`      | 分页     |
| `Breadcrumb`               | `items: BreadcrumbItem[]`                    | 面包屑   |
| `Steps`                    | `items: StepItem[]`, `current`               | 步骤条   |
| `Dropdown`                 | `items: DropdownItem[]`, `trigger`           | 下拉菜单 |
| `Tooltip`                  | `content`, `position`, `delay`               | 文字提示 |
| `Popover`                  | `open`, `position`, `trigger`                | 弹出层   |
| `TagInput`                 | `tags`, `maxTags`, `allowDuplicates`         | 标签输入 |
| `Accordion`                | `items: AccordionItem[]`                     | 折叠面板 |
| `Timeline`                 | `items: TimelineItem[]`                      | 时间线   |
| `Skeleton`                 | `variant`, `count`, `animation`              | 骨架屏   |
| `Empty`                    | `title`, `description`, `icon`               | 空状态   |
| `Result`                   | `status`, `title`, `description`             | 结果页   |

#### Toast 用法

```svelte
<script>
  import { toast } from '@h-ai/ui'
</script>

<ToastContainer />

<Button onclick={() => toast.success('保存成功')}>保存</Button>
<Button onclick={() => toast.error('操作失败', 5000)}>测试</Button>
```

### 场景组件（Scenes）

面向业务场景的完整功能组件，**内置中英文翻译**。

#### IAM 场景组件

| 组件                 | Props 要点                                                      | 说明       |
| -------------------- | --------------------------------------------------------------- | ---------- |
| `LoginForm`          | `showRememberMe`, `showRegisterLink`, `errors`, `onsubmit`      | 登录表单   |
| `RegisterForm`       | `fields`, `minPasswordLength`, `showPasswordStrength`, `errors` | 注册表单   |
| `ForgotPasswordForm` | `mode: 'email'\|'phone'`, `errors`                              | 忘记密码   |
| `ResetPasswordForm`  | `showCode`, `minPasswordLength`, `errors`                       | 重置密码   |
| `ChangePasswordForm` | `requireOldPassword`, `errors`                                  | 修改密码   |
| `PasswordInput`      | `showToggle`, `showStrength`, `value`                           | 密码输入框 |
| `UserProfile`        | `user`, `editable`, `fields`, `avatarUploadUrl`                 | 用户资料   |

**LoginForm 用法**：

```svelte
<script lang="ts">
  import type { LoginFormData } from '@h-ai/ui'

  let loading = $state(false)
  let errors = $state<Record<string, string>>({})

  async function handleLogin(data: LoginFormData) {
    loading = true
    errors = {}
    const result = await login(data)
    if (!result.success) {
      errors = { general: result.error.message }
    }
    loading = false
  }
</script>

<LoginForm
  {loading}
  {errors}
  showRegisterLink
  registerUrl="/register"
  onsubmit={handleLogin}
/>
```

**errors 约定**：`Record<string, string>`，key 为字段名，`general` 表示全局错误。

#### Storage 场景组件

| 组件           | Props 要点                                                             | 说明     |
| -------------- | ---------------------------------------------------------------------- | -------- |
| `FileUpload`   | `accept`, `maxSize`, `maxFiles`, `uploadUrl`, `autoUpload`, `dragDrop` | 文件上传 |
| `ImageUpload`  | `value`, `uploadUrl`, `aspectRatio`, `maxSize`                         | 图片上传 |
| `AvatarUpload` | `value`, `uploadUrl`, `size`, `fallback`                               | 头像上传 |
| `FileList`     | `files: FileItem[]`, `layout`, `showPreview`, `showDelete`             | 文件列表 |

#### Crypto 场景组件

| 组件               | Props 要点                            | 说明       |
| ------------------ | ------------------------------------- | ---------- |
| `EncryptedInput`   | `value`, `onencrypt`, `showEncrypted` | 加密输入框 |
| `HashDisplay`      | `value`, `algorithm`, `copyable`      | 哈希值展示 |
| `SignatureDisplay` | `signature`, `publicKey`, `verified`  | 签名展示   |

---

## 主题系统

支持 32 个 DaisyUI 主题（19 亮色 + 13 暗色）。

```typescript
import { applyTheme, getCurrentTheme, getThemeInitScript, THEMES } from '@h-ai/ui'

// 应用主题（自动持久化到 localStorage）
applyTheme('dark')

// 获取当前主题
const theme = getCurrentTheme()

// 防闪烁：在 app.html <head> 中插入
const script = getThemeInitScript()
```

主题列表：`light`、`dark`、`cupcake`、`bumblebee`、`emerald`、`corporate`、`synthwave`、`cyberpunk`、`valentine`、`halloween`、`garden`、`forest`、`aqua`、`lofi`、`pastel`、`fantasy`、`wireframe`、`black`、`luxury`、`dracula`、`cmyk`、`autumn`、`business`、`acid`、`lemonade`、`night`、`coffee`、`winter`、`dim`、`nord`、`sunset`、`retro`。

---

## i18n 集成

场景组件内置中英文翻译，自动响应全局 locale，**应用层无需为 UI 组件提供翻译**。

### Locale 切换

```typescript
import { createLocaleStore, setGlobalLocale } from '@h-ai/ui'

const localeStore = createLocaleStore()

function changeLocale(code: string) {
  localeStore.set(code) // 同步 UI + @h-ai/core
  setLocale(code) // 同步 Paraglide（应用层 i18n）
}
```

### 可选覆盖

通过 `submitText`、`labels` 等 Props 覆盖特定文本：

```svelte
<LoginForm submitText="立即登录" />
```

---

## 重要约定

1. **Svelte 5 Runes**：使用 `$state`、`$derived`、`$effect`，不使用 Svelte 4 的 `$:` 或 stores
2. **Snippet 插槽**：使用 `{#snippet name()}...{/snippet}` 语法，不使用 `<slot>`
3. **双向绑定**：支持 `bind:open`（Modal/Drawer）、`bind:value`（Input/Select）
4. **PasswordInput 推荐受控模式**：`value` + `oninput` 保证状态同步
5. **三层依赖红线**：primitives 不依赖上层，compounds 只依赖 primitives，scenes 可依赖两者
6. **不修改内部翻译文件**：自定义文本通过 Props 覆盖

---

## 相关 Skills

- `hai-build`：项目架构与技能导航
- `hai-kit`：SvelteKit 集成（Handle/Guard/Response 与 UI 配合使用）
- `hai-iam`：IAM 模块 API（与 LoginForm/RegisterForm 配合）
- `hai-storage`：Storage 模块 API（与 FileUpload 配合）
- `hai-crypto`：Crypto 模块 API（与 EncryptedInput 配合）
