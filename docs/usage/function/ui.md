# @h-ai/ui 功能说明

[English](ui.en.md) · [日本語](ui.ja.md)

在 Svelte 5 组件里导入表单、表格和其他界面组件，通过属性和事件连接页面数据。主题、样式、语言状态和自动导入器有专用导入路径，按下文各节选用。

[模块 README](../../../packages/ui/README.md) · [配置清单](../configuration/ui.md) · [数据结构](../data/ui.md) · [UI 接入](../development/ui.md)

<a id="quick-start"></a>

## 最小接入示例

把以下代码放进 Svelte 5 页面的 `+page.svelte`。

```svelte
<script lang='ts'>
  import { Button, Card, Input } from '@h-ai/ui'

  let name = $state('')
  let submittedName = $state('')
</script>

<Card title='预览问候语'>
  <label for='greeting-name'>姓名</label>
  <Input id='greeting-name' bind:value={name} />
  <Button variant='primary' disabled={!name.trim()} onclick={() => { submittedName = name.trim() }}>
    预览
  </Button>
  <p role='status'>
    {#if submittedName}你好，{submittedName}。{/if}
  </p>
</Card>
```

`bind:value` 把输入框的文本写入 `name`。例如输入 `Ada` 后点击“预览”，页面会显示“你好，Ada。”。示例只更新页面状态。

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

<a id="api-reference"></a>

## 功能说明

UI 没有 init/close。组件由 Svelte 管理挂载和销毁；函数与控制器按实际返回类型使用。接口表中的应用变量由所属场景说明，服务端继续负责授权、校验和持久化。

<a id="styles"></a>

### 接入样式与自动导入：`autoImportHaiUi`

样式在应用构建时引入，自动导入器只处理实际模板组件。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `autoImportHaiUi` | 自动导入 | `preprocessed Svelte source and filename through markup` | `PreprocessorGroup; synchronous { code }` | `autoImportHaiUi()` |

#### 场景：在构建时自动导入组件

在项目的 Svelte 配置里注册预处理器；输入是页面模板，输出是在模板实际使用 Button 等组件时补入对应 import。随后组件可直接用于模板，未使用的组件不会因自动导入而加载。

```js
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import { autoImportHaiUi } from '@h-ai/ui/auto-import'

export default {
  preprocess: [autoImportHaiUi(), vitePreprocess()],
}
```

#### 场景：样式依赖

组件基于 TailwindCSS v4 + DaisyUI。应用层 `app.css` 需要以下配置：

```css
/* 必须 */
@import 'tailwindcss';
@import '@h-ai/ui/styles/global.css'; /* 基础重置、滚动条、焦点样式 */
@import '@h-ai/ui/styles/theme.css'; /* Tailwind v4 @theme Token（品牌色/阴影/动效） */
@source "../node_modules/@h-ai/ui/dist/**/*.{svelte,js,ts}";
@source "../../../node_modules/@h-ai/ui/dist/**/*.{svelte,js,ts}";

/* 移动端项目追加（可选） */
@import '@h-ai/ui/styles/design-tokens.css'; /* CSS 自定义属性 */
@import '@h-ai/ui/styles/mobile.css'; /* 安全区域/触摸优化 */

/* DaisyUI 主题 */
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
```

- `global.css`：基础 HTML 重置、滚动条美化、表单焦点环
- `theme.css`：Tailwind v4 `@theme` 块，包含品牌色、阴影层级、动效曲线、字体特性
- `design-tokens.css`：CSS 自定义属性（间距/圆角/z-index/过渡），移动端推荐
- `mobile.css`：安全区域 padding、momentum 滚动、虚拟键盘适配、移动端 App 壳布局工具（`hai-mobile-viewport` / `hai-mobile-shell` / `hai-mobile-main`）

移动端页面推荐让 `BottomNav` 与页面壳宽度一致，避免桌面预览时底栏横跨整个视口：

```svelte
<div class='hai-mobile-viewport'>
  <div class='hai-mobile-shell max-w-lg'>
    <AppBar title='Home' fixed={false} safeArea />
    <main class='hai-mobile-main'>...</main>
    <BottomNav items={items} active='home' centered maxWidth='lg' safeArea />
  </div>
</div>
```

`BottomNav` 的导航按钮与 `ThemeSelector` 的主题按钮在客户端挂载后启用，确保点击时事件已绑定。

#### 场景：图标

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

<a id="detailed-workflow"></a>

<a id="forms"></a>

### 输入与提交表单：基础组件

把输入值保存在页面状态中，控件通过绑定更新它；表单提交交给应用回调。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `Button` | 按钮 | `variant`, `size`, `loading`, `disabled`, `outline`, `circle` | click → count 加1 | `<Button onclick={() => count += 1}>Add</Button>` |
| `IconButton` | 图标按钮 | `icon: trusted SVG string \| Snippet`, `variant`, `size`, `tooltip`, `loading` | 显示图标按钮与提示 | `<IconButton icon='<svg viewBox="0 0 24 24"></svg>' tooltip='Save' />` |
| `BareButton` | 无样式按钮 | `class`, `ariaLabel`, `role`, `tabindex` | 原生按钮及可访问名称 | `<BareButton ariaLabel='Save'>Save</BareButton>` |
| `Input` | 输入框 | `type`, `value`, `size`, `error`, `validationMessage` | 输入后更新 name | `<Input bind:value={name} />` |
| `BareInput` | 无样式输入框 | `type`, `class`, `accept`, `multiple` | 输入后更新 name | `<BareInput type='text' bind:value={name} />` |
| `Textarea` | 文本域 | `value`, `rows`, `size`, `autoResize`, `error` | 多行输入更新 notes | `<Textarea bind:value={notes} rows={3} />` |
| `Select` | 下拉选择 | `options`, `value`, `placeholder`, `size`, `clearable`, `filterable` | 选择后更新 status | `<Select options={[{ value: 'open', label: 'Open' }]} bind:value={status} />` |
| `Checkbox` | 复选框 | `checked`, `label`, `size`, `indeterminate` | 勾选后更新 enabled | `<Checkbox bind:checked={enabled} label='Enabled' />` |
| `Switch` | 开关 | `checked`, `label`, `size` | 切换后更新 enabled | `<Switch bind:checked={enabled} label='Enabled' />` |
| `Radio` | 单选组 | `options`, `value`, `direction`, `size` | 选择后更新 status | `<Radio options={[{ value: 'open', label: 'Open' }]} bind:value={status} />` |
| `ToggleCheckbox` | 原生开关输入 | `checked`, `name`, `onchange` | 原生选中状态写回 enabled | `<ToggleCheckbox bind:checked={enabled} name='enabled' />` |
| `ToggleInput` | 原生切换输入 | `checked`, `name` | 选中状态写回 enabled | `<ToggleInput bind:checked={enabled} name='enabled' />` |
| `ToggleRadio` | 原生单选输入 | `checked`, `name`, `onchange` | 显示已选单选项 | `<ToggleRadio name='choice' checked />` |
| `Range` | 滑块 | `value`, `min`, `max`, `step` | 拖动更新 score | `<Range min={0} max={100} bind:value={score} />` |
| `Rating` | 评分 | `value`, `max` | 点击评分更新 score | `<Rating max={5} bind:value={score} />` |
| `Badge` | 徽章 | `variant`, `size`, `outline` | 显示 New 徽章 | `<Badge variant='info'>New</Badge>` |
| `Avatar` | 头像 | `src`, `name`, `size`, `shape`, `ring` | 显示姓名头像占位 | `<Avatar name='Ada' />` |
| `Tag` | 标签 | `text`, `variant`, `size`, `closable` | 显示标签 | `<Tag text='Release' />` |
| `Spinner` | 加载动画 | `size`, `variant` | 显示加载动画 | `<Spinner size='sm' />` |
| `Progress` | 进度条 | `value`, `max`, `variant`, `striped`, `animated` | 显示30%进度 | `<Progress value={3} max={10} />` |
| `Form` | 表单容器 | `columns`, `labelPosition`, `labelWidth`, `loading`, `disabled`, `onsubmit` | 通过校验后调用 save | `<Form onsubmit={save}><Input bind:value={name} /></Form>` |
| `FormField` | 表单字段 | `label`, `for`, `colSpan`, `labelPosition`, `error`, `hint`, `required` | 标签关联输入控件 | `<FormField label='Name' for='name'><Input id='name' bind:value={name} /></FormField>` |
| `FormLayout` | 表单布局 | `columns`, `labelPosition`, `labelWidth` | 宽屏两列、窄屏收拢 | `<FormLayout columns={2}><FormField label='Name'><Input bind:value={name} /></FormField></FormLayout>` |
| `TagInput` | 标签输入 | `tags`, `maxTags`, `allowDuplicates`, `size` | 编辑后更新 tags | `<TagInput bind:tags={tags} maxTags={5} />` |
| `Combobox` | 可搜索下拉选择（单选/多选） | `options`, `value`, `multiple`, `placeholder`, `size` | 搜索并写回选择值 | `<Combobox options={[{ value: 'open', label: 'Open' }]} bind:value={status} />` |
| `Calendar` | 独立日历 | `value: DateValue`, `minValue`, `maxValue` | 选择后写回 DateValue | `<Calendar bind:value={date} />` |
| `DatePicker` | 日期输入+弹出 | `value: DateValue`, `minValue`, `maxValue`, `error`, `size` | 弹出日历并写回日期 | `<DatePicker bind:value={date} />` |

#### 场景：在日历和输入框中选择同一日期

输入 name、notes、status 是页面的 $state 字符串，enabled 为 boolean，score 为 number，tags 为 string[]。先从最小示例的 Input/按钮绑定开始，再把它们放入下文 Form。输入 Ada 后 name 为 Ada；提交只在原生校验通过后调用宿主 save。Calendar/DatePicker 的 date 使用 @internationalized/date 的 CalendarDate，而不是字符串。

```svelte
<script lang='ts'>
  import { Calendar, DatePicker } from '@h-ai/ui'
  import { CalendarDate } from '@internationalized/date'
  let date = $state(new CalendarDate(2026, 11, 17))
</script>
<Calendar bind:value={date} />
<DatePicker bind:value={date} />
```

两者共享 date，任意一处选择后另一处显示同一日期。

#### 场景：表单布局与校验

`Form` 和可嵌入原生 `<form>` 的 `FormLayout` 共用 `columns={1 | 2}`、`labelPosition="top" | "left"`、`labelWidth`（默认 `8rem`）。默认单列、标签独立成行；双列在容器不足 `36rem` 时收为单列，同行标签在容器不足 `28rem` 时改为上下排列。

`FormField.colSpan` 默认 `'auto'`：多行文本、文件/图片上传、TagInput 和多选 Combobox 自动占两列；`1` / `2` 显式覆盖。自定义宽控件标注 `data-form-wide`。标题、错误摘要、按钮及其他非 FormField 内容自动独占一行。字段可单独覆盖 `labelPosition` / `labelWidth`。

标签自动关联内部 UI 控件；已有控件 ID 或原生控件使用 `<FormField for="control-id">`。错误/提示通过 `aria-describedby` 关联，错误控件带 `aria-invalid`，只显示一份字段提示。`label` / `error` / `hint` 支持字符串或延迟翻译函数。

`Input`、`Textarea`、`Select` 和 `PasswordInput` 的原生校验使用内置中英日文提示；`validationMessage` 只覆盖失败提示，不让有效输入一直无效。应用通过 UI 的 `setGlobalLocale` / `createLocaleStore` 同步语言，已显示的校验错误即时更新。`Textarea` 支持 `minlength` / `maxlength`，`Select` 支持 `name`、必填校验和 FormData 序列化。

字段错误统一通过 Toast 展示。即使上一条提示已关闭或自动消失，再次提交相同的无效输入仍会重新提示；修正输入后清除过期通知。控件保留错误边框、`aria-invalid` 和读屏关联说明。

文本控件输入后失焦显示前端校验错误，修正输入时即时更新；未输入的空字段留到提交时校验，避免默认焦点离开时挤动操作。CRUD 新增/编辑同样在输入后失焦或提交时校验，支持自定义校验文案，关闭重开清空校验状态。`Select` 在焦点离开触发器和选项后校验。`PasswordInput.minLength` 同时约束长度并用于强度计算；省略时不限制登录密码长度，强度计算仍以 8 位为基准。

`UserProfile.fieldConstraints` 按字段接收 `required`、`minlength`、`maxlength`、`pattern` 和 `validationMessage`（`pattern` 用于单行输入），让应用的用户名等业务规则复用失焦校验；`validationMessage` 支持延迟翻译函数。

`UserProfile.onsubmit` 必须返回 `true` 确认保存成功，返回 `false` 时保留编辑器和草稿；抛错也保留草稿并通过统一 Toast 提示。取消编辑恢复 `user` 中已保存的值。

`CrudEditPanel.onsubmit` 只接收表单声明的可写字段，编辑时排除 `readonly` 字段；新建时仍可填写该字段。主键、关联展示值和审计时间不从整行记录自动回传，空值、`false` 和 `0` 保持原值。服务端继续使用严格 schema 校验。

`LoginForm`、`RegisterForm`、`ChangePasswordForm`、`ForgotPasswordForm`、`ResetPasswordForm`、`AuthPanel`、`UserProfile` 和 `FeedbackModal` 接受同一组布局参数。`CrudPage` 通过 `form` 传入；`CrudEditPanel` 直接接收。CRUD 字段支持 `colSpan`，`validation.message` 支持翻译函数；按钮与回车均先校验，修正后错误消失，客户端校验不能替代服务端校验。

```svelte
<script lang='ts'>
  import { Button, Form, FormField, Input, Textarea } from '@h-ai/ui'
  let name = $state('')
  let notes = $state('')
  let submitted = $state<Record<string, unknown>>({})
  const m = { name: () => '姓名', notes: () => '备注', save: () => '预览提交' }
  const save = (data: Record<string, unknown>) => { submitted = data }
</script>
<Form columns={2} labelPosition='left' labelWidth='6rem' onsubmit={save}>
  <FormField label={() => m.name()} required>
    <Input name='name' bind:value={name} required />
  </FormField>
  <FormField label={() => m.notes()}>
    <Textarea name='notes' bind:value={notes} />
  </FormField>
  <Button type='submit'>{m.save()}</Button>
</Form>
<p role='status'>{JSON.stringify(submitted)}</p>
```
<a id="form-layout-guide"></a>

#### 场景：检查窄屏布局与保存失败

通用组件、主题和语言入口见 [UI 调用参数](ui.md#call-options)。

在页面中把选项直接传给组件。`Form` / `FormLayout` 默认一列、标签在上；`columns={2}` 适合宽容器，`labelPosition="left"` 让短标签对齐，`labelWidth` 按实际内容选择。`FormField.colSpan` 默认 `auto`，宽控件占满一行，自定义宽控件用 `data-form-wide`，也可明确指定 `1` 或 `2`。

```svelte
<script lang='ts'>
  import { FormField, FormLayout, Input } from '@h-ai/ui'
  let name = $state('')
  const m = { userName: () => '姓名' }
</script>
<FormLayout columns={2} labelPosition="left" labelWidth="6rem">
  <FormField label={() => m.userName()} for="name">
    <Input id="name" bind:value={name} required />
  </FormField>
</FormLayout>
```

上例在页面本地声明姓名状态和演示文案；实际应用把文案换成自己的 i18n 函数。输入姓名会更新 name。配置立即改变布局，不需重启后端。

![一列、标签在上](../images/ui-form-one-top.png)

![两列、标签在左](../images/ui-form-two-left.png)

![窄屏自动收拢](../images/ui-form-mobile.png)

检查标签与 `for` / `id` 关联、Tab顺序、提交失败保留输入和防重复提交。校验错误统一Toast，控件保留 `aria-invalid` 和读屏说明；修正后清除旧提示，关闭提示后再次无效提交仍提示。服务端再次校验输入和权限。

保存型场景组件还要明确成功信号。`UserProfile.onsubmit` 接收表单值，返回 `boolean | Promise<boolean>`：只有 `true` 才退出编辑；`false` 或异常保留草稿。输入一个会被服务端拒绝的值时，应看到安全错误提示且仍能继续编辑；不要把“请求结束”当成“保存成功”。

<a id="overlays"></a>

### 打开弹窗与菜单：弹层组件

用 open 状态控制弹窗、抽屉和确认操作；菜单与提示连接到同一页面中的按钮。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `Modal` | 模态框（语义标签、焦点约束与恢复） | `open`, `title`, `size`, `radius`, `bodyOverflow`, `showClose` | 打开/关闭同步 open | `<Modal bind:open={open} title='Details'>Order 42</Modal>` |
| `Drawer` | 抽屉 | `open`, `position`, `title`, `size`, `width`, `resizable`, `widthStorageKey` | 显示抽屉并同步 open | `<Drawer bind:open={open} title='Details'>Order 42</Drawer>` |
| `Confirm` | 确认框 | `open`, `title`, `message`, `variant`, `onconfirm` | 用户确认时调用 confirm | `<Confirm bind:open={open} message='Continue?' onconfirm={confirm} />` |
| `Popover` | 弹出层 | `open`, `position`, `trigger`, `offset`, `portal` | 点击打开面板，Escape 关闭 | `<Popover>{#snippet trigger()}<Button>Open</Button>{/snippet}Details</Popover>` |
| `Dropdown` | 下拉菜单 | `items`, `trigger`, `triggerClass`, `position` | 显示可操作菜单 | `<Dropdown items={menuItems}><Button>Actions</Button></Dropdown>` |
| `Tooltip` | 提示 | `content`, `position`, `delay`, `portal`（裁剪容器内使用） | 悬停/聚焦显示说明 | `<Tooltip content='Save order'><Button>Save</Button></Tooltip>` |

#### 场景：打开订单详情并关闭弹窗

输入 open 是 $state(false)，confirm 是应用确认回调。把按钮与 Modal 放在同一个组件，点击按钮看到 Order 42，关闭后 open 还原 false。

```svelte
<script lang='ts'>
  import { Button, Modal } from '@h-ai/ui'
  let open = $state(false)
</script>
<Button onclick={() => open = true}>Details</Button>
<Modal bind:open title='Details'>Order 42</Modal>
```

#### 场景：弹层


`Popover` 默认挂载到 `body`。在 `click` 模式下按 Enter 或空格打开后，焦点进入面板，按 Escape 关闭并返回触发控件。需要内联挂载时使用 `portal={false}`。

在 Modal/Drawer 内，Popover 的 portal 内容参与所属弹窗的 Tab 与 Shift+Tab 顺序，保持在模态边界内；关闭后撤销登记并恢复触发位置。

<a id="tables"></a>

### 展示记录与导航：数据组件

把已经加载的记录和列定义传给组件；翻页、排序、切换标签时由应用加载所需内容。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `Card` | 卡片容器 | `title`, `bordered`, `shadow`, `padding` | 显示标题和内容 | `<Card title='Order'>Order 42</Card>` |
| `JsonViewer` | JSON 树查看器 | `value`, `defaultExpandedDepth`, `maxScalarLength`, `showCopy`, `onCopy`；循环引用自动替换为占位符 | 展示可展开 JSON | `<JsonViewer value={{ status: 'pending' }} />` |
| `DataTable` | 数据表格 | `data`, `columns`, `keyField`, `loading`, `sortKey`, `sortDir`, `onsort`，`cell` 单元格插槽、`onrowclick`（列 `sortable` 可排序） | 按列显示 rows；业务负责加载 | `<DataTable data={rows} {columns} keyField='id' />` |
| `Accordion` | 手风琴 | `items: AccordionItem[]` | 展开/收起给定内容 | `<Accordion items={accordionItems} />` |
| `Timeline` | 时间线 | `items: TimelineItem[]` | 依输入顺序显示时间线 | `<Timeline items={timelineItems} />` |
| `Tabs` | 标签页 | `items`, `active`, `type`, `size`, `lazy`, `onactivate` | 切换后更新 activeTab | `<Tabs items={tabItems} bind:active={activeTab} />` |
| `Pagination` | 分页（统一 table 风格） | `page`, `total`, `pageSize`, `showTotal`, `showJumper`, `showSizeChanger`, `showPageInfo`, `showFirstLast` | 共3页，翻页更新 page | `<Pagination total={42} pageSize={20} bind:page />` |
| `Breadcrumb` | 面包屑 | `items`, `separator` | 显示层级与链接 | `<Breadcrumb items={[{ label: 'Orders', href: '/orders' }, { label: '42' }]} />` |
| `Steps` | 步骤条 | `items`, `current`, `direction`, `clickable` | 标记当前步骤 | `<Steps items={stepItems} current={1} />` |
| `Skeleton` | 骨架屏 | `variant`, `width`, `height`, `count` | 显示3项占位 | `<Skeleton count={3} />` |
| `Empty` | 空状态 | `title`, `description`, `icon` | 显示空态 | `<Empty title='No orders' />` |
| `Result` | 结果页 | `status`, `title`, `description` | 显示结果状态 | `<Result status='success' title='Saved' />` |
| `PageHeader` | 页面头部 | `title`, `description`，支持 `actions` 插槽 | 显示页标题、说明和操作区 | `<PageHeader title='Orders' description='Current orders' />` |

#### 场景：导航


`Dropdown` 的 `click` 和 `hover` 模式将菜单挂载到 `body`。在 `manual` 模式下，调用方通过 `class` 切换 `dropdown-open` 来控制内联菜单。
#### 场景：data-* 属性透传

公开 Svelte 组件支持把调用方传入的 `data-*` 属性透传到组件根节点或主交互节点，便于测试选择器、埋点和自动化标记。普通未知属性不会被透传。

```svelte
<script lang='ts'>
  import { Button, Input, Modal } from '@h-ai/ui'
  let username = $state('')
  let open = $state(false)
</script>
<Button data-testid='save-button' data-analytics-id='settings.save' onclick={() => { open = true }}>保存</Button>
<Input data-testid='username-input' bind:value={username} />
<Modal data-testid='confirm-modal' bind:open>确认保存 {username}？</Modal>
```

无需再为了 `data-testid` 单独封装按钮、输入框或弹层组件。

<a id="mobile"></a>

### 适配手机操作：移动组件

为手机提供底部导航、上拉操作和刷新手势；网络请求仍由应用回调执行。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `ActionSheet` | 底部操作面板 | `open`, `title`, `items`, `cancelText`, `onselect` | 选择操作后通知 selectAction | `<ActionSheet bind:open={open} items={sheetItems} onselect={selectAction} />` |
| `AppBar` | 顶部导航栏 | `title`, `backHref`, `onback`, `fixed`, `safeArea` | 显示标题和返回入口 | `<AppBar title='Orders' backHref='/orders' />` |
| `BottomNav` | 底部导航栏 | `items`, `active`, `centered`, `maxWidth` | 显示并触发导航 | `<BottomNav items={navItems} active='home' />` |
| `InfiniteScroll` | 无限滚动 | `loading`, `finished`, `threshold`, `onload` | 触底请求 loadMore | `<InfiniteScroll loading={loading} finished={finished} onload={loadMore} />` |
| `PullRefresh` | 下拉刷新 | `refreshing`, `threshold`, `onrefresh` | 下拉请求 refresh | `<PullRefresh refreshing={loading} onrefresh={refresh}>Orders</PullRefresh>` |
| `SafeArea` | 安全区域容器 | `top`, `bottom`, `left`, `right` | 为内容保留安全区域 | `<SafeArea top bottom>Orders</SafeArea>` |
| `SwipeCell` | 滑动操作单元 | `leftActions`, `rightActions`, `threshold`, `onaction` | 滑动展示操作并通知宿主 | `<SwipeCell rightActions={swipeActions} onaction={selectAction}>Order 42</SwipeCell>` |

#### 场景：响应手机导航、刷新与加载操作

navItems、sheetItems、swipeActions 是应用按对应 Props 提供的操作项；loading/finished 是真实请求状态。loadMore、refresh 负责受权查询，selectAction 处理用户已选的操作。滑动和触底只发出事件，不自行请求网络；不要把它们当作有业务副作用的接口。



<a id="workspace"></a>

### 组织工作区与设置：布局组件

用工作区布局安排标题、操作和内容，把查询条件保留在页面状态中。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `SettingsModal` | 设置模态框 | `open`, `onclose` | 显示设置弹窗 | `<SettingsModal bind:open={open} />` |
| `SettingsLayout` | 设置页布局（分区导航 + 内容区） | `title`, `description`, `sections`, `active`, `onselect` | 显示设置导航与内容 | `<SettingsLayout title='Settings' sections={sections} active='profile'>Profile</SettingsLayout>` |
| `WorkspaceLayout` | 工作区布局 | `title`, `leading/actions/footer` snippets | 内容占满剩余高度 | `<WorkspaceLayout title='Orders'>Orders</WorkspaceLayout>` |
| `FilterBar` | 可收起筛选 | `activeCount`, `onreset`, `expanded` | 展开/收起保留值 | `<FilterBar activeCount={0}>Filters</FilterBar>` |
| `TableToolbar` | 表格查询栏 | `searchValue`, `onsearch`, `onclearfilters` | 提交查询时通知宿主 | `<TableToolbar bind:searchValue={search} onsearch={query} />` |

#### 场景：紧凑工作区与可收起筛选

`WorkspaceLayout` 统一导航、内容区和可选页脚：顶栏采用紧凑高度，主内容使用 12/16px 内边距；没有页脚时不预留高度。通过 `title` 提供导航中的页面标题，`leading/actions/footer` 为 snippet，`data-*` 透传内容 main。父布局需传递剩余高度及 min-height: 0。

同名 `PageHeader` 自动省略重复标题，保留说明和操作；`SettingsLayout` 复用该行为。工作区中的 `CrudPage` 默认不重复显示页面标题，操作并入工具栏；独立使用仍显示标题，可用 `showHeader` 显式覆盖。

`FilterBar` 的 leading 和 actions 保持可见，children 默认收起，`bind:expanded` 控制展开，`activeCount` 提示已启用条件，`onreset` 提供内置三语重置按钮。收起保留控件和值；应用传入的回调可以清空筛选条件并重新发起查询。`TableToolbar` 复用该布局并提供原生查询表单，`CrudFilterBar` 复用相同实现；`onsearch` 在提交时读取当前绑定的搜索和筛选草稿，`onfilterchange` 只通知草稿变化。`onreset`（TableToolbar 使用 `onclearfilters`）必须同步清空宿主已提交条件并重新查询。列表排序使用 DataTable 的 `sortKey`、`sortDir`、`onsort`。 扩展筛选按容器宽度自适应为 1/2/4/6 列，字段横向间距 20px、纵向间距 16px，标签和控件分别对齐；日期范围占两列，窄屏占整行。

下例的 m、statusOptions、clearFilters 和 loadRows 由业务应用提供；清空回调须重置搜索及全部条件。

```svelte
<script lang='ts'>
  import { Button, FilterBar, Input, Select, WorkspaceLayout } from '@h-ai/ui'

  let search = $state('')
  let status = $state('')
</script>

<div class='flex h-dvh min-h-0'>
  <WorkspaceLayout title={m.page_title()}>
    <FilterBar activeCount={status ? 1 : 0} onreset={clearFilters}>
      {#snippet leading()}<Input size='sm' bind:value={search} placeholder={m.search()} />{/snippet}
      {#snippet actions()}<Button size='sm' onclick={loadRows}>{m.search()}</Button>{/snippet}
      <div class='w-40'><Select size='sm' bind:value={status} options={statusOptions} /></div>
    </FilterBar>
  </WorkspaceLayout>
</div>
```

<a id="notifications"></a>

### 报告操作结果：`toast`、`messageBox`

把成功、失败和确认交给共享通知容器；可按返回 ID 移除单条提示。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `useToastFeedback` | 操作结果提示 | `() => safely localized message, variant?` | `void; source-owned toast lifecycle` | `useToastFeedback(() => errorMessage(error))` |
| `notifySuccess` | 操作结果提示 | `localized message, duration?` | `toast ID string` | `notifySuccess(m.saved())` |
| `notifyInfo` | 操作结果提示 | `localized message, duration?` | `toast ID string` | `notifyInfo(m.loading())` |
| `notifyWarning` | 操作结果提示 | `localized message, duration?` | `toast ID string` | `notifyWarning(m.warning())` |
| `notifyError` | 操作结果提示 | `unknown error, safe fallback?, duration?` | `toast ID string; internal exception text hidden` | `notifyError(error, m.retry())` |
| `errorMessage` | 操作结果提示 | `unknown error, safe fallback?` | `safe localized string` | `errorMessage(error, m.retry())` |
| `toast.add` | 共享提示队列 | `localized options/message` | `string item ID` | `toast.add({ message: m.saved(), variant: "success" })` |
| `toast.success` | 共享提示队列 | `localized safe message, duration?` | `string item ID` | `toast.success(m.result())` |
| `toast.info` | 共享提示队列 | `localized safe message, duration?` | `string item ID` | `toast.info(m.result())` |
| `toast.warning` | 共享提示队列 | `localized safe message, duration?` | `string item ID` | `toast.warning(m.result())` |
| `toast.error` | 共享提示队列 | `localized safe message, duration?` | `string item ID` | `toast.error(m.result())` |
| `toast.remove` | 共享提示队列 | `item ID` | `void` | `toast.remove(id)` |
| `toast.clear` | 共享提示队列 | `none` | `void` | `toast.clear()` |
| `message.add` | 共享提示队列 | `localized options/message` | `string item ID` | `message.add({ message: m.saved(), type: "success" })` |
| `message.success` | 共享提示队列 | `localized safe message, duration?` | `string item ID` | `message.success(m.result())` |
| `message.info` | 共享提示队列 | `localized safe message, duration?` | `string item ID` | `message.info(m.result())` |
| `message.warning` | 共享提示队列 | `localized safe message, duration?` | `string item ID` | `message.warning(m.result())` |
| `message.error` | 共享提示队列 | `localized safe message, duration?` | `string item ID` | `message.error(m.result())` |
| `message.remove` | 共享提示队列 | `item ID` | `void` | `message.remove(id)` |
| `message.clear` | 共享提示队列 | `none` | `void` | `message.clear()` |
| `toast.pause` | 提示计时 | `toast ID` | `void` | `toast.pause(id)` |
| `toast.resume` | 提示计时 | `toast ID` | `void` | `toast.resume(id)` |
| `messageBox.confirm` | 异步确认弹窗 | `localized string or MessageBoxOptions` | `Promise<boolean>; host handles confirmation/cancellation` | `messageBox.confirm({ message: m.confirm() })` |
| `messageBox.alert` | 异步确认弹窗 | `localized string or MessageBoxOptions` | `Promise<boolean>; host handles confirmation/cancellation` | `messageBox.alert({ message: m.confirm() })` |
| `Alert` | 警告框 | `variant`, `title`, `dismissible` | 显示持续信息 | `<Alert variant='info' title='Saved' />` |
| `ToastContainer` | 通知容器 | Mount once with `toast` | 显示全局通知队列 | `<ToastContainer />` |
| `ErrorPage` | 通用错误页（内置 401/403/404/500/503 预设） | `status`, `code`, `title`, `description`, `homeUrl`, `onhome`, `onback` | 显示503预设与返回入口 | `<ErrorPage status={503} homeUrl='/' />` |

#### 场景：Toast 通知

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

默认在右下角浮动显示，不占页面布局；由 UI 模块统一使用提示蓝、成功绿、警告黄、错误红等主题语义色，以浅色底、细色边和对应图标区分，并保留轻阴影，支持手工关闭。多个提示进入同一 FIFO 队列，逐条展示，每条从展示时开始计时（默认 3 秒，`duration: 0` 等待手工关闭）。根布局只挂载一次 `<ToastContainer />`。用 `toast.add({ message: m.saved(), variant: 'success', position: 'bottom-center' })` 指定方位；`m.saved()` 是应用自身的翻译函数。可选 `bottom-right`（默认）、`top-right`、`bottom-center`、`top-center`、`bottom-left`、`top-left`。登录、改密、保存、删除、上传等操作成功或失败均使用 Toast；所有警告和错误（包括字段校验）统一由 ToastContainer 展示。字段保留错误标记与读屏关联，持续业务状态和恢复操作留在原位；`Alert` 只支持 info/success。

按 F8 聚焦当前提示，再按 F8 返回原控件；提示获得焦点后，Escape 关闭可关闭的提示并恢复焦点，Enter 激活关闭按钮。Modal 内同样可用，关闭提示不会关闭弹窗。不可关闭的提示仍可聚焦阅读并返回；自动消失也会恢复焦点。

> 已内置 `notifySuccess` / `notifyError` / `notifyInfo` / `notifyWarning`，无需应用自建工具：`notifyError(err, fallback?)` 隐藏普通 `Error` 的内部原文，显示兜底文案并保留 traceId；字符串参数必须是已本地化的安全文案，不能传入未知 `err.message`。默认成功 3s / 失败 5s。

需要把 HaiResult 失败交给使用 Promise 的组件时，使用 `throw new Error(result.error.message, { cause: result.error })` 保留完整错误。`errorMessage` / `notifyError` 会从 Error.cause 链读取安全的业务原因和 traceId；5xx 和未知异常仍使用安全兜底。异常链有深度限制并防止循环，不能直接显示底层异常文本。

响应式组件可在初始化时调用 `useToastFeedback(() => error)`，传入已完成安全映射和本地化的操作消息；队列中相同类型、相同消息合并，通知独立于来源组件生命周期。来源消息更新或清空时替换或移除该来源的旧通知；重复比较同时包含 traceId。`message` 入口也共用此队列、样式和关闭行为；`MessageContainer` 复用 `ToastContainer`，根布局只选择一个容器。

状态层可从轻量入口 `@h-ai/ui/toast` 导入 `toast`、`useToastFeedback`、`notifySuccess` / `notifyError` / `notifyInfo` / `notifyWarning` 和 `errorMessage`，不会连带加载组件及引导 CSS；`ToastContainer` 仍从组件入口导入并在根布局挂载。

默认不显示 traceId。可以传 `toast.add({ message: m.retry(), variant: 'warning', traceId })`；已有安全文案中的 `(traceId: …)` 也会自动分离。小图标展开“问题追踪编号”、复制按钮及联系客户支持或开发人员时提供编号的说明。复制失败时可手动选择编号。悬停、聚焦或展开时暂停计时，结束后继续剩余时间；也可调用 `toast.pause(id)` / `toast.resume(id)`。warning/error 使用 Toast；字段的可见错误文案也由 Toast 统一展示，保留 aria-invalid、读屏描述和原位恢复操作。

#### 场景：指定提示方位

应用先取得翻译文案，再调用 `showSaved(m.saved())`。成功提示显示在右上角，普通提示显示在底部中央。两者共用一个队列，按顺序展示。

```ts
import { toast } from '@h-ai/ui/toast'

export function showSaved(message: string) {
  return toast.add({ message, variant: 'success', position: 'top-right' })
}

export function showNotice(message: string) {
  return toast.add({ message, position: 'bottom-center' })
}
```

#### 场景：全局消息框与错误页预设

在全局布局挂载一次 `MessageBoxContainer` 即可显示队列中的 `MessageBoxDialog`。从业务事件处理函数调用 `messageBox.confirm`，等待用户选择。

```svelte
<script lang='ts'>
  import { Button, messageBox, MessageBoxContainer } from '@h-ai/ui'

  let accepted = $state<boolean | undefined>(undefined) // 保存尚未选择、确认或取消状态。

  async function ask() {
    accepted = await messageBox.confirm({ message: '保存这份资料？' }) // 输入文案，得到确认 true 或取消 false。
  }
</script>

<MessageBoxContainer /> <!-- 挂载队列视图，每个条目渲染一个 MessageBoxDialog。 -->
<Button onclick={ask}>保存</Button> <!-- 用户点击后触发确认流程。 -->
{#if accepted !== undefined}
  <p>{accepted ? '已确认' : '已取消'}</p> <!-- 按交互结果展示状态。 -->
{/if}
```

自定义队列渲染器时，将队列项 `item` 分别传给 `await messageBox.handleConfirm(item)`、`await messageBox.handleCancel(item)` 或 `await messageBox.handleClose(item)`。三者返回 `Promise<void>`，在允许关闭时解决原来的交互 Promise。使用默认容器时由组件自动调用。

```ts
import { resolveErrorPreset } from '@h-ai/ui'

const preset = resolveErrorPreset(503) // 输入 HTTP 状态，返回对应预设的 code、文案键和图标。
const fallback = resolveErrorPreset(undefined) // 输入缺省状态，返回通用错误预设。
```

<a id="toast-options"></a>

#### 场景：Toast位置、时长和排查信息

根布局只挂载一个 `ToastContainer`。所有警告/错误均由它显示，`Alert` 仅支持 `info` / `success` 持续信息；恢复按钮留在原页面，用户能继续处理。

| 参数 | 默认 | 对用户的影响 |
| --- | --- | --- |
| `position` | `bottom-right` | `top` / `bottom` 各搭配 `left` / `center` / `right`，共 6 个位置，所有位置共用FIFO队列 |
| `duration` | `toast.add`默认3000ms | 0手动关闭；`notifyError`/`notifyWarning`默认5000ms，成功默认3000ms |
| `dismissible` | `true` | `false` 隐藏关闭按钮，永久不可关闭消息可能阻塞队列，应谨慎 |
| `traceId` | 无默认 | 有合法编号才显示排查图标；默认正文只显示可读信息 |

```ts
import { toast } from '@h-ai/ui/toast'

toast.add({
  message: '请刷新后重试', // 实际应用使用自己的翻译函数。
  variant: 'warning',
  duration: 5000,
  traceId: 'example-request-id',
})
```

![默认正文不显示编号](../images/feedback-conflict.png)

![展开后说明用途并提供复制](../images/feedback-conflict-diagnostics.png)

编号用于联系客户支持/开发定位日志，不显示堆栈、SQL或密钥。悬停、聚焦、展开时暂停计时，交互结束按剩余时间恢复；复制拒绝时可手动选择。F8进入/返回提示，Escape关闭并恢复焦点。

<a id="auth"></a>

### 接入登录与权限交互：认证组件

表单收集凭据并调用应用提供的认证动作；公开策略决定显示哪些入口，服务端决定能否通过。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `matchPermission` | 前端权限显示 | `required permission, userPermissions[]` | `boolean; not server authorization` | `matchPermission("orders:read", ["orders:*"])` |
| `setPermissionContext` | 提供组件权限上下文 | `() => current permissions; component initialization only` | `void` | `setPermissionContext(() => user.permissions)` |
| `usePermission` | 消费组件权限 | `none; component initialization only` | `PermissionContext with hasPerm/hasAnyPerm/hasAllPerms` | `usePermission()` |
| `createSensitiveActions` | 敏感操作确认 | `standard auth actions providing reauthenticate/publicConfig?` | `SensitiveActions: configure/authorize/submit/cancel` | `createSensitiveActions(actions)` |
| `createSessionRecovery` | 原地恢复会话 | `none; configure public config and current user afterward` | `SessionRecovery controller` | `createSessionRecovery()` |
| `AuthPanel` | 配置驱动认证页 | `config`, `actions`, `loginHeader/loginFields/loginFooter`, `registerHeader/registerFields/registerFooter` | 显示策略允许的认证方式并调用 actions | `<AuthPanel {config} {actions} />` |
| `AuthShell` | 认证页布局（居中卡片 / 左右分栏） | `variant`, `title`, `subtitle`, `brandTitle`, `brandText`, `illustration`, `description`, `highlights` | 显示认证布局 | `<AuthShell title='Sign in'>Account form</AuthShell>` |
| `LoginForm` | 登录表单 | `loading`, `errors`, `showForgotPassword`, `onsubmit` | 提交登录字段给 login | `<LoginForm onsubmit={login} />` |
| `RegisterForm` | 注册表单 | `loading`, `errors`, `fields`, `onsubmit` | 提交注册字段给 register | `<RegisterForm onsubmit={register} />` |
| `ForgotPasswordForm` | 忘记密码 | `mode`, `loading`, `errors`, `onsubmit` | 提交找回请求 | `<ForgotPasswordForm onsubmit={sendReset} />` |
| `ResetPasswordForm` | 重置密码 | `loading`, `errors`, `showCode`, `onsubmit` | 提交重置凭据 | `<ResetPasswordForm onsubmit={resetPassword} />` |
| `ChangePasswordForm` | 修改密码 | `loading`, `errors`, `requireOldPassword`, `onsubmit` | 提交改密字段 | `<ChangePasswordForm onsubmit={changePassword} />` |
| `PasswordInput` | 密码输入框 | `value`, `showToggle`, `showStrength`, `minLength` | 更新 password 并显示强度 | `<PasswordInput bind:value={password} showStrength />` |
| `ReauthenticationDialog` | 敏感操作再认证 | `open`, `loading`, `error`, `onsubmit`, `onclose` | 报告再认证提交/取消 | `<ReauthenticationDialog open={confirmation.open} onsubmit={confirmation.submit} onclose={confirmation.cancel} />` |
| `PermGuard` | 权限守卫 | `permissions`, `mode`, `fallback` | 按前端权限决定显示；服务端仍须授权 | `<PermGuard permissions='orders:read'>Orders</PermGuard>` |
| `UserProfile` | 用户资料 | `user`, `editable`, `fields`, `avatarAccept`, `avatarHint`, `onsubmit` | 仅保存返回 true 才退出编辑 | `<UserProfile {user} editable onsubmit={saveProfile} />` |
| `SessionRecoveryDialog` | 原地会话恢复 | `recovery`, `actions` | 恢复原用户会话或取消 | `<SessionRecoveryDialog {recovery} {actions} />` |
| `SensitiveOperationsForm` | 权限敏感操作编辑 | `operations`, `onsubmit`, `ondone` | 提交敏感操作规则 | `<SensitiveOperationsForm {operations} onsubmit={saveOperations} />` |

#### 场景：把公开策略和认证动作接入页面

下文给出实际输入及页面变化。表格中的数据和回调由应用按公开 Props 提供；组件不会隐式加载业务数据。

<a id="配置驱动认证页面"></a>

#### 场景：配置驱动认证页面

状态层通过轻量入口 `@h-ai/ui/i18n` 导入 `authErrorMessage`，复用相同映射且无需加载场景组件。管理台个人改密、移动/桌面示例与生成模板均沿用此提示规则。

密码登录只提交 `identifier` 和 `password`；`AuthPanel` 将 `LoginForm` 的 `username` 映射为 `identifier`。会话有效期由服务端 `session.maxAge` / `session.refreshTokenMaxAge` 配置决定，登录表单不提供按次登录的持久会话选项。

协议支持 `agreements.userAgreementMarkdown` 与 `privacyPolicyMarkdown` 直接从配置加载；YAML 的 `|` 保留 Markdown 段落和换行。弹窗复用安全 MarkdownRenderer，关闭原始 HTML、脚本和代码复制工具。同主题同时提供正文与 URL 时优先正文，URL 可作为额外查看入口；只有 URL 时使用隔离 iframe。

```yaml
agreements:
  showOnRegister: true
  showOnLogin: false
  userAgreementMarkdown: |
    # 用户协议

    **账户使用条款**

    - 请妥善保管账户凭据。
  privacyPolicyMarkdown: |
    # 隐私政策

    注册资料用于账户管理，会话信息用于身份认证。
  # 可选 URL；同主题同时配置 Markdown 和 URL 时，弹窗优先显示 Markdown。
  # userAgreementUrl: https://example.com/terms
  # privacyPolicyUrl: https://example.com/privacy
```

AuthPanel 直接接收 IAM 白名单配置和 actions，内置登录（密码/LDAP/邮件/短信）、注册、找回、重置及协议展示。使用 `config.ui` 配置卡片/分栏、标题、品牌、Logo 和配图。`LoginForm` 提供 methods、onsendotp、otpLength、resendInterval；密码表单接受 passwordPolicy。组件只渲染与交互，网络和 Token 存储通过 actions 注入。

认证错误统一使用 `authErrorMessage(error)`（从 `@h-ai/ui/components/scenes/iam/index` 导入）：按公开错误码显示当前 UI 语言，凭据错误统一为“用户名或密码不正确”，未知错误及服务异常不显示原文，保留有效 `traceId`。AuthPanel、验证码发送、敏感操作确认与 fullstack 改密共用此映射。首次改密、密码过期、当前密码复用（`hai:iam:034`）和会话上限各有操作指引；操作成功和错误均使用统一 Toast。确认密码与服务端一样逐字符比较，不归一化 Unicode 或裁剪空白，输入不一致时由 Toast 提示，并保留字段关联。Kit 和 API Client 确认的时间窗口错误会在认证提示中显示服务器 UTC 时间及校时建议。

AuthPanel 在 SSR 阶段禁用原生表单控件，客户端挂载并绑定事件后自动开放输入，避免接管时丢失早到的输入。应用无需额外的就绪适配；E2E 等待控件可编辑，并覆盖客户端脚本延迟加载的场景。

认证链接指向当前完整 URL 时，AuthPanel 只切换场景并阻止重复导航，返回登录后可立即输入。路径、查询串或 hash 不同时交给应用路由处理；Ctrl/Cmd 等修改键点击保留浏览器行为。

`createSensitiveActions` 可利用标准 actions 的 `publicConfig()` 在操作前更新数据库规则。`SensitiveOperationsForm` 复用逐行输入、去重、校验与错误状态；传入 `operations`、异步 `onsubmit(operations)`（返回 HaiResult），`ondone` 只在保存成功后调用。数据库规则与文件规则取并集，表单清空不能取消文件规则。

会话过期后的重新登录使用 `createSessionRecovery()` + `SessionRecoveryDialog`。根布局通过 `configure(publicConfig, { id, username })` 绑定原用户，把 `recovery.recover` 传给 Kit/API client 的 `recoverSession`；弹窗传入同一份 controller 和标准 actions，布局卸载时 `cancel()`。UI 不保存密码或业务请求，不切换页面。登录携带 `expectedUserId`，服务端在发会话前限制原主体；验证码、锁定、登录限制和改密流程仍按正常登录执行。取消保留当前输入并结束本次续接；真实网络失败不重放写入。整页刷新/关闭后的内存输入无法恢复。

`createSensitiveActions(actions)` 复用 Kit/API client 的认证动作，统一管理已登录用户的二次确认、取消、错误重试、重复提交与迟到响应。每个应用根布局创建一份，用 `configure(公开策略)` 更新清单；布局卸载时 `cancel()`。`authorize(operation)` 返回 undefined 表示不需确认、null 表示取消/忙、字符串为本次操作凭据；取消时不要发业务请求。有凭据时只传给本次请求，不放全局 header 或持久存储。`ReauthenticationDialog` 绑定控制器的 `open/loading/error/submit/cancel`，不会增加权限。`Input` 支持 `datetime-local`，其值为浏览器本地时间，服务层转换为明确时间戳后提交。

```svelte
<!-- actions 为 Kit/API client 的标准认证动作；policy 为 IAM 公开再认证策略。 -->
<script lang='ts'>
  import type { SensitiveActionsOptions } from '@h-ai/ui'
  import { createSensitiveActions, ReauthenticationDialog } from '@h-ai/ui'

  const { actions, policy }: { actions: SensitiveActionsOptions, policy: { enabled: boolean, operations: string[] } } = $props()
  const confirmation = createSensitiveActions(actions)
  $effect(() => {
    confirmation.configure(policy)
    return () => confirmation.cancel()
  })
// 业务动作 await confirmation.authorize(operation)；null 时中止该动作。
</script>
<ReauthenticationDialog
  open={confirmation.open}
  loading={confirmation.loading}
  error={confirmation.error}
  onsubmit={password => confirmation.submit(password)}
  onclose={() => confirmation.cancel()}
/>
```

[IAM 配置清单](../configuration/iam.md)

#### 场景：PasswordInput 受控模式

```svelte
<script>
  import { PasswordInput } from '@h-ai/ui'

  let password = $state('')
</script>

<PasswordInput
  value={password}
  oninput={(e) => { password = e.currentTarget.value }}
  placeholder='请输入密码'
  showStrength
/>
```

#### 场景：可选交互挑战

AuthPanel 在 config.captcha.enabled 时通过 actions.createCaptcha 自动生成并异步求解自托管 ALTCHA，按 login/register/sendOtp/passwordReset/renewPassword 用途提交单用证明；关闭时不加载求解器。createAuthActions 已提供动作，自定义动作须保留 captcha，缺少动作时不放行。证明仅存在当前请求内存，服务端始终校验与消费。

何时要求验证、验证失败后如何处理，见 [IAM 配置](../configuration/iam.md)和 [IAM 功能说明](./iam.md)。


协议在 Modal 内显示并保留表单输入；使用 URL 时，协议页面须允许 iframe 嵌入，组件禁用其脚本，另提供新窗口查看入口。登录/注册表单使用 `header/extraFields/footer` snippet，AuthPanel 透传 `loginHeader/loginFields/loginFooter` 和 `registerHeader/registerFields/registerFooter`，底部保留内置导航。自定义字段由应用绑定状态和提交，不会隐式写入 IAM 用户模型。

```svelte
<script lang='ts'>
  import type { ComponentProps } from 'svelte'
  import { AuthPanel } from '@h-ai/ui'
  const { config, actions, loginHelp, subscribeLabel }: Pick<ComponentProps<typeof AuthPanel>, 'config' | 'actions'> & {
    loginHelp: string
    subscribeLabel: string
  } = $props()
  let subscribe = $state(false)
</script>
<AuthPanel {config} {actions}>
  {#snippet loginHeader()}
    <p>{loginHelp}</p>
  {/snippet}
  {#snippet registerFields()}
    <label><input type='checkbox' bind:checked={subscribe} />{subscribeLabel}</label>
  {/snippet}
</AuthPanel>
```

上例的 subscribe 为应用自身的 $state，应用包装 register 动作校验/提交扩展业务数据；如需单独组合表单，使用 `<RegisterForm> {#snippet extraFields()}...{/snippet} </RegisterForm>`。扩展里的按钮须为 `type="button"`，避免误提交。

<a id="uploads"></a>

### 选择和上传文件：存储组件

选择文件后调用 uploadHandler，图片组件在成功后更新 URL；文件保存位置由应用决定。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `FileUpload` | 文件上传 | `accept`, `maxSize`, `maxFiles`, `multiple`, `uploadHandler` | 选中文件后调用 upload | `<FileUpload accept='.txt' uploadHandler={upload} />` |
| `ImageUpload` | 图片上传 | `value`, `accept`, `maxSize`, `aspectRatio`, `uploadHandler` | 成功后写回图片 URL | `<ImageUpload bind:value={imageUrl} uploadHandler={uploadImage} />` |
| `AvatarUpload` | 头像上传 | `value`, `size`, `maxSize`, `fallback`, `uploadHandler` | 成功后写回头像 URL | `<AvatarUpload bind:value={imageUrl} uploadHandler={uploadImage} />` |
| `FileList` | 文件列表 | `files`, `layout`, `showDelete`, `showDownload` | 显示宿主传入的文件 | `<FileList files={files} />` |

#### 场景：选择文件并交给上传服务

表格的 files 来自已授权文件列表，upload/uploadImage 是应用上传服务。上传回调输入浏览器 File 及取消/进度选项，输出 { url?, response? }；图片/头像要返回可显示 URL。失败应拒绝 Promise，组件保留可重试的选择。具体上传往返见 [Storage 浏览器示例](storage.md#browser-files)。

#### 场景：Storage 存储


上传组件不内置 presign、请求头或 PUT/POST 协议。应用层通过 `uploadHandler(file, { signal, onProgress })` 调用自己的 service，并返回 `{ url?, response? }`；图片和头像上传需要返回可展示的 `url`。未提供 handler 时，`FileUpload` 只选择文件，图片/头像组件只生成本地预览。
#### 场景：输入约束与 HTTP 能力

对象键、上传能力、批量删除及预签名地址的共同规则见[存储 API 能力](./storage.md#存储输入约束与跨端能力)。

<a id="crypto"></a>

### 显示加密结果：加密组件

显示真实计算结果；组件本身不持有密钥，也不完成签名验证。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `EncryptedInput` | 加密输入 | `value`, `encryptedValue`, `algorithm`, `showEncrypted` | 成功后写回当前输入的真实密文 | `<EncryptedInput bind:value={plain} bind:encryptedValue={cipher} onencrypt={encrypt} />` |
| `HashDisplay` | 哈希展示 | `value`, `algorithm`, `copyable`, `truncate` | 展示摘要；不计算摘要 | `<HashDisplay value={digest} algorithm='SM3' />` |
| `SignatureDisplay` | 签名展示 | `signature`, `publicKey`, `algorithm`, `verified` | 展示给定签名及验证状态 | `<SignatureDisplay {signature} {publicKey} verified />` |

#### 场景：显示实际的密文、摘要和验签结果

plain/cipher 是页面 $state 字符串；digest、signature、publicKey 为服务端或 Crypto 的成功结果。encrypt 是应用提供的真实加密回调，输入明文、输出密文；算法标签不会自动完成加密。具体生成方法见 [Crypto 加密与签名](crypto.md#asymmetric)。

#### 场景：Crypto 加密展示

输入变化立即清空 `encryptedValue`，只有当前输入的成功结果会回填；清空、回调替换和卸载均使旧请求失效。失败显示内置错误提示且密文保持为空；表单应仅在当前密文非空时提交需要加密的输入。

`EncryptedInput` 必须由调用方通过 `onencrypt` 接入真实加密服务，`algorithm` 仅用于说明该服务所用算法。未配置回调时组件明确提示不可用，不生成密文；没有 Base64 等编码回退。


默认算法与 `@h-ai/crypto` 对齐：加密输入使用 `SM4`，哈希展示使用 `SM3`，签名展示使用 `SM2`。

<a id="documents"></a>

### 阅读、编辑与下载文档：AI 内容组件

把文本、Markdown、表格或文档数据传入查看器，按需要接入编辑、下载和引用操作。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `parseMarkdown` | 安全 Markdown | `Markdown source, MarkdownParseOptions?` | `HTML string; raw HTML escaped or allowlisted` | `parseMarkdown("# Hello", { allowHtmlTags: false })` |
| `renderMarkdownDocument` | 编辑器文档模型 | `Markdown source, MarkdownDocumentParseOptions?` | `MarkdownRenderResult with outline/codeBlocks/blocks` | `renderMarkdownDocument("# Report", { allowHtmlTags: false })` |
| `isLanguageSupported` | 检查高亮语言 | `language name` | `boolean` | `isLanguageSupported("typescript")` |
| `highlightCode` | 同步代码高亮 | `code text, supported language` | `escaped/highlighted HTML string` | `highlightCode("const total = 1", "typescript")` |
| `resolveDocumentMarkdownContent` | 代码内容加围栏 | `text, sourceKind?, language?` | `Markdown string with a safe fence length` | `resolveDocumentMarkdownContent("const x = 1", "code", "ts")` |
| `resolveDocumentDownloadActions` | 下载动作菜单 | `MarkdownToolbarDownloadAction[]?` | `AiDocumentResolvedDownloadAction[]` | `resolveDocumentDownloadActions([{ id: "markdown", label: "Markdown" }])` |
| `downloadAiDocument` | 下载已选格式 | `AiDocumentDownloadRequest` | `Promise<void>; browser failure rejects, SSR does nothing` | `downloadAiDocument({ actionId: "markdown", content: "# Report", filename: "report.md" })` |
| `MarkdownRenderer` | Markdown 渲染器 | `content`, `fontSize`, `allowHtmlTags`, `showCopyButton`, `enableHighlight` | 渲染安全 Markdown | `<MarkdownRenderer content='# Hello' allowHtmlTags={false} />` |
| `AiDocumentDownloadMenu` | 文档下载菜单 | `actions`, `ondownload` | 选择后调用下载动作 | `<AiDocumentDownloadMenu {actions} ondownload={download} />` |
| `AiDocumentEditor` | AI 文档编辑器 | `content`, `fontSize`, `allowHtmlTags`, `showRunButton`, `showCodePreviewToggle`, `allowUnsafeCodePreview` | 编辑后写回 markdown | `<AiDocumentEditor bind:content={markdown} showToolbar />` |
| `AiTableEditor` | AI 表格编辑器 | `columns`, `rows`, `editable`, `ondownload` | 显示单元格并报告编辑 | `<AiTableEditor {columns} {rows} editable />` |

#### 场景：解析和预览文档内容

输入 Markdown '# Hello'，输出安全 HTML 和文档模型。markdown 是页面 $state 字符串；表格 columns/rows 采用 AiTableEditor 的公开类型。下载动作由 actions 和 download 宿主回调提供，拒绝 Promise 时交给页面错误边界。

```ts
import { parseMarkdown, renderMarkdownDocument, isLanguageSupported, highlightCode, resolveDocumentMarkdownContent, resolveDocumentDownloadActions, downloadAiDocument } from '@h-ai/ui'
const html = parseMarkdown('# Hello', { allowHtmlTags: false }) // heading HTML
const document = renderMarkdownDocument('# Hello') // outline and parsed blocks
isLanguageSupported('typescript') // true
highlightCode('const total = 1', 'typescript') // highlighted HTML
resolveDocumentMarkdownContent('const total = 1', 'code', 'typescript') // fenced Markdown
const actions = resolveDocumentDownloadActions([{ id: 'markdown', label: 'Markdown' }])
await downloadAiDocument({ actionId: 'markdown', content: '# Hello', filename: 'hello.md' }) // browser download
```

#### 场景：AI 文档与表格


> `AiDocumentEditor` 默认只允许 Markdown 内置预览。HTML / JS / CSS 等高风险预览需要显式设置 `allowUnsafeCodePreview`，或通过 `oncoderun` 返回受控的预览结果。
>
> Mermaid 图表开箱即用：文档（`sourceKind='document'`）里的 ` ```mermaid ` 代码块在阅读态自动渲染为图表；code 模式（`sourceKind='code'` + `showCodePreviewToggle`）下可在「代码 / 预览」间切换。Mermaid 以 `securityLevel: 'strict'` 渲染为消毒后的 SVG，无需开启 `allowUnsafeCodePreview`。
>
> `MarkdownRenderer` 与 `AiDocumentEditor` 还支持展示层配置：
>
> - `fontSize` 支持 `number`（按 px 解释）或任意 CSS 长度字符串（如 `1.125rem`）
> - `allowHtmlTags` 默认关闭；开启后会按安全白名单解析 `<b>` / `<i>` / `<u>` / `<mark>` 等 HTML 标签，危险标签与属性仍会被消毒
> - 安全 HTML 文本中的引号、比较符和 `&` 实体只保留一层含义，配置代码不会显示为实体编号；编码后的标签保持文字，不会重新作为标签执行。
> - HTML 中的 `<pre><code class="language-yaml">` 等代码块也会安全重建高亮和复制按钮，不保留输入的任意样式或事件。支持 YAML、TypeScript、Shell、PowerShell、dotenv、Nginx、Dockerfile 和 Svelte 等常用语言。
> - 原始 `<img>` 可保留 `width` / `height`（1–99999 的正整数像素值），用于在图片延迟加载前预留空间，减少文档布局和锚点位置跳变；百分比、负数、小数、事件及任意 `style` 不保留。

```svelte
<MarkdownRenderer content={markdown} fontSize='1.125rem' allowHtmlTags />

<AiDocumentEditor
  title='方案文档'
  content={documentMarkdown}
  fontSize={18}
  allowHtmlTags
  showToolbar
  showOutline={false}
/>
```

<a id="tool-workspaces"></a>

### 运行工具与编辑产物：工作台组件

应用提供工具目录、提交回调和可访问的产物，工作台展示进度与结果。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `ArtifactWorkspace` | 产物编辑工作台 | `artifacts`, `onread`, `onsave?` | 草稿保存后版本加1；冲突保留草稿 | `<ArtifactWorkspace artifacts={[report]} onread={readArtifact} onsave={saveArtifact} />` |
| `ToolWorkspace` | 工具执行工作台 | `tools`, `onrun`, `onstatus?`, `oncancel?` | 示例输入2和3，结果 total=5 | `<ToolWorkspace tools={catalog} onrun={run} />` |

#### 场景：运行工具并继续编辑产物

下文给出实际输入及页面变化。表格中的数据和回调由应用按公开 Props 提供；组件不会隐式加载业务数据。

<a id="工具与产物工作台"></a>

#### 场景：工具与产物工作台

`ArtifactWorkspace` 和 `ToolWorkspace` 通过 `@h-ai/ui/components/scenes/tools/index` 或根入口使用。组件不调用业务 HTTP、不访问数据库，也不创建工具实现；宿主通过回调提供已授权的数据和操作。异步读取、创建、保存、历史、改写、运行、查询和取消回调接收 `AbortSignal`，宿主应继续传给实际请求；`onselect/onartifact/onerror/onleaveguard/onrunchange` 等通知按各自签名调用，不额外传入信号。


提供 `oncreate({ title, kind, content }, signal)` 可启用内置新建表单，选择 Markdown、HTML、表格或图表模板；创建成功返回 `ArtifactDocument`。宿主将新产物加入列表；组件不会隐式持久化。

产物摘要包含 `id/title/kind/version`，可选 `editable/mediaType/updatedAt/downloadUrl`；读取结果增加 `content/mediaUrl`。`kind` 支持 `markdown/html/table/chart/image/audio/video/file`。`version` 是业务内容版本，不代替工程补丁的 Git `revision`。

以下示例只使用内存数据演示回调；实际应用在服务层访问接口，并在服务端校验主体、资源和基础版本。

```svelte
<script lang="ts">
  import { ArtifactWorkspace, type ArtifactDocument, type ArtifactSaveRequest, type ArtifactSaveResponse } from '@h-ai/ui/components/scenes/tools/index'

  let report: ArtifactDocument = {
    id: 'report', title: '报告', kind: 'markdown', version: 1,
    content: '# 简介\n\n产品介绍。', editable: true,
  }
  async function readArtifact() { return report }
  async function saveArtifact(request: ArtifactSaveRequest): Promise<ArtifactSaveResponse> {
    if (request.baseVersion !== report.version)
      return { status: 'conflict', currentVersion: report.version }
    report = { ...report, version: report.version + 1, content: request.content }
    return { status: 'saved', document: report }
  }
</script>

<ArtifactWorkspace artifacts={[report]} onread={readArtifact} onsave={saveArtifact} />
```

Markdown 复用 `AiDocumentEditor`。普通段落和标题支持可视编辑，代码、Mermaid、表格、HTML 和无法可靠还原的扩展保留原始块，通过源码页签修改；未修改块逐字保留。结构变化无法安全回写时不覆盖原文，保留当前编辑 DOM，提供复制文字与重新读取动作。历史查看为只读；以历史版本创建草稿时先读取最新基线，保存再生成新版本。版本冲突保留本地草稿，不能自动重试覆盖。

表格 `content` 使用现成 `AiTableData` 的 JSON：`table_columns` 和 `table_rows`；单元格变更回写 JSON 草稿。图表 JSON 使用 `type/data/x/y`，仅支持既有五种基本图形，不透传未知回调或属性。图片、音频和视频使用宿主提供的授权 `mediaUrl`，视频读取由宿主支持 Range。文本下载与版本历史仍归业务服务管理。

HTML 预览允许内联脚本交互，iframe 仅开放 `allow-scripts`，不开放 `allow-same-origin`、表单、下载或顶层导航。预览先插入默认离线的资源 CSP，移除 base、刷新、嵌套框架和外链跳转。此限制不能代替服务端出口隔离：宿主仍须配置独立预览来源、适当的父页面 `frame-src` 和受控网络，宿主父页面应设置 `frame-src 'self'` 阻止子框架外部导航；浏览器可能显示被阻止的框架错误页，应用可切源码再预览恢复。不要把子框架资源 CSP 当作完整网络边界。

工具目录每项含 `name/description/inputSchema`，可选 `title/examples`。简单字段按 Schema 生成表单；`examples` 为 `{ label, input }[]`，点击后只填参数，仍需用户提交；嵌套结构放入高级参数。完整 Schema 和授权继续由服务端验证。可视改写使用选区快照精确映射普通标题、段落及完整加粗/链接，复杂或跨块选区提示切换源码选区；不近似定位替换。

工具可选传 `resources: readonly { id, title, kind?, mediaType? }[]`。Schema 的 `format: artifact-id/artifact-ids` 自动使用可搜索单选/多选；可选 `contentMediaType` 按 MIME 过滤候选（如 image/*），仍保留手填 ID。列表只用于选择，宿主读取与执行时继续授权。

```svelte
<script lang="ts">
  import { ToolWorkspace, type ToolCatalogItem, type ToolRun, type ToolRunRequest } from '@h-ai/ui/components/scenes/tools/index'
  const catalog: ToolCatalogItem[] = [{
    name: 'sum', description: '计算两个数的合计',
    inputSchema: { type: 'object', required: ['a', 'b'], properties: { a: { type: 'number' }, b: { type: 'number' } } },
    examples: [{ label: '2 + 3', input: { a: 2, b: 3 } }],
  }]
  async function run(request: ToolRunRequest): Promise<ToolRun> {
    return { id: 'demo-run', status: 'succeeded', result: { total: Number(request.input.a) + Number(request.input.b) } }
  }
</script>

<ToolWorkspace tools={catalog} onrun={run} />
```

宿主可通过 `onleaveguard(guard | undefined)` 注册产物异步离开确认，所有会销毁编辑工作台的菜单、切任务、新建任务、登出及 SPA 导航都应先调用；组件为硬刷新和关闭提供 beforeunload 提示。取消确认时草稿保留，确认丢弃才离开。

工具的 `onrun` 请求还携带组件生成的 `idempotencyKey`；未知提交重试沿用同一个键。`initialRun/onrunchange` 可连接宿主持久回执，提供 `onstatus` 时挂载主动续看；`onstatus` 可返回 null，表示暂未找到受理记录，不宣称取消。宿主可在 URL 只保存 opaque receipt/key，通过授权服务找回；表单参数仍只在内存。未知提交若有原请求快照会锁定表单并原样重试；已知回执恢复期间也锁定工具选择。另开操作需确认旧任务可能继续，再生成新键。完成的工具产物按 ID 合并进最近 100 个候选资源。

恢复引用通过 `initialRun` 初始化组件挂载；它不是随 props 更新而切换任务的受控值。`onrunchange(run | undefined)` 通知宿主保存或清除当前引用。未知提交须保留 `ToolRun.idempotencyKey`，已取得真实回执时省略该字段。以下字符串仅为格式示例，实际应使用宿主已保存的原始引用和键，不生成新键：

```ts
import type { ToolRun } from '@h-ai/ui/components/scenes/tools/index'

const pendingSubmission: ToolRun = {
  id: 'opaque-pending-reference',
  status: 'unknown',
  idempotencyKey: 'saved-user-action-key',
}
const acceptedSubmission: ToolRun = {
  id: 'opaque-run-receipt',
  status: 'unknown',
}
```

将相应对象传为 `initialRun`，在 `onrunchange` 保存最新引用；`onstatus(id, signal): Promise<ToolRun | null>` 由宿主把待定引用映射到原幂等键查找、把已知回执映射到状态查询。找不到记录返回 `null`，不能伪造取消或成功。

长任务的 `onrun` 应尽快返回带 `id/status` 的回执，由 `onstatus` 读取进度和终态。`progress` 是 0..1 的完成比例；`message` 必须已脱敏。`oncancel` 返回实际取消状态，未确认停止时保留运行或待核验状态；组件卸载只停止等待和轮询，不宣称服务端任务已结束。

<a id="charts"></a>

### 展示指标和图形：图表组件

图表消费应用提供的数据与列定义；指标卡展示已计算的值，不自行查询或汇总业务。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `Chart` | 图形 | `type?`, `preset?`, `data`, `x`, `y` | 显示两组柱形 | `<Chart preset='grouped-bar' {data} x='month' y={['revenue', 'cost']} />` |
| `DashboardGrid` | 看板栅格 | `columns`, `label`, children | 宽屏两列，窄屏收拢 | `<DashboardGrid columns={2} label='Metrics'><MetricCard title='Orders' value={42} /></DashboardGrid>` |
| `MetricCard` | 数值指标 | `title`, `value`, `unit?`, `trend?` | 显示42与+12.8% | `<MetricCard title='Orders' value={42} trend={12.8} />` |
| `ReportCard` | 报表卡片 | `title`, `loading?`, children | 显示标题及内容区域 | `<ReportCard title='Revenue'>Chart content</ReportCard>` |

#### 场景：Charts 图表

轻量看板由 `MetricCard`（数值、单位、百分比变化）、`ReportCard`（标题、操作、内容、加载/空态）和 `DashboardGrid`（按容器宽度收拢为一/二/多列）组成。指标卡自身不加载图形引擎；`trend={12.8}` 表示 +12.8%，`trendTone` 独立表达业务好坏，下降也可以是 success。缺失或非有限数显示“—”，零值正常显示。

`Chart.preset` 支持：`grouped-bar`、`stacked-bar`、`stacked-area`、`donut`、`sparkline`。预设补默认图形类型和配置，显式 `type` 及原生属性优先；例如 `innerRadius={0.8}` 覆盖环形默认半径。其他 LayerChart 属性与 snippet 继续透传。

按类型动态加载渲染器；SSR 保留高度并显示加载占位，浏览器挂载后绘制。加载态和空数据不加载渲染器。只需要看板组件时优先使用公开 charts 入口。高级图形通过 `ReportCard` 的 children 使用原生 LayerChart，不受 Chart 的五种类型限制；应用需显式依赖兼容的 `layerchart`，按需使用 `layerchart/svg`、`layerchart/hierarchy` 等实际公开入口。用动态组件加载控制高级图形的加载时机，见 admin 的原生 ArcChart 示例。

```svelte
<script lang='ts'>
  import { Chart, DashboardGrid, MetricCard, ReportCard } from '@h-ai/ui/components/scenes/charts/index'

  const data = [
    { month: 'Jan', revenue: 42, cost: 24 },
    { month: 'Feb', revenue: 58, cost: 31 },
  ]
</script>

<DashboardGrid label='Key metrics' columns={4}>
  <MetricCard title='Revenue' value='128,430' unit='CNY' trend={12.8} trendTone='success' trendLabel='vs previous month' />
</DashboardGrid>
<ReportCard title='Revenue and cost'>
  <Chart preset='grouped-bar' {data} x='month' y={['revenue', 'cost']} />
</ReportCard>
```

`Chart type='line'` 默认透传 LayerChart 原生折线图；需要监控看板常见的“分段线 + 圆点 + 最近点 hover + 竖向参考线”时，使用 `lineVariant='segmented-point'`：

```svelte
<Chart
  type='line'
  data={trendData}
  x='label'
  y={['rateLimit', 'circuitBreak']}
  series={trendSeries}
  lineVariant='segmented-point'
  tooltipMode='nearest'
  showCrosshair
  legend
  grid
/>
```

<a id="crud"></a>

### 组织查询与编辑流程：`CrudPage`

资源定义连接查询、创建、更新与删除回调；页面控制器管理加载、导航和编辑状态。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `defineCrud` | 声明列表表单 | `CrudResource with fields/API callbacks` | `CrudDef for CrudPage` | `defineCrud(resourceDefinition)` |
| `createCrudController` | 托管列表状态 | `CrudDef, { autoLoad? }?` | `controller data/nav/loading/loaded/error/load/reload` | `createCrudController(crud, { autoLoad: false })` |
| `mapPaginated` | 映射分页条目 | `PaginatedResult<T>, (item,index) => R` | `PaginatedResult<R> retaining total/page/pageSize` | `mapPaginated(page, item => ({ ...item, selected: false }))` |
| `createBrowserNavAdapter` | 接入普通浏览器导航 | `none` | `NavAdapter` | `createBrowserNavAdapter()` |
| `CrudPage` | CRUD 主页面 | `crud`, `data`, `permissions`, `form`, `pagination`, `density`, `detailColumns`, `showHeader`, `toolbarLeading`, `toolbarActions`, `card`, `tableCell`, `onrowclick`, `sortableColumns`, `nav`, `loading`, `loaded`, `error`, `onRetry`, `keepPreviousData` | 列表、表单与资源回调 | `<CrudPage {crud} data={controller.data} nav={controller.nav} />` |
| `CrudFilterBar` | 过滤工具栏（搜索 + 多类型过滤 + 重置） | `filterFields`, `searchValue`, `onsearch`, `onfilterchange`, `onreset` | 提交查询条件 | `<CrudFilterBar filterFields={filters} onsearch={search} />` |
| `CrudDetailPanel` | 详情面板（抽屉/弹窗） | `open`, `item`, `fields`, `variant`, `drawerWidth`, `modalSize` | 显示指定记录详情 | `<CrudDetailPanel bind:open={open} item={selected} fields={fields} />` |
| `CrudEditPanel` | 编辑面板（抽屉/弹窗） | `open`, `fields`, `variant`, `drawerWidth`, `modalSize`, `onsubmit` | 提交声明的可写字段 | `<CrudEditPanel bind:open={open} fields={fields} onsubmit={save} />` |
| `CrudDeleteConfirm` | 删除确认框 | `open`, `loading`, `onconfirm` | 确认后调用 remove | `<CrudDeleteConfirm bind:open={open} onconfirm={remove} />` |

#### 场景：CRUD 场景

下图对应 CrudPage 配合 createCrudController 的查询场景。组件显示状态，controller 调用应用提供的数据服务。

![CRUD 列表：查询、旧数据和最新响应](../images/function-ui-crud-loading.svg)

编辑筛选值不会自动查询，点击查询/Enter 才提交；翻页与排序使用已提交条件。controller 只接受最新请求结果，迟到响应不会覆盖新列表。首次失败显示错误和重试；刷新失败默认保留旧数据，只有 loaded 且 total=0 才显示空状态。


> `CrudPage`、`FeedbackList` 统一使用卡片内的查询栏、独立滚动表格和底部分页。搜索、查询、重置始终可见，扩展筛选默认收起且保留输入；点击查询或 Enter 一次提交全部条件，修改字段不自动查询。翻页和排序沿用已提交条件；重置清空搜索、筛选和排序并回到第一页。排序按钮只在支持排序的列头显示，`sortableColumns` 应只列出后端支持的字段。`detailColumns` 配置详情入口，`toolbarLeading` / `toolbarActions` 配置卡片上方的说明和业务操作；`card` 与 `tableCell` 保留自定义内容。过滤字段支持 `select`、`boolean`、`number`、`date`、`date-range`、`text`。 未提供 `sortableColumns` 时不显示排序按钮，避免把当前页排序当成服务端排序。
>
> 页面根容器会占满父级可用高度。表格无论是否有数据都会撑满剩余空间，仅数据区域滚动；表头固定在数据区顶部，分页栏固定在列表卡片底部。
> 从视口外层容器到表格内容区之间的每层容器都需要使用可分配的剩余高度（例如 `flex flex-1 min-h-0 flex-col`），中间包装层不能仅按内容自动计算高度。空表、少量数据和长列表均沿用底部分页。
>
> 表格列会优先压缩到 7rem 并截断超长文本；列总宽度仍超过容器时才显示横向滚动条。操作列固定在右侧，横向滚动时保持可见。
> `CrudPage` 通过 `form` 配置新建/编辑的展示形式：
>
> - `form.variant`：`'drawer'`（抽屉，默认）或 `'modal'`（弹出窗口）。
> - 抽屉：`form.drawerSize` 选预设尺寸，`form.drawerWidth` 传任意 CSS 宽度（优先级更高）；默认可拖动左侧边缘调整宽度，并按资源记忆，`form.drawerResizable=false` 可关闭。
> - 弹窗：`form.modalSize` 选预设尺寸，`form.modalWidth` / `form.modalHeight` 传任意 CSS 尺寸。
>
> `pagination` 配置分页栏（始终显示）：`showSizeChanger`、`pageSizeOptions`、`showJumper`、`showTotal` 默认开启；紧凑视图可用 `showPageInfo` 关闭页码文案、`showFirstLast` 关闭首页 / 末页按钮。
>
> `density` 配置列表密度：`'normal'`（默认）或 `'compact'`（紧凑）。它只影响列表行、行内操作、分页与创建/编辑/详情表单元素，不影响页头与筛选栏。
>
> `CrudPage` 受控加载态：`loading` / `loaded` / `error` / `onRetry` / `keepPreviousData`。仅当 `loaded && total === 0` 时才展示空状态（避免首次请求未回时误显“暂无数据”）；首次查询展示“查询中”；失败且无可用数据时展示错误与重试（`onRetry`）；`keepPreviousData`（默认 true）在刷新/失败时保留旧数据。
>
> 纯客户端（无 SvelteKit SSR）可用框架级 `defineCrud` + `createCrudController` 托管 `data` 与 `nav`，自带 latest-wins（seq + AbortSignal）、失败保留旧数据、惰性加载与并发去重：
>
```svelte
<script lang='ts'>
  import { createCrudController, CrudPage, defineCrud } from '@h-ai/ui'

  const crud = defineCrud({
    name: 'users', label: 'Users',
    fields: [{ id: 'name', label: 'Name', type: 'text' }],
    api: {
      list: async () => ({ items: [{ id: 'u1', name: 'Ada' }], total: 1, page: 1, pageSize: 10 }),
    },
  })
  const controller = createCrudController(crud, { syncUrl: false })
</script>
<CrudPage
  {crud} data={controller.data} nav={controller.nav}
  loading={controller.loading} loaded={controller.loaded}
  error={controller.error} onRetry={controller.reload}
/>
```
>
> `Tabs` 支持惰性页签：`lazy` 开启后未激活过的页签内容不渲染（`children` 提供 `isActivated(key)` 判断），`onactivate(key)` 在页签首次激活时触发一次，适合配合 `createCrudController({ autoLoad: false })` 在首次可见时才加载。

#### 场景：声明式 CRUD 页面（CrudPage）

```svelte
<script lang='ts'>
  import { createSvelteKitNavAdapter } from '@h-ai/kit/client'
  import { CrudPage } from '@h-ai/ui'

  const { data } = $props()
  const nav = createSvelteKitNavAdapter()
</script>

<CrudPage
  crud={roleCrud}
  {data}
  permissions={{ create: true, update: true, delete: true }}
  form={{
    variant: 'modal',
    modalSize: '3xl',
    columns: 2,
    labelPosition: 'top',
  }}
  pagination={{
    showSizeChanger: true,
    showJumper: true,
    pageSizeOptions: [10, 20, 50],
  }}
  density='compact'
  detailColumns={['name']}
  sortableColumns={[
    { key: 'createdAt', label: '创建时间' },
  ]}
  {nav}
/>
```

> 抽屉形式可改用 `form={{ variant: 'drawer', drawerWidth: '40rem' }}`；用户拖动后的宽度会覆盖初始宽度并按资源记忆。

<a id="code"></a>

### 浏览源代码：`CodeWorkspace`

用文件列表和按需读取回调展示源代码，读取权限与文件修改由宿主控制。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `CodeWorkspace` | 源码工作区 | `source: CodeWorkspaceSource` | 打开 README.md 显示 # Hello | `<CodeWorkspace {source} />` |

#### 场景：浏览文件并查看代码

下文给出实际输入及页面变化。表格中的数据和回调由应用按公开 Props 提供；组件不会隐式加载业务数据。

<a id="代码工作区"></a>

#### 场景：代码工作区

用 `CodeWorkspace` 浏览只读源码。最小接入只需提供目录列表和文件内容。目录回调收到 `null` 时返回根节点。打开文件即创建标签，标签按文件 ID 和版本复用，切换时恢复近期查看过的文件的光标与滚动位置。

```svelte
<script lang='ts'>
  import type { CodeWorkspaceSource } from '@h-ai/ui/components/scenes/code/index'
  import { CodeWorkspace } from '@h-ai/ui/components/scenes/code/index'

  const source: CodeWorkspaceSource = {
    listChildren: () => [
      { kind: 'file', id: 'readme', name: 'README.md' },
    ],
    readFile: () => ({ text: '# Hello', language: 'markdown' }),
  }
</script>

<CodeWorkspace {source} />
```

传入 `source.search` 启用文件名和工作区内容搜索，返回 `nextCursor` 时可继续加载。文件或目录上的 `markers` 展示风险和 Git 状态，`readFile` 返回的 `annotations` 可标记行或范围。传入 `inspector` 和 `selectionActions` snippet 连接右侧检查区及选区浮动操作。更多用法见[代码工作区接入](../development/ui.md#代码工作区)。

Monaco 和同源 worker 由 Vite 在浏览器按需加载。主题默认跟随 Hai，可选预设或传自定义配色。同页 Monaco 编辑器共享主题。移动端和编辑器加载失败时提供纯文本浏览。

行前图标由 `annotationIcon` Snippet 自定义。悬停时优先显示标注的 `hoverText`，否则使用 `annotationHover` Snippet，支持交互组件。按 Enter 可进入浮层，按 Escape 关闭。

<a id="guide"></a>

### 提供导览与帮助：`createGuide`

应用定义导览步骤、定位目标和帮助文章，控制器负责开始、前进、结束与完成记录。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `createGuide` | 引导控制器 | `GuideOptions: tours, articles?, nav?, persistence?, persistKey?` | `GuideController; no init/close` | `createGuide({ tours: [], persistence: "memory" })` |
| `resolveGuideText` | 延迟翻译引导文案 | `string or translation callback?` | `string` | `resolveGuideText(() => m.help())` |
| `GuideHost` | 显示首次邀请、页面导览与帮助弹窗 | `guide`, `locale`, `scope`, `autoStart` | 显示导览与帮助界面 | `<GuideHost {guide} locale='en-US' scope='demo-user' />` |
| `HelpCenter` | 可独立使用的帮助中心 | `articles`, `tours`, `locale`, `selectedId`, `onstart` | 检索和阅读帮助内容 | `<HelpCenter articles={articles} tours={tours} locale='en-US' />` |

#### 场景：新手引导与帮助中心

`@h-ai/ui/guide` 提供 `createGuide`、`GuideHost`、`HelpCenter` 和相关类型。无需 init/close；引擎在开始导览时按需加载，浮层复用当前主题。组件内置中英日文按钮、进度和错误提示，业务内容使用应用 i18n。

同一入口的 `resolveGuideText(text?)` 可解析字符串或 i18n 回调；`GuideHost` 会自动解析文案。

下例放在应用布局中；`nav` 是应用现有 NavAdapter，`locale`、`user` 与翻译函数 `m` 来自应用，翻译 key 需在应用消息中定义。目标按钮放在 `/users` 页面。

```svelte
<script lang='ts'>
  import { createGuide, GuideHost } from '@h-ai/ui/guide'

  const guide = createGuide({
    nav,
    persistKey: 'my-app-guide',
    tours: [
      {
        id: 'users',
        version: 1,
        route: '/users',
        title: () => m.guide_users_title(),
        description: () => m.guide_users_description(),
        steps: [
          {
            target: 'users-create',
            title: () => m.guide_create_title(),
            description: () => m.guide_create_description(),
          },
        ],
      },
    ],
    articles: [
      {
        id: 'users-help',
        title: () => m.guide_users_title(),
        content: () => m.guide_users_markdown(),
        tourId: 'users',
      },
    ],
  })
</script>

<GuideHost {guide} {locale} scope={user.id} autoStart='users' />
<Button onclick={() => guide.openHelp()}>{m.help()}</Button>
<!-- 在目标页面为现有按钮添加锚点，无需额外包装。 -->
<Button data-guide='users-create' onclick={createUser}>{m.create_user()}</Button>
```

- `start(id)` 返回 `Promise<boolean>`，允许手动重看；失败返回 false 并设置 `error`。`startIfNeeded(id)` 返回 boolean 并显示首次邀请，通常由 autoStart 处理。
- `openHelp(articleId?)` 打开帮助，`stop()` 取消导览，`reset(id)` 删除当前用户的偏好。完成、稍后和不再提醒分别记录；稍后暂缓一天，Cookie 默认保存一年。
- 关闭按钮、Escape 和遮罩点击在首帧定位期间也会取消等待、清除 `busy`；启动中的 `start()` 返回 false，不记录完成。
- `persistence` 支持 cookie（默认）、localStorage、memory；受限存储回退到实例内存。scope 使用非敏感用户标识，version 变化会重新提示。
- 通过已有 NavAdapter 接入 SvelteKit、SPA 或原生 WebView；默认完整导航使用 sessionStorage 保存短期启动记录。应用只在浏览器的组件挂载后读取记录。服务端渲染时，为每个请求创建独立实例。
- 目标等待默认 3000ms，可用 waitTimeout 调整。before(signal) 可展开页签/抽屉；必要元素缺失停止，可选步骤使用 optional 跳过。引导不会自动提交业务表单。
- 业务文案用函数延迟求值，并传入当前 locale。步骤内容按纯文本显示；帮助正文复用安全 MarkdownRenderer，原始 HTML 关闭。
- HelpCenter 可独立放入帮助页面，props 为 articles、tours（可选）、locale、selectedId 和 onstart；支持类别标签、标题/正文搜索和关联导览。

admin-console 示例和 CLI fullstack Web/App/Desktop 默认包含帮助入口、首次邀请及个人资料导览。完整配置和验证场景见 [引导指南](../../../packages/cli/templates/skills/hai-ui/guide.md)。

<a id="theme"></a>

### 切换主题：`@h-ai/ui/theme`

在 HTML 首次显示前应用受信任的默认主题，再由页面主题选择器读取和更新偏好。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `getThemeInfo` | 主题元数据 | `theme ID` | `ThemeInfo or undefined` | `getThemeInfo("light")` |
| `isDarkTheme` | 识别暗色主题 | `theme ID` | `boolean` | `isDarkTheme("dark")` |
| `normalizeThemeId` | 归一化主题 | `candidate theme ID, fallback?` | `supported theme ID` | `normalizeThemeId("unknown", "light")` |
| `normalizeHexColor` | 归一化颜色 | `string or null/undefined` | `six-digit lowercase hex string or null` | `normalizeHexColor("#5765F0")` |
| `resolveThemeTone` | 主题亮暗语义 | `theme ID` | `light or dark` | `resolveThemeTone("light")` |
| `createThemeBootstrapScript` | 防首屏主题闪烁 | `ThemeBootstrapScriptOptions from trusted host config` | `script string for the application HTML shell` | `createThemeBootstrapScript({ storageKey: "theme", defaultThemeId: "light" })` |
| `getThemeInitScript` | 默认主题启动脚本 | `none` | `script string` | `getThemeInitScript()` |
| `applyTheme` | 切换页面主题 | `theme ID, persist? (default true)` | `void; updates DOM/browser preference` | `applyTheme("dark")` |
| `getCurrentTheme` | 读取页面主题 | `none` | `theme ID string` | `getCurrentTheme()` |
| `getSavedTheme` | 读取主题偏好 | `fallback theme ID?` | `theme ID string` | `getSavedTheme("light")` |
| `ThemeColorPicker` | 主题色选择器 | `value`, `presets`, `onchange` | 更新主题色选择值 | `<ThemeColorPicker bind:value={color} />` |
| `ThemeSelector` | 完整主题选择面板 | No props | 选择完整主题 | `<ThemeSelector />` |
| `ThemeToggle` | 明/暗主题切换 | No props | 切换亮暗主题 | `<ThemeToggle />` |

#### 场景：主题切换

使用内置的主题工具函数管理 15 个精选 DaisyUI 主题、高对比、直角商务及护眼主题：

`high-contrast` 随共享 theme.css 提供：黑底亮字、清晰边框/焦点、增强次要文字及占位符对比度。ThemeSelector 提供三语名称；示例与默认生成工程可选择，可在 fullstack 的主题配置中指定可选主题。配色按普通文字 7:1 的目标验收，不代表任意业务内容已通过整站无障碍认证。

`eye-care` 随共享 theme.css 提供暖绿色背景、深色正文、可读占位符与清晰焦点。主题选择器显示“护眼”，示例及默认模板可直接选择，刷新后保留偏好；现有默认主题及 fullstack 显式 themes 白名单不变。

`formal` 提供直角的商务外观，按钮、输入框、卡片与弹窗不使用装饰性圆角；主题选择器提供三语名称，示例和默认模板可选择。Button 的 submitHint 仅在 type=submit 时显示原生 Enter 提示，不绑定全局快捷键；LoginForm 默认在桌面首次就绪且页面无焦点时聚焦标识，autoFocus=false 可关闭。筛选 Enter 即时查询且忽略输入法确认；主题菜单支持方向键/Home/End、Enter/Space 及 Esc 恢复焦点；确认框默认聚焦取消，Esc 同步取消状态。

```ts
import {
  applyTheme, // 应用主题（自动持久化到 localStorage）
  createThemeBootstrapScript, // 生成可注入 app.html 的首屏主题恢复脚本
  getCurrentTheme, // 获取当前主题
  getSavedTheme, // 读取安全缓存，可传入应用配置的默认主题
  getThemeInitScript, // 返回可注入到 HTML shell 的防闪烁脚本文本
  isDarkTheme, // 检查是否暗色主题
  normalizeHexColor, // 归一化 #RGB / #RRGGBB 主题色
  normalizeThemeId, // 校验主题 ID 并自动回退
  THEME_GROUPS, // 按亮色/暗色分组
  THEMES, // ThemeInfo[] — 18 个主题元数据
} from '@h-ai/ui/theme'
```

简单场景可以直接使用 `getThemeInitScript()`；如果应用有自定义存储 key、主题色 CSS 变量或语言偏好，推荐在服务端通过 `createThemeBootstrapScript()` 生成脚本后再注入 `app.html`。

在 SvelteKit 的 `app.html` 中，可以先放一个占位符：

```html
<head>
  <script>
    %theme_bootstrap%
  </script>
</head>
```

然后在 `hooks.server.ts` 里注入：

```ts
import type { Handle } from '@sveltejs/kit/hooks'
import { createThemeBootstrapScript, DEFAULT_THEME_COLOR_CSS_VAR } from '@h-ai/ui/theme'

const themeBootstrapScript = createThemeBootstrapScript({
  storageKey: 'hai-demo-preferences',
  defaultThemeColor: '#5765f0',
  colorCssVar: DEFAULT_THEME_COLOR_CSS_VAR,
})

export const handle: Handle = ({ event, resolve }) => resolve(event, {
  transformPageChunk: ({ html }) => html.replace('%theme_bootstrap%', themeBootstrapScript),
})
```

<a id="theme-locale-guide"></a>

#### 场景：主题、语言和AI内容显示

主题偏好和语言初始化及其默认值见 [UI 调用参数](ui.md#call-options)。

每个应用在根布局选择默认主题。浏览器调用 `applyTheme()` 更换主题，用 `getSavedTheme()` 读出之前保存的主题。要能显示某个主题，构建产物中必须有相应 CSS。切换深色后检查长文、图表文字和错误状态是否仍清晰可读。

![浅色设置页](../images/settings-light.png)

![深色设置页](../images/settings-dark.png)

Markdown 的 `allowHtmlTags` 默认 `false`，`true` 只渲染允许的HTML并继续安全清理；不能把它当脚本沙箱。字号、Mermaid与编辑器参数由组件props提供，按公开类型和业务阅读需求选择。修改后同时检查代码复制、图表文字和暗色对比度。

![关闭HTML时的真实内容](../images/ai-markdown-html-off-zh-CN.png)

![允许安全HTML及字号变化](../images/ai-markdown-html-on-zh-CN.png)

![深色文档工具栏](../images/ai-document-dark.png)

界面文字走 `zh-CN`、`en-US`、`ja-JP` 翻译，错误使用安全消息；不要通过翻译开关泄露原始异常。

<a id="locale"></a>

### 切换语言与隔离请求：`@h-ai/ui/i18n`

浏览器维护当前页面语言；服务端为每次请求单独设置语言，避免串到其他用户。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `createLocaleStore` | 组件树语言状态 | `{ defaultLocale?, supportedLocales?, detectBrowser?, persistKey? }` | `locale store with current/set/isSupported` | `createLocaleStore({ defaultLocale: "zh-CN", detectBrowser: false })` |
| `getGlobalLocale` | 读取当前语言 | `none` | `locale string from current context` | `getGlobalLocale()` |
| `setGlobalLocale` | 设置浏览器或启动语言 | `locale` | `void; use request context for SSR` | `setGlobalLocale("en-US")` |
| `detectBrowserLocale` | 识别浏览器语言 | `supportedLocales?` | `supported locale or null` | `detectBrowserLocale()` |
| `isLocaleSupported` | 校验支持语言 | `locale, supportedLocales?` | `boolean` | `isLocaleSupported("ja-JP")` |
| `resolveLocale` | 归一化语言 | `locale, supportedLocales?, fallback?` | `supported locale` | `resolveLocale("en")` |
| `interpolate` | 替换文案参数 | `template string, InterpolationParams` | `string` | `interpolate("Hello {name}", { name: "Ada" })` |
| `LanguageSwitch` | 语言切换 | No props | 更换全局 UI 语言 | `<LanguageSwitch />` |

#### 场景：国际化 (i18n)

@h-ai/ui 采用**组件内置翻译**模式：

- 场景组件（`scenes/`）内置中英日文翻译（zh-CN / en-US / ja-JP），开箱即用
- 组件自动响应全局 locale 变化（通过 `@h-ai/core` 同步）
- 应用层只需处理**页面级文本**，组件内部文本由 @h-ai/ui 统一管理
- 如需覆盖特定文本，通过 `submitText`、`labels` 等 props 传入

#### 场景：createLocaleStore

用于客户端 locale 状态管理，自动同步到 `@h-ai/core` 全局 locale 管理器：

```svelte
<script>
  import { createLocaleStore } from '@h-ai/ui/i18n'
  import { setLocale } from '#lib/paraglide/runtime.js'

  const localeStore = createLocaleStore()

  function changeLocale(code) {
    localeStore.set(code) // 更新 UI store + 同步到 @h-ai/core
    setLocale(code) // 同步到 Paraglide（应用层）
  }
</script>

<select value={localeStore.current} onchange={e => changeLocale(e.currentTarget.value)}>
  {#each localeStore.supported as locale (locale.code)}
    <option value={locale.code}>{locale.label}</option>
  {/each}
</select>
```

`@h-ai/ui/i18n` 的 `createLocaleStore` 按“可解析的持久化值 → 完整 navigator.languages（再检查 navigator.language）→ defaultLocale → 支持列表首项”选择语言；首个不支持的候选不触发默认回退。匹配大小写、语言简写及逐级区域/脚本回退，返回 supportedLocales 中的配置代码；同语言多个变体按列表顺序选择。detectBrowserLocale 无实际命中返回 null，不插入框架默认值；空支持列表最终保留调用方默认值。SSR 不读取浏览器候选或修改全局语言。应用若使用 Paraglide，仍需用该项目的 setLocale 同步应用翻译；内置 UI 字典的覆盖范围不因自定义 store 列表而自动增加。

#### 场景：导出的 i18n 工具

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
} from '@h-ai/ui/i18n'
```

#### 场景：请求语言隔离

多位用户的请求可能同时在一个 Node.js 进程里执行。用 `core.i18n.runWithLocale(locale, () => handleRequest())` 为本次请求和它启动的异步工作设定语言。SvelteKit 可以用 `kit.i18n.runWithLocale(locale, () => resolve(event))`，Serv 会按请求头自动设定。翻译优先使用显式传入的 `MessageOptions.locale`，其次使用本次请求的语言，最后使用进程启动时的默认语言。

设定请求语言后，`setGlobalLocale()` 只改本次请求。启动时在请求之外调用它，可设置进程默认语言。服务端渲染时，UI 的语言状态对象只更新自己，翻译读取本次请求的语言。浏览器中从 `@h-ai/ui/i18n` 导入 `createLocaleStore()` 管理当前页面语言，或在翻译时直接传入 `locale`。

<a id="feedback"></a>

### 展示反馈与诊断材料：反馈组件

应用提供已脱敏的材料与受权回调，组件报告用户操作。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `FeedbackModal` | 反馈模态框 | `open`, `onsubmit` | 提交内容给宿主；失败保留输入 | `<FeedbackModal bind:open={open} onsubmit={submitFeedback} />` |
| `FeedbackForm` | 独立反馈表单 | `attachments`, `evidenceSummary`, `onsubmit`, `onfileschange` | 报告提交数据与附件变化 | `<FeedbackForm attachments={attachments} onsubmit={submitFeedback} />` |
| `FeedbackList` | 服务端分页、筛选与处理操作 | `data`, `query`, `permissions`, `onquerychange`, `onstatus` | 查询/操作回调；不自行请求 | `<FeedbackList data={feedbackRows} onquerychange={queryFeedback} />` |
| `FeedbackDetail` | 诊断材料、处理历史与导出 | `report`, `evidence`, `attachments`, `history`, `webhook`, `onretry`, `onexport` | 显示报告和已授权证据 | `<FeedbackDetail report={report} />` |
| `FeedbackScreenshot` | 图片预览、圈选与遮挡 | `attachment`, `onannotate` | 把标注操作交给宿主 | `<FeedbackScreenshot attachment={attachment} onannotate={annotate} />` |

#### 场景：反馈现场与交付检查

反馈的 `evidence` 显示实际已脱敏材料；`oncapture(id?)` 支持隐藏弹窗后跨页补图或替换。接入 `onfileschange` 后提供浏览器原生无声短录屏，停止后作为 WebM/MP4 附件预览或删除（最多 60 秒 / 5 MiB，录屏不自动脱敏）。`FeedbackDetail.onreplay` 按需返回完整页面事件，在“页面回放”播放和定位；日志/环境仍分页读取。

反馈表单的材料内容独立滚动，底部按钮始终可见，展开内容不会穿过操作栏。`FeedbackList` 保留无障碍名称，页面标题由应用的页面组件显示，避免管理页重复标题。

<a id="utilities"></a>

### 处理样式、平台与剪贴板：UI 工具

使用纯工具合并类名、生成界面标识并选择平台样式；复制和 portal 需要相应浏览器能力。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `registerClipboardHostWriter` | 注册 WebView 剪贴板 | `async text => boolean or null to unregister` | `void` | `registerClipboardHostWriter(null)` |
| `writeTextToClipboard` | 复制并核对结果 | `text: string` | `Promise<boolean>; true only when write succeeds` | `writeTextToClipboard("trace-001")` |
| `cn` | 合并类名 | `...string\|boolean\|null\|undefined values` | `string` | `cn("flex", active && "text-primary")` |
| `getDataAttributes` | 只透传 data 属性 | `props record` | `ForwardedDataAttributes` | `getDataAttributes({ "data-testid": "save" })` |
| `generateId` | 生成 UI 标识 | `prefix?; not a security token generator` | `string` | `generateId("field")` |
| `portal` | 把节点移到目标容器 | `HTMLElement, target HTMLElement or selector?` | `Svelte action result with cleanup` | `portal(node, document.body)` |
| `detectPlatform` | 检测终端类型 | `none` | `Platform` | `detectPlatform()` |
| `isMobile` | 检查移动端 | `none` | `boolean` | `isMobile()` |
| `isNativeApp` | 检查原生壳 | `none` | `boolean` | `isNativeApp()` |
| `usePlatform` | 响应式终端视图 | `none; component initialization` | `{ current, isMobile, isApp }` | `usePlatform()` |
| `getVariantClass` | 映射主题样式 | `Variant, prefix?` | `string class name` | `getVariantClass("primary", "btn")` |
| `getSizeClass` | 映射主题样式 | `Size, prefix?` | `string class name` | `getSizeClass("sm", "btn")` |
| `getInputSizeClass` | 映射主题样式 | `Size` | `string class name` | `getInputSizeClass("sm")` |
| `getBadgeVariantClass` | 映射主题样式 | `Variant` | `string class name` | `getBadgeVariantClass("info")` |
| `getBadgeSizeClass` | 映射主题样式 | `Size` | `string class name` | `getBadgeSizeClass("sm")` |
| `getAlertVariantClass` | 映射主题样式 | `Variant` | `string class name` | `getAlertVariantClass("info")` |
| `getProgressVariantClass` | 映射主题样式 | `Variant` | `string class name` | `getProgressVariantClass("primary")` |

#### 场景：合并样式并复制诊断编号

输入类名和不敏感的演示文本；cn 合并条件类名，generateId 返回 UI 标识而不是认证令牌，writeTextToClipboard 返回是否真实写入成功。portal 只能在浏览器挂载节点后使用，销毁时调用返回的 destroy。

```ts
import { cn, generateId, getDataAttributes, getVariantClass, writeTextToClipboard } from '@h-ai/ui'
cn('flex', false && 'hidden') // 'flex'
getDataAttributes({ 'data-testid': 'save', secret: 'ignored' }) // only data-testid
getVariantClass('primary', 'btn') // 'btn-primary'
const id = generateId('field') // generated field identifier
const copied = await writeTextToClipboard('trace-001') // true if copied; false on failure
```

#### 场景：其他导出

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

组件子路径只开放 package.exports 明确列出的 barrel，例如 `@h-ai/ui/components/primitives/index`；不开放任意组件实现或内部存储辅助函数。原生外壳可以调用 `registerClipboardHostWriter()` 提供自己的剪贴板写入方法。

<a id="call-options"></a>

## 调用参数与接入选项

### 参数归属

在 Svelte 项目中安装样式依赖，并按项目需要设置 Tailwind CSS 和 DaisyUI。组件的标题、选项和操作函数直接写在组件标签上，例如 `<Button onclick={save}>保存</Button>`。整个页面共享的主题、语言和导览进度通常在根布局中设置一次。

### 场景：在根布局共享主题、语言和导览

```ts
import { createGuide } from '@h-ai/ui/guide'
import { createLocaleStore } from '@h-ai/ui/i18n'
import { applyTheme } from '@h-ai/ui/theme'

applyTheme('light')
const locale = createLocaleStore({ defaultLocale: 'zh-CN', persistKey: 'orders-locale' })
const guide = createGuide({ tours: [], persistence: 'memory' })
```

在浏览器中调用 `applyTheme('light')` 后，页面切换为浅色主题。`createLocaleStore()` 返回给组件树共享的语言状态，示例使用 `orders-locale` 保存语言偏好。`createGuide()` 返回导览控制器。示例没有设置具体步骤，刷新页面后内存中的导览进度会丢失。可按功能使用以上三个公开导入路径。

### 参数清单

| 参数                                                     | 默认值/必填                         | 说明                                                                                                                         |
| ---------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `applyTheme(theme, persist)`                               | `theme` 必填，`persist` 默认 `true` | 从支持的主题 ID 中选择。被持久化的主题写入浏览器的 `theme` 键                                                                |
| 主题色 `DEFAULT_THEME_COLOR`                               | `#5765f0`                           | 内建主题色，应用可用 CSS 自定义属性替换                                                                                      |
| `createThemeBootstrapScript.storageKey`                    | 必填                                | 首屏脚本读取的浏览器偏好存储键                                                                                               |
| `createThemeBootstrapScript.defaultThemeId`                | `light`                             | 浏览器还没有有效偏好时使用的主题                                                                                             |
| `createThemeBootstrapScript.defaultThemeColor`             | 可省略                              | 指定时使用十六进制颜色；空值跳过默认颜色设置                                                                                 |
| `createThemeBootstrapScript.colorCssVar`、`toneDatasetKey` | 可省略                              | 指定后写入主题颜色 CSS 变量、亮暗色数据属性                                                                                  |
| `createThemeBootstrapScript.locale`                        | 可省略                              | 同时规范化首屏语言信息，提供 `key`、`defaultValue`、`supportedValues`                                                        |
| `createLocaleStore.defaultLocale`                          | `zh-CN`                             | 没有有效候选语言时的默认值                                                                                                   |
| `createLocaleStore.supportedLocales`                       | 框架内建语言列表                    | 填应用实际支持的语言，每项有 `code` 和显示名称 `label`，例如 `{ code: 'en-US', label: 'English' }`                           |
| `createLocaleStore.detectBrowser`                          | `true`                              | 浏览器有多项语言偏好时依序匹配                                                                                               |
| `createLocaleStore.persistKey`                             | `hai-locale`                        | 用于保存浏览器语言偏好的键                                                                                                   |
| `createGuide.tours`                                        | 必填，可为 `[]`                     | 可执行的导览与步骤                                                                                                           |
| `createGuide.articles`                                     | 可省略                              | 帮助中心文章                                                                                                                 |
| `createGuide.persistence`                                  | `cookie`                            | 也可选 `localStorage` 或 `memory`，用于存放导览进度                                                                          |
| `createGuide.persistKey`                                   | `hai-guide`                         | 导览进度键前缀。同源部署多个应用时分别配置                                                                                   |
| `createGuide.nav`                                          | 可省略                              | 应用自带的路由导航适配器                                                                                                     |
| `createGuide.waitTimeout`                                  | `3000`                              | 等待每个导览目标 DOM 元素的毫秒数                                                                                            |
| `AuthPanel.config`、`actions`                              | 由应用传入                          | `config` 决定页面显示哪些选项，可用 [IAM 接口返回的设置](../data/api-contract.md#public-settings)。`actions` 接收点击登录或注册时调用的函数 |
| CRUD `resource`、`controller options`                      | 资源和 API 回调由应用提供           | 配置字段展示、表单、分页和加载行为，例如 `autoLoad: false` 关闭自动加载                                                      |
| 表单、Toast、其他组件 Props                                | 由组件指定                          | 通过组件入参配置布局、回调或时长等控件表现。[页面体验配置](../configuration/experience.md)                                                    |

### 使用与核对

浏览器只保存主题和语言等外观偏好。服务端渲染时，为每次请求创建各自的语言状态。例如一个请求选择中文，另一个请求选择英文，两个页面都应显示各自的语言。手工接入时使用与 CLI 模板兼容的 Tailwind CSS 和 DaisyUI 版本。


## 设计与交互验收

页面设计使用 [hai-ui-design](../../../packages/cli/templates/skills/hai-ui-design/SKILL.md)，组件实现使用 [hai-ui](../../../packages/cli/templates/skills/hai-ui/SKILL.md)，真实界面走查使用 [hai-ui-review](../../../packages/cli/templates/skills/hai-ui-review/SKILL.md)。[设计约定](../../../.agents/instructions/ui-design.md) 说明布局、状态和示例。

Tabs 支持方向键/Home/End、禁用项跳过和单一 Tab 入口；表格提供排序与加载状态和行键盘操作；分页导航/输入名称跟随语言，外部页码同步跳页输入；筛选展开遵循文档焦点顺序，视图按钮提供选中状态。Empty/Alert 支持长内容换行。theme.css 引入共享 tokens，焦点跟随当前主题，global.css 响应减少动态效果。应用仍需接入实际筛选、排序、分页与失败恢复。


## 错误处理

应用将查询、保存或上传的进度与结果传给组件，例如设置 `loading` 或 `error`。业务接口返回 HaiResult 时，在应用适配层先检查 success，再传入安全本地化文案；UI 工具本身遵循表中的直接返回值，不统一包装 HaiResult。未知异常交给 notifyError/errorMessage 隐藏内部原文。downloadAiDocument 等异步浏览器工具会拒绝 Promise，必须由交互边界捕获并释放 loading。UserProfile.onsubmit 只有返回 true 才结束编辑。

### 错误提示与关联日志

HTTP 错误返回安全本地化文案及追踪编号；ToastContainer 默认只显示可读说明，编号由排查图标展开和复制。响应同时包含 `error.traceId` 和 `X-Trace-Id`。框架复用本次 requestId 作为 traceId，前后端日志自动关联。底层异常、堆栈和操作上下文经凭据脱敏后写入日志，不通过 cause/ext 向用户公开。字段校验只返回本地化的字段名和错误。

服务端把错误发给浏览器之前，可用 `core.error.toPublic(error, traceId)` 去除内部信息。界面需要重新显示错误时，可用 `core.error.formatMessage(error)` 格式化提示，重复调用也只附一次追踪编号。

写服务端日志时传入完整的 Error 对象，保留堆栈和错误原因。数据库操作失败时，可按驱动错误码、表和列定位问题。日志不记录 SQL 原文、参数值或数据库凭据。
