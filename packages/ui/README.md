# @h-ai/ui

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/core](../core/README.md)

## 简介

基于 Svelte 5 Runes 的多端 UI 组件库，采用 DaisyUI v5 + Tailwind CSS v4 样式 + Bits UI v2 headless 交互，内置 i18n（zh-CN / en-US），内置 15 个精选 DaisyUI 主题。

## 核心功能清单

- 表单、表格、弹窗、导航、图表与业务场景组件。
- 认证、CRUD、AI 内容展示、新手引导和帮助中心。
- Svelte 5、主题切换、响应式布局及中英文组件文案。

## 使用入门

### 安装

```bash
npm install @h-ai/ui @h-ai/core
```

Node 服务端工程将 UI 与 core 都列为生产依赖，确保适配器保留 core 的日志和原生依赖加载。

### 快速开始

#### 1. 配置 svelte.config.js

```js
import { autoImportHaiUi } from '@h-ai/ui/auto-import'
import adapter from '@sveltejs/adapter-node'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: [autoImportHaiUi(), vitePreprocess()],
  compilerOptions: { runes: true },
  kit: { adapter: adapter() },
}

export default config
```

#### 2. 配置 vite.config.ts

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
  ssr: { noExternal: ['@h-ai/ui', '@h-ai/kit'], external: ['@h-ai/core', 'sm-crypto'] },
})
```

使用 Crypto 或依赖它的 Kit/IAM 时，应用生产依赖需包含 `sm-crypto@0.5.7`。CLI 已配好这一项；手工接入时运行 `pnpm add sm-crypto@0.5.7`。仅设置 external 不够，adapter-node 还需要这项直接依赖声明才能保留原包加载。

#### 3. 配置 src/app.css

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

#### 4. 使用组件

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

管理后台等只使用部分组件的页面，可直接使用公开组件目录入口；主题工具通过轻量 `@h-ai/ui/theme` 导入，避免主题消费加载根入口中的 AI、图表等组件。状态层的语言工具使用 `@h-ai/ui/i18n`，不加载组件与引导 CSS。组件路径以已安装版本的 exports 为准，不导入包内 `src/` 或 `dist/`。

自动导入器识别无分号、跨行及带别名的显式导入，已绑定的组件名称不会重复注入；仅类型导入不会替代运行时组件。

```ts
import { Card } from '@h-ai/ui/components/compounds/index'
import { Button } from '@h-ai/ui/components/primitives/index'
import { getThemeInfo, THEMES } from '@h-ai/ui/theme'
```

#### data-* 属性透传

公开 Svelte 组件支持把调用方传入的 `data-*` 属性透传到组件根节点或主交互节点，便于测试选择器、埋点和自动化标记。普通未知属性不会被透传。

```svelte
<Button data-testid='save-button' data-analytics-id='settings.save'>保存</Button>
<Input data-testid='username-input' bind:value={username} />
<Modal data-testid='confirm-modal' bind:open={open}>...</Modal>
```

无需再为了 `data-testid` 单独封装按钮、输入框或弹层组件。

### 组件架构

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

### 组件清单

#### 原子组件 Primitives（20 个）

| 组件             | 描述         | 主要属性                                                           |
| ---------------- | ------------ | ------------------------------------------------------------------ |
| `Button`         | 按钮         | `variant`, `size`, `loading`, `disabled`, `outline`, `circle`      |
| `IconButton`     | 图标按钮     | `icon: trusted SVG string \| Snippet`, `variant`, `size`, `tooltip`, `loading` |
| `BareButton`     | 无样式按钮   | `class`, `ariaLabel`, `role`, `tabindex`                           |
| `Input`          | 输入框       | `type`, `value`, `size`, `error`, `validationMessage`              |
| `BareInput`      | 无样式输入框 | `type`, `class`, `accept`, `multiple`                              |
| `Textarea`       | 文本域       | `value`, `rows`, `size`, `autoResize`, `error`                     |
| `Select`         | 下拉选择     | `options`, `value`, `placeholder`, `size`, `clearable`, `filterable` |
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

`BareInput` 的 `file` 类型通过 `onchange` 读取 `event.currentTarget.files`，不绑定文件路径 `value`；其他输入类型可使用 `bind:value`。

#### 组合组件 Compounds（37 个）

##### 表单

| 组件        | 描述     | 主要属性                                     |
| ----------- | -------- | -------------------------------------------- |
| `Form`      | 表单容器 | `columns`, `labelPosition`, `labelWidth`, `loading`, `disabled`, `onsubmit`            |
| `FormField` | 表单字段 | `label`, `for`, `colSpan`, `labelPosition`, `error`, `hint`, `required`         |
| `FormLayout` | 表单布局 | `columns`, `labelPosition`, `labelWidth` |
| `TagInput`  | 标签输入 | `tags`, `maxTags`, `allowDuplicates`, `size` |

##### 表单布局与校验

`Form` 和可嵌入原生 `<form>` 的 `FormLayout` 共用 `columns={1 | 2}`、`labelPosition="top" | "left"`、`labelWidth`（默认 `8rem`）。默认单列、标签独立成行；双列在容器不足 `36rem` 时收为单列，同行标签在容器不足 `28rem` 时改为上下排列。

`FormField.colSpan` 默认 `'auto'`：多行文本、文件/图片上传、TagInput 和多选 Combobox 自动占两列；`1` / `2` 显式覆盖。自定义宽控件标注 `data-form-wide`。标题、错误摘要、按钮及其他非 FormField 内容自动独占一行。字段可单独覆盖 `labelPosition` / `labelWidth`。

标签自动关联内部 UI 控件；已有控件 ID 或原生控件使用 `<FormField for="control-id">`。错误/提示通过 `aria-describedby` 关联，错误控件带 `aria-invalid`，只显示一份字段提示。`label` / `error` / `hint` 支持字符串或延迟翻译函数。

`Input`、`Textarea`、`Select` 和 `PasswordInput` 的原生校验使用内置中英文提示；`validationMessage` 只覆盖失败提示，不让有效输入一直无效。应用通过 UI 的 `setGlobalLocale` / `createLocaleStore` 同步语言，已显示的校验错误即时更新。`Textarea` 支持 `minlength` / `maxlength`，`Select` 支持 `name`、必填校验和 FormData 序列化。

字段首次失焦后显示前端校验错误，修正输入时即时更新；未访问的字段在提交时统一校验。CRUD 新增/编辑复用该行为，支持自定义校验文案，关闭重开清空校验状态。`Select` 在焦点离开触发器和选项后校验。`PasswordInput.minLength` 同时约束长度并用于强度计算；省略时不限制登录密码长度，强度计算仍以 8 位为基准。

`UserProfile.fieldConstraints` 按字段接收 `required`、`minlength`、`maxlength`、`pattern` 和 `validationMessage`（`pattern` 用于单行输入），让应用的用户名等业务规则复用失焦校验；`validationMessage` 支持延迟翻译函数。

`LoginForm`、`RegisterForm`、`ChangePasswordForm`、`ForgotPasswordForm`、`ResetPasswordForm`、`AuthPanel`、`UserProfile` 和 `FeedbackModal` 接受同一组布局参数。`CrudPage` 通过 `form` 传入；`CrudEditPanel` 直接接收。CRUD 字段支持 `colSpan`，`validation.message` 支持翻译函数；按钮与回车均先校验，修正后错误消失，客户端校验不能替代服务端校验。

```svelte
<!-- m、save、name、notes 为应用自己的翻译、提交回调和状态 -->
<Form columns={2} labelPosition="left" labelWidth="6rem" onsubmit={save}>
  <FormField label={() => m.name()} required>
    <Input name="name" bind:value={name} required />
  </FormField>
  <FormField label={() => m.notes()}>
    <Textarea name="notes" bind:value={notes} />
  </FormField>
  <Button type="submit">{m.save()}</Button>
</Form>
```

##### 反馈

| 组件             | 描述     | 主要属性                          |
| ---------------- | -------- | --------------------------------- |
| `Alert`          | 警告框   | `variant`, `title`, `dismissible` |
| `ToastContainer` | 通知容器 | 全局放置，配合 `toast` 单例使用   |

##### 弹层

| 组件      | 描述   | 主要属性                                                |
| --------- | ------ | ------------------------------------------------------- |
| `Modal`   | 模态框（语义标签、焦点约束与恢复） | `open`, `title`, `size`, `radius`, `bodyOverflow`, `showClose` |
| `Drawer`  | 抽屉   | `open`, `position`, `title`, `size`, `width`, `resizable`, `widthStorageKey` |
| `Confirm` | 确认框 | `open`, `title`, `message`, `variant`, `onconfirm`      |
| `Popover` | 弹出层 | `open`, `position`, `trigger`, `offset`, `portal`       |

##### 数据展示

| 组件        | 描述     | 主要属性                                 |
| ----------- | -------- | ---------------------------------------- |
| `Card`      | 卡片容器 | `title`, `bordered`, `shadow`, `padding` |
| `DataTable` | 数据表格 | `data`, `columns`, `keyField`, `loading`, `sortKey`, `sortDir`, `onsort`，`cell` 单元格插槽、`onrowclick`（列 `sortable` 可排序） |
| `Accordion` | 手风琴   | `items: AccordionItem[]`                 |
| `Timeline`  | 时间线   | `items: TimelineItem[]`                  |

##### Bits UI headless 交互

| 组件         | 描述                        | 主要属性                                                    |
| ------------ | --------------------------- | ----------------------------------------------------------- |
| `Combobox`   | 可搜索下拉选择（单选/多选） | `options`, `value`, `multiple`, `placeholder`, `size`       |
| `Calendar`   | 独立日历                    | `value: DateValue`, `minValue`, `maxValue`                  |
| `DatePicker` | 日期输入+弹出               | `value: DateValue`, `minValue`, `maxValue`, `error`, `size` |

> 日期值使用 `@internationalized/date` 的 `DateValue` / `CalendarDate` 类型。

##### 移动端 / 增强交互

| 组件             | 描述         | 主要属性                                            |
| ---------------- | ------------ | --------------------------------------------------- |
| `ActionSheet`    | 底部操作面板 | `open`, `title`, `items`, `cancelText`, `onselect`  |
| `AppBar`         | 顶部导航栏   | `title`, `backHref`, `onback`, `fixed`, `safeArea`  |
| `BottomNav`      | 底部导航栏   | `items`, `active`, `centered`, `maxWidth`           |
| `InfiniteScroll` | 无限滚动     | `loading`, `finished`, `threshold`, `onload`        |
| `PullRefresh`    | 下拉刷新     | `refreshing`, `threshold`, `onrefresh`              |
| `SafeArea`       | 安全区域容器 | `top`, `bottom`, `left`, `right`                    |
| `SwipeCell`      | 滑动操作单元 | `leftActions`, `rightActions`, `threshold`, `onaction` |

##### 导航

| 组件         | 描述     | 主要属性                                     |
| ------------ | -------- | -------------------------------------------- |
| `Tabs`       | 标签页   | `items`, `active`, `type`, `size`, `lazy`, `onactivate` |
| `Pagination` | 分页（统一 table 风格） | `page`, `total`, `pageSize`, `showTotal`, `showJumper`, `showSizeChanger`, `showPageInfo`, `showFirstLast` |
| `Breadcrumb` | 面包屑   | `items`, `separator`                         |
| `Steps`      | 步骤条   | `items`, `current`, `direction`, `clickable` |
| `Dropdown`   | 下拉菜单 | `items`, `trigger`, `triggerClass`, `position` |
| `Tooltip`    | 提示     | `content`, `position`, `delay`               |

##### 状态占位

| 组件       | 描述   | 主要属性                              |
| ---------- | ------ | ------------------------------------- |
| `Skeleton` | 骨架屏 | `variant`, `width`, `height`, `count` |
| `Empty`    | 空状态 | `title`, `description`, `icon`        |
| `Result`   | 结果页 | `status`, `title`, `description`      |

##### 页面级

| 组件         | 描述     | 主要属性                                    |
| ------------ | -------- | ------------------------------------------- |
| `PageHeader` | 页面头部 | `title`, `description`，支持 `actions` 插槽 |

#### 场景组件 Scenes（36 个）

##### Guide 引导与帮助（2 个）

| 组件 | 描述 | 主要属性 |
| --- | --- | --- |
| `GuideHost` | 首次邀请、页面导览与帮助弹窗宿主 | `guide`, `locale`, `scope`, `autoStart` |
| `HelpCenter` | 可独立使用的帮助中心 | `articles`, `tours`, `locale`, `selectedId`, `onstart` |

##### App 应用级（7 个）

| 组件             | 描述             | 主要属性           |
| ---------------- | ---------------- | ------------------ |
| `FeedbackModal`  | 反馈模态框       | `open`, `onsubmit` |
| `SettingsModal`  | 设置模态框       | `open`, `onclose`  |
| `SettingsLayout` | 设置页布局（分区导航 + 内容区） | `title`, `description`, `sections`, `active`, `onselect` |
| `LanguageSwitch` | 语言切换         | 无需 Props         |
| `ThemeColorPicker` | 主题色选择器   | `value`, `presets`, `onchange` |
| `ThemeSelector`  | 完整主题选择面板 | 无需 Props         |
| `ThemeToggle`    | 明/暗主题切换    | 无需 Props         |

##### IAM 身份认证（10 个）

| 组件                 | 描述       | 主要属性                                              |
| -------------------- | ---------- | ----------------------------------------------------- |
| `AuthPanel`          | 配置驱动认证页 | `config`, `actions`, `loginHeader/loginFields/loginFooter`, `registerHeader/registerFields/registerFooter` |
| `AuthShell`          | 认证页布局（居中卡片 / 左右分栏） | `variant`, `title`, `subtitle`, `brandTitle`, `brandText`, `illustration`, `description`, `highlights` |
| `LoginForm`          | 登录表单   | `loading`, `errors`, `showRememberMe`, `onsubmit`     |
| `RegisterForm`       | 注册表单   | `loading`, `errors`, `fields`, `onsubmit`             |
| `ForgotPasswordForm` | 忘记密码   | `mode`, `loading`, `errors`, `onsubmit`               |
| `ResetPasswordForm`  | 重置密码   | `loading`, `errors`, `showCode`, `onsubmit`           |
| `ChangePasswordForm` | 修改密码   | `loading`, `errors`, `requireOldPassword`, `onsubmit` |
| `PasswordInput`      | 密码输入框 | `value`, `showToggle`, `showStrength`, `minLength`    |
| `PermGuard`          | 权限守卫   | `permissions`, `mode`, `fallback`                     |
| `UserProfile`        | 用户资料   | `user`, `editable`, `fields`, `avatarAccept`, `avatarHint`, `onsubmit` |

##### Storage 存储（4 个）

| 组件           | 描述     | 主要属性                                                 |
| -------------- | -------- | -------------------------------------------------------- |
| `FileUpload`   | 文件上传 | `accept`, `maxSize`, `maxFiles`, `multiple`, `uploadHandler` |
| `ImageUpload`  | 图片上传 | `value`, `accept`, `maxSize`, `aspectRatio`, `uploadHandler` |
| `AvatarUpload` | 头像上传 | `value`, `size`, `maxSize`, `fallback`, `uploadHandler`      |
| `FileList`     | 文件列表 | `files`, `layout`, `showDelete`, `showDownload`          |

上传组件不内置 presign、请求头或 PUT/POST 协议。应用层通过 `uploadHandler(file, { signal, onProgress })` 调用自己的 service，并返回 `{ url?, response? }`；图片和头像上传需要返回可展示的 `url`。未提供 handler 时，`FileUpload` 只选择文件，图片/头像组件只生成本地预览。

##### Crypto 加密展示（3 个）

输入变化立即清空 `encryptedValue`，只有当前输入的成功结果会回填；清空、回调替换和卸载均使旧请求失效。失败显示内置错误提示且密文保持为空；表单应仅在当前密文非空时提交需要加密的输入。

`EncryptedInput` 必须由调用方通过 `onencrypt` 接入真实加密服务，`algorithm` 仅用于说明该服务所用算法。未配置回调时组件明确提示不可用，不生成密文；没有 Base64 等编码回退。

| 组件               | 描述     | 主要属性                                                |
| ------------------ | -------- | ------------------------------------------------------- |
| `EncryptedInput`   | 加密输入 | `value`, `encryptedValue`, `algorithm`, `showEncrypted` |
| `HashDisplay`      | 哈希展示 | `value`, `algorithm`, `copyable`, `truncate`            |
| `SignatureDisplay` | 签名展示 | `signature`, `publicKey`, `algorithm`, `verified`       |

默认算法与 `@h-ai/crypto` 对齐：加密输入使用 `SM4`，哈希展示使用 `SM3`，签名展示使用 `SM2`。

##### AI 文档与表格（4 个）

| 组件                     | 描述             | 主要属性 / 能力 |
| ------------------------ | ---------------- | ---------------- |
| `MarkdownRenderer`       | Markdown 渲染器  | `content`, `fontSize`, `allowHtmlTags`, `showCopyButton`, `enableHighlight` |
| `AiDocumentDownloadMenu` | 文档下载菜单     | `actions`, `ondownload` |
| `AiDocumentEditor`       | AI 文档编辑器    | `content`, `fontSize`, `allowHtmlTags`, `showRunButton`, `showCodePreviewToggle`, `allowUnsafeCodePreview` |
| `AiTableEditor`          | AI 表格编辑器    | `columns`, `rows`, `editable`, `ondownload` |

> `AiDocumentEditor` 默认只允许 Markdown 内置预览。HTML / JS / CSS 等高风险预览需要显式设置 `allowUnsafeCodePreview`，或通过 `oncoderun` 返回受控的预览结果。
>
> Mermaid 图表开箱即用：文档（`sourceKind='document'`）里的 ```` ```mermaid ```` 代码块在阅读态自动渲染为图表；code 模式（`sourceKind='code'` + `showCodePreviewToggle`）下可在「代码 / 预览」间切换。Mermaid 以 `securityLevel: 'strict'` 渲染为消毒后的 SVG，无需开启 `allowUnsafeCodePreview`。
>
> `MarkdownRenderer` 与 `AiDocumentEditor` 还支持展示层配置：
> - `fontSize` 支持 `number`（按 px 解释）或任意 CSS 长度字符串（如 `1.125rem`）
> - `allowHtmlTags` 默认关闭；开启后会按安全白名单解析 `<b>` / `<i>` / `<u>` / `<mark>` 等 HTML 标签，危险标签与属性仍会被消毒

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

##### Charts 图表

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

##### CRUD 场景（5 个）

| 组件                 | 描述         | 主要属性 / 能力 |
| -------------------- | ------------ | ---------------- |
| `CrudPage`           | CRUD 主页面  | `crud`, `data`, `permissions`, `form`, `pagination`, `density`, `detailColumns`, `showHeader`, `toolbarStyle`, `toolbarLeading`, `toolbarActions`, `card`, `tableCell`, `onrowclick`, `sortableColumns`, `nav`, `loading`, `loaded`, `error`, `onRetry`, `keepPreviousData` |
| `CrudFilterBar`      | 过滤工具栏（搜索 + 多类型过滤 + 重置） | `filterFields`, `searchValue`, `onsearch`, `onfilterchange`, `onreset` |
| `CrudDetailPanel`    | 详情面板（抽屉/弹窗） | `open`, `item`, `fields`, `variant`, `drawerWidth`, `modalSize` |
| `CrudEditPanel`      | 编辑面板（抽屉/弹窗） | `open`, `fields`, `variant`, `drawerWidth`, `modalSize`, `onsubmit` |
| `CrudDeleteConfirm`  | 删除确认框   | `open`, `loading`, `onconfirm` |

> `CrudPage` 默认使用 `TableToolbar` 图标弹层工具栏，也可通过 `toolbarStyle='filter-bar'` 切回平铺筛选栏；`detailColumns={['title']}` 可把标题等指定列绑定为详情入口；`toolbarLeading` 用于注入左侧标题或说明，配合 `showHeader={false}` 可避免重复标题；`toolbarActions` 注入右侧业务操作，`card` 插槽可将列表项替换为卡片视图，`tableCell` 可按行和列 key 渲染交互式单元格内容（例如 Tooltip），`sortableColumns` 控制服务端排序字段。过滤工具栏支持 `select`、`boolean`、`number`、`date`、`date-range`、`text`。
>
> 页面根容器会占满父级可用高度。表格无论是否有数据都会撑满剩余空间，仅数据区域滚动；表头固定在数据区顶部，分页栏固定在列表卡片底部。
>
> 表格列会优先压缩到 7rem 并截断超长文本；列总宽度仍超过容器时才显示横向滚动条。操作列固定在右侧，横向滚动时保持可见。

##### 错误页场景（1 个）

| 组件        | 描述         | 主要属性 / 能力 |
| ----------- | ------------ | ---------------- |
| `ErrorPage` | 通用错误页（内置 401/403/404/500/503 预设） | `status`, `code`, `title`, `description`, `homeUrl`, `onhome`, `onback` |

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
> ```svelte
> <script>
>   import { CrudPage, createCrudController, defineCrud } from '@h-ai/ui'
>   const crud = defineCrud({ name: 'user', label: '用户', fields: [/* ... */], api: { list: params => listUsers(params) } })
>   const c = createCrudController(crud) // 惰性页签传 { autoLoad: false }，首次激活时 c.load()
> </script>
> <CrudPage {crud} data={c.data} nav={c.nav} loading={c.loading} loaded={c.loaded} error={c.error} onRetry={c.reload} />
> ```
>
> `Tabs` 支持惰性页签：`lazy` 开启后未激活过的页签内容不渲染（`children` 提供 `isActivated(key)` 判断），`onactivate(key)` 在页签首次激活时触发一次，适合配合 `createCrudController({ autoLoad: false })` 在首次可见时才加载。

### 使用示例

#### Toast 通知

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

> 已内置 `notifySuccess` / `notifyError` / `notifyInfo` / `notifyWarning` 封装，业务应用无需自建 toast 工具文件：`notifyError(err, fallback?)` 接受 `Error` 或字符串并内置兑底文案，默认成功 3s / 失败 5s。

#### Message 消息提示

```svelte
<script>
  import { message, MessageContainer } from '@h-ai/ui'

  function showMessage() {
    message.success('操作成功')
    message.error('操作失败')
    message.warning('请注意')
    message.info('提示信息', 5000)
  }
</script>

<button onclick={showMessage}>消息</button>
<MessageContainer />
```

#### 典型 CRUD 页面

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

#### 声明式 CRUD 页面（CrudPage）

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
  form={{ variant: 'modal', modalSize: '3xl', columns: 2, labelPosition: 'top' }}
  pagination={{ showSizeChanger: true, showJumper: true, pageSizeOptions: [10, 20, 50] }}
  density='compact'
  detailColumns={['name']}
  sortableColumns={[{ key: 'createdAt', label: '创建时间' }]}
  {nav}
/>
```

> 抽屉形式可改用 `form={{ variant: 'drawer', drawerWidth: '40rem' }}`；用户拖动后的宽度会覆盖初始宽度并按资源记忆。

#### 登录页面

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

#### PasswordInput 受控模式

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

### 样式依赖

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

#### 图标

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

#### 主题切换

使用内置的主题工具函数管理 15 个精选 DaisyUI 主题：

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
  THEMES, // ThemeInfo[] — 15 个精选主题元数据
} from '@h-ai/ui/theme'
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
import { createThemeBootstrapScript, DEFAULT_THEME_COLOR_CSS_VAR } from '@h-ai/ui/theme'

const themeBootstrapScript = createThemeBootstrapScript({
  storageKey: 'hai-demo-preferences',
  legacyThemeStorageKey: 'hai-demo-theme',
  defaultThemeColor: '#5765f0',
  colorCssVar: DEFAULT_THEME_COLOR_CSS_VAR,
})

transformPageChunk: ({ html }) => html.replace('%theme_bootstrap%', themeBootstrapScript)
```

### 国际化 (i18n)

@h-ai/ui 采用**组件内置翻译**模式：

- 场景组件（`scenes/`）内置中英文翻译（zh-CN / en-US），开箱即用
- 组件自动响应全局 locale 变化（通过 `@h-ai/core` 同步）
- 应用层只需处理**页面级文本**，组件内部文本由 @h-ai/ui 统一管理
- 如需覆盖特定文本，通过 `submitText`、`labels` 等 props 传入

### 配置驱动认证页面

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



AuthPanel 直接接收 IAM 白名单配置和 actions，内置登录（密码/LDAP/邮件/短信）、注册、找回、重置及协议展示。使用 `config.ui` 配置卡片/分栏、标题、品牌、Logo 和配图。`LoginForm` 提供 methods、onsendotp、otpLength、resendInterval；密码表单接受 passwordPolicy。组件只渲染与交互，网络和 Token 存储通过 actions 注入。认证场景按公开 IAM 错误码显示当前 UI 语言的提示，应用自定义错误保留原文。

AuthPanel 在 SSR 阶段禁用原生表单控件，客户端挂载并绑定事件后自动开放输入，避免接管时丢失早到的输入。应用无需额外的就绪适配；E2E 等待控件可编辑，并覆盖客户端脚本延迟加载的场景。

认证链接指向当前完整 URL 时，AuthPanel 只切换场景并阻止重复导航，返回登录后可立即输入。路径、查询串或 hash 不同时交给应用路由处理；Ctrl/Cmd 等修改键点击保留浏览器行为。

[完整 IAM 配置 / IAM configuration](../iam/README.md)

#### createLocaleStore

用于客户端 locale 状态管理，自动同步到 `@h-ai/core` 全局 locale 管理器：

```svelte
<script>
  import { createLocaleStore, setGlobalLocale } from '@h-ai/ui/i18n'
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

#### 导出的 i18n 工具

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


协议在 Modal 内显示并保留表单输入；使用 URL 时，协议页面须允许 iframe 嵌入，组件禁用其脚本，另提供新窗口查看入口。登录/注册表单使用 `header/extraFields/footer` snippet，AuthPanel 透传 `loginHeader/loginFields/loginFooter` 和 `registerHeader/registerFields/registerFooter`，底部保留内置导航。自定义字段由应用绑定状态和提交，不会隐式写入 IAM 用户模型。

```svelte
<!-- config 来自 IAM 公开配置，actions 来自 Kit/API client；m 为应用翻译。 -->
<AuthPanel {config} {actions}>
  {#snippet loginHeader()}
    <p>{m.loginHelp()}</p>
  {/snippet}
  {#snippet registerFields()}
    <label><input type='checkbox' bind:checked={subscribe} />{m.subscribe()}</label>
  {/snippet}
</AuthPanel>
```

上例的 subscribe 为应用自身的 $state，应用包装 register 动作校验/提交扩展业务数据；如需单独组合表单，使用 `<RegisterForm> {#snippet extraFields()}...{/snippet} </RegisterForm>`。扩展里的按钮须为 `type="button"`，避免误提交。

### 新手引导与帮助中心

`@h-ai/ui/guide` 提供 `createGuide`、`GuideHost`、`HelpCenter` 和相关类型。无需 init/close；引擎在开始导览时按需加载，浮层复用当前主题。组件内置中英文按钮、进度和错误提示，业务内容使用应用 i18n。

同一入口的 `resolveGuideText(text?)` 可解析字符串或 i18n 回调；宿主组件已自动解析文案。

下例放在应用布局中；`nav` 是应用现有 NavAdapter，`locale`、`user` 与翻译函数 `m` 来自应用，翻译 key 需在应用消息中定义。目标按钮放在 `/users` 页面。

```svelte
<script lang='ts'>
  import { createGuide, GuideHost } from '@h-ai/ui/guide'

  const guide = createGuide({
    nav,
    persistKey: 'my-app-guide',
    tours: [{
      id: 'users',
      version: 1,
      route: '/users',
      title: () => m.guide_users_title(),
      description: () => m.guide_users_description(),
      steps: [{
        target: 'users-create',
        title: () => m.guide_create_title(),
        description: () => m.guide_create_description(),
      }],
    }],
    articles: [{
      id: 'users-help',
      title: () => m.guide_users_title(),
      content: () => m.guide_users_markdown(),
      tourId: 'users',
    }],
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
- 通过已有 NavAdapter 接入 SvelteKit、SPA 或原生 WebView；默认完整导航使用 sessionStorage 保存短期启动记录。宿主只在浏览器挂载后读取记录，SSR 实例不得跨用户共享。
- 目标等待默认 3000ms，可用 waitTimeout 调整。before(signal) 可展开页签/抽屉；必要元素缺失停止，可选步骤使用 optional 跳过。引导不会自动提交业务表单。
- 业务文案用函数延迟求值，并传入当前 locale。步骤内容按纯文本显示；帮助正文复用安全 MarkdownRenderer，原始 HTML 关闭。
- HelpCenter 可独立放入帮助页面，props 为 articles、tours（可选）、locale、selectedId 和 onstart；支持类别标签、标题/正文搜索和关联导览。

admin-console 示例和 CLI fullstack Web/App/Desktop 默认包含帮助入口、首次邀请及个人资料导览。完整配置和验证场景见 [引导指南](../cli/templates/skills/hai-ui/guide.md)。

### 其他导出

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


### 请求语言隔离

Node 请求与 SSR 使用 `core.i18n.runWithLocale(locale, () => handleRequest())`；SvelteKit 可使用 `kit.i18n.runWithLocale(locale, () => resolve(event))`，serv 自动按请求头建立上下文。异步子任务继承请求语言，优先级为显式 `MessageOptions.locale`、请求语言、进程启动默认语言。`setGlobalLocale` 在请求上下文中只更新当前请求；上下文外仅用于启动默认值，不能在请求 hook 中调用它修改默认值。

浏览器继续使用应用级 `setGlobalLocale` / `createLocaleStore`。SSR 的 UI store 初始化和 setter 只修改自身状态，不写全局语言；UI 消息从请求上下文读取。`runWithLocale` 仅支持 Node 入口，浏览器通过显式 locale 或应用状态翻译。

## 开发测试

```sh
pnpm --filter @h-ai/ui typecheck
pnpm --filter @h-ai/ui lint
pnpm --filter @h-ai/ui build
pnpm --filter @h-ai/ui test
```

## 许可证

Apache-2.0

`@h-ai/ui/i18n` 的 `createLocaleStore` 按“可解析的持久化值 → 完整 navigator.languages（再检查 navigator.language）→ defaultLocale → 支持列表首项”选择语言；首个不支持的候选不触发默认回退。匹配大小写、语言简写及逐级区域/脚本回退，返回 supportedLocales 中的配置代码；同语言多个变体按列表顺序选择。detectBrowserLocale 无实际命中返回 null，不插入框架默认值；空支持列表最终保留调用方默认值。SSR 不读取浏览器候选或修改全局语言。应用若使用 Paraglide，仍需用该项目的 setLocale 同步应用翻译；内置 UI 字典的覆盖范围不因自定义 store 列表而自动增加。

## 输入约束与 HTTP 能力

存储 key 按 UTF-8 最多 1024 字节，并拒绝绝对路径、反斜线、控制字符及点路径段；公开 HTTP 批量删除每次 1–1000 项。`@h-ai/storage/schemas` 提供浏览器安全的共同规则。预签名有效期为整数 1–604800 秒（Node 默认 3600，HTTP 默认 900）；HTTP 上传仅接受 key/contentType/expiresIn，不支持 contentLength/maxSize/metadata/checksum。无效输入返回 HTTP 400，typed client 映射 VALIDATION_FAILED。FileUpload 的大小/类型限制仅为前端体验，实际对象须由应用服务端复核。Node 流式读写/checksum/条件写等没有默认 HTTP 端点。完整映射与授权边界见 [存储 API 能力](../../docs/storage-api-capabilities.md)。
