---
name: hai-ui
description: 使用 @h-ai/ui 构建应用界面，包含三层组件架构（原子/组合/场景）、DaisyUI 样式 + Bits UI headless 交互、自动导入、主题系统与 i18n 集成；当需求涉及界面、表单、表格、Modal、Toast、Combobox、DatePicker、日历、上传组件、登录/注册表单或主题切换时使用。
---

# hai-ui

> `@h-ai/ui` 是基于 Svelte 5 Runes 的应用界面 UI 组件库，采用 DaisyUI v5 + Tailwind CSS v4 样式 + Bits UI v2 headless 交互，支持 32 主题、内置中英文 i18n、自动导入。

---

## 适用场景

- 构建管理后台页面（表单、表格、弹窗、导航等）
- 使用 Bits UI headless 交互组件（Combobox、DatePicker、Calendar）
- 使用 IAM 场景组件（登录/注册/密码/用户资料表单）
- 使用 Storage 场景组件（文件上传/图片上传/文件列表）
- 使用 App 场景组件（反馈、设置、主题/语言切换）
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

配置后，模板中直接使用组件名，无需手动 import。

> **DOM 同名冲突**：`Range` 和 `FileList` 与浏览器全局类型同名，auto-import 的全局声明无法覆盖 `lib.dom.d.ts`，**必须显式 import**：
>
> ```svelte
> <script lang="ts">
>   import { Range } from '@h-ai/ui'     // 不可省略
>   import { FileList } from '@h-ai/ui'  // 不可省略
> </script>
> ```

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

### 原子组件（Primitives，21 个）

基础交互元素，无业务依赖。

| 组件             | Props 要点                                                    | 说明         |
| ---------------- | ------------------------------------------------------------- | ------------ |
| `Button`         | `variant`, `size`, `loading`, `disabled`, `outline`, `circle` | 按钮         |
| `IconButton`     | `icon: string \| Snippet`, `tooltip`, `variant`, `size`       | 图标按钮     |
| `BareButton`     | `class`, `ariaLabel`, `role`, `tabindex`                      | 无样式按钮   |
| `Input`          | `value`, `type`, `size`, `error`, `placeholder`               | 输入框       |
| `BareInput`      | `type`, `class`, `accept`, `multiple`                         | 无样式输入框 |
| `Textarea`       | `value`, `rows`, `autoResize`, `error`                        | 文本域       |
| `Select`         | `value`, `options: SelectOption[]`, `placeholder`             | 下拉选择     |
| `Checkbox`       | `checked`, `label`, `indeterminate`                           | 复选框       |
| `Switch`         | `checked`, `label`, `size`                                    | 开关         |
| `Radio`          | `value`, `options`, `direction`                               | 单选组       |
| `Range`          | `value`, `min`, `max`, `step`, `variant`, `size`              | 滑块         |
| `Rating`         | `value`, `max`                                                | 评分         |
| `Badge`          | `variant`, `size`, `outline`                                  | 徽标         |
| `Avatar`         | `src`, `name`, `size`, `shape`                                | 头像         |
| `Tag`            | `text`, `variant`, `closable`                                 | 标签         |
| `Spinner`        | `size`, `variant`                                             | 加载动画     |
| `Progress`       | `value`, `max`, `striped`, `animated`                         | 进度条       |
| `ToggleCheckbox` | `checked`, `name`, `onchange`                                 | 原生开关输入 |
| `ToggleInput`    | `checked`, `name`                                             | 原生切换输入 |
| `ToggleRadio`    | `checked`, `name`, `onchange`                                 | 原生单选输入 |

**通用类型**：

```typescript
type Variant = 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info' | 'ghost' | 'link' | 'outline'
type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl'
```

### 组合组件（Compounds，25 个）

由原子组件 + Bits UI headless 交互组合，处理通用交互模式。

| 组件             | Props 要点                                                         | 技术基座      | 说明                    |
| ---------------- | ------------------------------------------------------------------ | ------------- | ----------------------- |
| `Form`           | `loading`, `disabled`, `onsubmit`                                  | DaisyUI       | 表单容器                |
| `FormField`      | `label`, `name`, `error`, `hint`, `required`                       | DaisyUI       | 表单字段                |
| `Alert`          | `variant`, `title`, `dismissible`                                  | DaisyUI       | 提示框                  |
| `ToastContainer` | 通过 `toast.success()` 等调用                                      | DaisyUI store | 全局消息                |
| `Modal`          | `open`, `title`, `size`, `closeOnBackdrop`                         | DaisyUI       | 模态框                  |
| `Drawer`         | `open`, `position`, `size`                                         | DaisyUI       | 抽屉                    |
| `Confirm`        | `open`, `title`, `message`, `onconfirm`                            | DaisyUI       | 确认框                  |
| `Card`           | `title`, `bordered`, `shadow`, `padding`                           | DaisyUI       | 卡片                    |
| `DataTable`      | `data`, `columns`, `keyField`, snippet slots                       | DaisyUI       | 数据表格                |
| `Combobox`       | `options`, `value`, `multiple`, `placeholder`, `error`, `onchange` | **Bits UI**   | 可搜索选择（单选/多选） |
| `Calendar`       | `value`, `minValue`, `maxValue`                                    | **Bits UI**   | 独立日历                |
| `DatePicker`     | `value`, `minValue`, `maxValue`, `error`                           | **Bits UI**   | 日期输入+弹出           |
| `Tabs`           | `items: TabItem[]`, `active`, `type`                               | DaisyUI       | 标签页                  |
| `Pagination`     | `page`, `total`, `pageSize`, `onchange`                            | DaisyUI       | 分页                    |
| `Breadcrumb`     | `items: BreadcrumbItem[]`                                          | DaisyUI       | 面包屑                  |
| `Steps`          | `items: StepItem[]`, `current`                                     | DaisyUI       | 步骤条                  |
| `Dropdown`       | `items: DropdownItem[]`, `trigger`                                 | DaisyUI       | 下拉菜单                |
| `Tooltip`        | `content`, `position`, `delay`                                     | DaisyUI       | 文字提示                |
| `Popover`        | `open`, `position`, `trigger`                                      | DaisyUI       | 弹出层                  |
| `TagInput`       | `tags`, `maxTags`, `allowDuplicates`                               | DaisyUI       | 标签输入                |
| `Accordion`      | `items: AccordionItem[]`                                           | DaisyUI       | 折叠面板                |
| `Timeline`       | `items: TimelineItem[]`                                            | DaisyUI       | 时间线                  |
| `Skeleton`       | `variant`, `count`, `animation`                                    | DaisyUI       | 骨架屏                  |
| `Empty`          | `title`, `description`, `icon`                                     | DaisyUI       | 空状态                  |
| `Result`         | `status`, `title`, `description`                                   | DaisyUI       | 结果页                  |
| `PageHeader`     | `title`, `description`, snippet `actions`                          | DaisyUI       | 页面头部                |

> **已删除**：`MultiSelect` 已合并至 `Combobox`，通过 `multiple` 属性切换单选/多选模式。

#### Toast 用法

`toast` 是函数调用而非组件标签，**必须显式 import**。`ToastContainer` 为组件，可自动导入。

```svelte
<script>
  import { toast } from '@h-ai/ui'  // 函数，不可省略
</script>

<ToastContainer />

<Button onclick={() => toast.success('保存成功')}>保存</Button>
<Button onclick={() => toast.error('操作失败', 5000)}>测试</Button>
```

#### Bits UI 组件用法

Combobox、Calendar、DatePicker 基于 Bits UI headless + DaisyUI 样式，日期值使用 `@internationalized/date`。

**Combobox（可搜索选择，支持单选/多选）**：

```svelte
<!-- 单选模式（默认） -->
<script lang="ts">
  let role = $state<string>('')
  const roles = [
    { value: 'admin', label: '管理员' },
    { value: 'editor', label: '编辑' },
    { value: 'viewer', label: '访客' },
  ]
</script>

<FormField label="角色" required>
  <Combobox options={roles} bind:value={role} placeholder="搜索角色..." />
</FormField>
```

```svelte
<!-- 多选模式 -->
<script lang="ts">
  let skills = $state<string[]>([])
  const skillOptions = [
    { value: 'svelte', label: 'Svelte' },
    { value: 'react', label: 'React' },
    { value: 'vue', label: 'Vue' },
  ]
</script>

<FormField label="技能">
  <Combobox options={skillOptions} bind:value={skills} multiple placeholder="搜索技能..." />
</FormField>
```

> `MultiSelect` 已删除，统一使用 `Combobox` + `multiple` 属性。多选模式下 `value` 为 `string[]`，已选项以标签形式展示。

**Calendar（独立日历）**：

```svelte
<script lang="ts">
  import { CalendarDate } from '@internationalized/date'
  import type { DateValue } from '@internationalized/date'

  let date = $state<DateValue>(new CalendarDate(2025, 1, 1))
</script>

<Calendar bind:value={date} weekStartsOn={1} />
```

**DatePicker（日期输入 + 弹出日历）**：

```svelte
<script lang="ts">
  import { CalendarDate } from '@internationalized/date'
  import type { DateValue } from '@internationalized/date'

  let birthday = $state<DateValue>(new CalendarDate(2000, 1, 1))
</script>

<FormField label="出生日期">
  <DatePicker bind:value={birthday} />
</FormField>
```

### 场景组件（Scenes）

面向业务场景的完整功能组件，**内置中英文翻译**。

#### App 场景组件

应用级通用功能，可直接用于后台、设置页。

| 组件             | Props 要点         | 说明                  |
| ---------------- | ------------------ | --------------------- |
| `FeedbackModal`  | `open`, `onsubmit` | 用户反馈模态框        |
| `SettingsModal`  | `open`, `onclose`  | 应用设置（语言+主题） |
| `LanguageSwitch` | 无需 Props         | 语言切换下拉          |
| `ThemeSelector`  | 无需 Props         | 完整主题列表选择器    |
| `ThemeToggle`    | 无需 Props         | 明/暗主题快速切换     |

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

## 统一组件模式

### 列表页模式

```svelte
<PageHeader title="用户管理" description="管理系统中的所有用户">
  {#snippet actions()}
    <Button variant="primary" onclick={handleCreate}>新建</Button>
  {/snippet}
</PageHeader>

<Card>
  <DataTable
    data={users}
    columns={[
      { key: 'name', label: '姓名' },
      { key: 'email', label: '邮箱' },
      { key: 'role', label: '角色' },
    ]}
    keyField="id"
    loading={isLoading}
  >
    {#snippet actions(item)}
      <Button size="xs" variant="ghost" onclick={() => handleEdit(item)}>编辑</Button>
      <Button size="xs" variant="ghost" onclick={() => handleDelete(item)}>删除</Button>
    {/snippet}
  </DataTable>
  <Pagination total={total} bind:page={currentPage} pageSize={20} onchange={loadPage} />
</Card>
```

### 表单页模式

```svelte
<PageHeader title="编辑用户" />

<Card>
  <Form onsubmit={handleSubmit} loading={saving}>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <FormField label="姓名" required error={errors.name}>
        <Input bind:value={form.name} />
      </FormField>
      <FormField label="角色" required>
        <Combobox options={roleOptions} bind:value={form.role} placeholder="选择角色" />
      </FormField>
      <FormField label="入职日期">
        <DatePicker bind:value={form.joinDate} />
      </FormField>
    </div>
    <div class="mt-6 flex gap-2">
      <Button variant="primary" type="submit">保存</Button>
      <Button onclick={goBack}>取消</Button>
    </div>
  </Form>
</Card>

<Confirm
  bind:open={showDiscard}
  title="放弃编辑？"
  message="未保存的更改将丢失"
  onconfirm={goBack}
/>
```

### 详情页模式

```svelte
<PageHeader title={item.name}>
  {#snippet actions()}
    <Button variant="primary" onclick={handleEdit}>编辑</Button>
    <Button variant="error" outline onclick={() => confirmOpen = true}>删除</Button>
  {/snippet}
</PageHeader>

<Tabs items={detailTabs} bind:active={activeTab} />

{#if activeTab === 'info'}
  <Card>
    <div class="grid grid-cols-2 gap-4">
      <FormField label="名称"><span>{item.name}</span></FormField>
      <FormField label="状态"><Badge variant={item.active ? 'success' : 'default'}>{item.status}</Badge></FormField>
    </div>
  </Card>
{:else if activeTab === 'logs'}
  <Card>
    <Timeline items={logItems} />
  </Card>
{/if}

<Confirm bind:open={confirmOpen} title="确认删除" variant="error" onconfirm={handleDelete} />
```

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
3. **双向绑定**：支持 `bind:open`（Modal/Drawer）、`bind:value`（Input/Select/Combobox/DatePicker/Calendar）
4. **PasswordInput 推荐受控模式**：`value` + `oninput` 保证状态同步
5. **三层依赖红线**：primitives 不依赖上层，compounds 只依赖 primitives + Bits UI，scenes 可依赖两者
6. **不修改内部翻译文件**：自定义文本通过 Props 覆盖
7. **日期类型**：Bits UI 日历/日期选择器使用 `@internationalized/date` 的 `DateValue` / `CalendarDate` 类型
8. **新增 headless 组件**：优先使用 Bits UI 构建，DaisyUI 仅负责样式，保持交互与样式分离
9. **自动导入例外**：`toast`（函数）、类型导入（`LoginFormData` 等）、`Range`/`FileList`（DOM 同名冲突）必须显式 `import`
10. **Combobox 统一单选/多选**：`MultiSelect` 已删除，统一通过 `Combobox` 的 `multiple` 属性切换

---

## 相关 Skills

- `hai-build`：项目架构与技能导航
- `hai-kit`：SvelteKit 集成（Handle/Guard/Response 与 UI 配合使用）
- `hai-iam`：IAM 模块 API（与 LoginForm/RegisterForm 配合）
- `hai-storage`：Storage 模块 API（与 FileUpload 配合）
- `hai-crypto`：Crypto 模块 API（与 EncryptedInput 配合）
