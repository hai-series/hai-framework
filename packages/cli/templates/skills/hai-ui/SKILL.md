---
name: hai-ui
description: 使用 @h-ai/ui 构建多端应用界面，包含三层组件架构（原子/组合/场景）、DaisyUI 样式 + Bits UI headless 交互、移动端组件（SafeArea/BottomNav/PullRefresh/ActionSheet/SwipeCell/InfiniteScroll/AppBar）、Design Token 系统与平台检测；当需求涉及界面、表单、表格、移动端适配或主题切换时使用。
---

# hai-ui

> `@h-ai/ui` 是基于 Svelte 5 Runes 的多端 UI 组件库，采用 DaisyUI v5 + Tailwind CSS v4 + Bits UI v2，支持 32 主题、内置中英文 i18n、自动导入。新增 Design Token 系统和 7 个移动端组件。

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

## 使用步骤

### 1. 配置自动导入

```typescript
// svelte.config.js
import { autoImportHaiUi } from '@h-ai/ui/auto-import'

const config = {
  preprocess: [autoImportHaiUi(), vitePreprocess()],
}
```

### 2. 引入全局样式（移动端必须）

```css
/* src/app.css */
@import '@h-ai/ui/styles/design-tokens.css';   /* Design Token */
@import '@h-ai/ui/styles/mobile.css';   /* 移动端触摸/安全区域优化 */
@import 'tailwindcss';
```

### 3. 平台检测

```typescript
import { detectPlatform, isMobile, isNativeApp, usePlatform } from '@h-ai/ui'

// 一次性检测
const platform = detectPlatform()   // 'ios' | 'android' | 'web'
const mobile = isMobile()           // boolean
const native = isNativeApp()        // boolean（Capacitor 环境）

// Svelte 5 响应式（组件中使用）
const p = usePlatform()
// p.platform / p.isMobile / p.isNative
```

---

## 三层组件架构

### 原子组件（Primitives，21 个）

| 组件             | Props 要点                                                    | 说明         |
| ---------------- | ------------------------------------------------------------- | ------------ |
| `Button`         | `variant`, `size`, `loading`, `disabled`, `outline`, `circle` | 按钮         |
| `IconButton`     | `icon: string \| Snippet`, `tooltip`, `variant`, `size`       | 图标按钮     |
| `Input`          | `value`, `type`, `size`, `error`, `placeholder`               | 输入框       |
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

### 组合组件（Compounds，25 + 7 移动端）

由原子组件 + Bits UI headless 交互组合。

#### 桌面端组合组件

| 组件             | Props 要点                                                         | 说明                    |
| ---------------- | ------------------------------------------------------------------ | ----------------------- |
| `Form`           | `loading`, `disabled`, `onsubmit`                                  | 表单容器                |
| `FormField`      | `label`, `name`, `error`, `hint`, `required`                       | 表单字段                |
| `Modal`          | `open`, `title`, `size`, `closeOnBackdrop`                         | 模态框                  |
| `Drawer`         | `open`, `position`, `size`                                         | 抽屉                    |
| `DataTable`      | `data`, `columns`, `keyField`, snippet slots                       | 数据表格                |
| `Combobox`       | `options`, `value`, `multiple`, `placeholder`, `error`, `onchange` | 可搜索选择              |
| `Calendar`       | `value`, `minValue`, `maxValue`                                    | 独立日历                |
| `DatePicker`     | `value`, `minValue`, `maxValue`, `error`                           | 日期输入+弹出           |
| `Tabs`           | `items: TabItem[]`, `active`, `type`                               | 标签页                  |
| `Pagination`     | `page`, `total`, `pageSize`, `onchange`                            | 分页                    |
| `Dropdown`       | `items: DropdownItem[]`, `trigger`                                 | 下拉菜单                |
| `Accordion`      | `items: AccordionItem[]`                                           | 折叠面板                |
| `Skeleton`       | `variant`, `count`, `animation`                                    | 骨架屏                  |
| `Empty`          | `title`, `description`, `icon`                                     | 空状态                  |

#### 移动端组合组件（新增 7 个）

| 组件             | Props 要点                                                                  | 说明                     |
| ---------------- | --------------------------------------------------------------------------- | ------------------------ |
| `SafeArea`       | `top`, `bottom`, `left`, `right`                                            | 安全区域容器             |
| `AppBar`         | `title`, `backHref`, `onback`, `fixed`, `transparent`, snippet `left`/`right` | 顶部导航栏             |
| `BottomNav`      | `items: BottomNavItem[]`, `active`                                          | 底部导航栏               |
| `ActionSheet`    | `open`, `title`, `items: ActionSheetItem[]`, `cancelText`, `onselect`       | 底部弹出操作面板         |
| `PullRefresh`    | `refreshing`, `onrefresh`, `threshold`, `pullText`, `releaseText`           | 下拉刷新                 |
| `InfiniteScroll` | `loading`, `finished`, `threshold`, `onload`, `loadingText`, `finishedText` | 无限滚动加载             |
| `SwipeCell`      | `leftActions`, `rightActions: SwipeCellAction[]`, `threshold`               | 滑动操作单元格           |

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

| 组件          | Props 要点                                      | 说明     |
| ------------- | ----------------------------------------------- | -------- |
| `LoginForm`   | `showRememberMe`, `showRegisterLink`, `errors`  | 登录表单 |
| `RegisterForm`| `fields`, `minPasswordLength`, `errors`         | 注册表单 |
| `UserProfile` | `user`, `editable`, `fields`, `avatarUploadUrl` | 用户资料 |

#### Storage 场景组件

| 组件          | Props 要点                                    | 说明     |
| ------------- | --------------------------------------------- | -------- |
| `FileUpload`  | `accept`, `maxSize`, `uploadUrl`, `autoUpload`| 文件上传 |
| `ImageUpload` | `value`, `uploadUrl`, `aspectRatio`           | 图片上传 |
| `FileList`    | `files: FileItem[]`, `layout`, `showPreview`  | 文件列表 |

---

## Design Token 系统

CSS 自定义属性统一管理设计变量：

```css
/* design-tokens.css 提供的 Token */
--hai-spacing-xs: 4px;
--hai-spacing-sm: 8px;
--hai-spacing-md: 16px;
--hai-spacing-lg: 24px;

--hai-radius-sm: 4px;
--hai-radius-md: 8px;
--hai-radius-lg: 12px;

--hai-font-size-xs: 12px;
--hai-font-size-sm: 14px;
--hai-font-size-base: 16px;

--hai-touch-target-min: 44px;         /* 最小触摸目标 */
--hai-safe-area-top: env(safe-area-inset-top);
--hai-safe-area-bottom: env(safe-area-inset-bottom);

--hai-z-dropdown: 1000;
--hai-z-modal: 2000;
--hai-z-toast: 3000;

--hai-transition-fast: 150ms ease;
--hai-transition-normal: 250ms ease;
```

### mobile.css 提供的全局类

| 类名                     | 用途                           |
| ------------------------ | ------------------------------ |
| `.hai-safe-top`          | 上方安全区域 padding           |
| `.hai-safe-bottom`       | 下方安全区域 padding           |
| `.hai-safe-all`          | 四周安全区域 padding           |
| `.hai-scroll-container`  | 优化的滚动容器（momentum 滚动）|
| `.hai-keyboard-aware`    | 虚拟键盘弹起时自动调整内容     |

---

## 主题系统

支持 32 个 DaisyUI 主题。

```typescript
import { applyTheme, getCurrentTheme } from '@h-ai/ui'

applyTheme('dark')
const theme = getCurrentTheme()
```

---

## 重要约定

1. **Svelte 5 Runes**：使用 `$state`、`$derived`、`$effect`
2. **Snippet 插槽**：使用 `{#snippet name()}...{/snippet}` 语法
3. **三层依赖红线**：primitives 不依赖上层，compounds 只依赖 primitives + Bits UI，scenes 可依赖两者
4. **自动导入例外**：`toast`、类型导入、`Range`/`FileList` 必须显式 `import`
5. **Combobox 统一单选/多选**：`MultiSelect` 已删除
6. **移动端样式**：务必引入 `design-tokens.css` + `mobile.css`，使用 SafeArea 包裹原生 App 页面

---

## 相关 Skills

- `hai-build`：项目架构与技能导航
- `hai-kit`：SvelteKit 集成
- `hai-iam`：IAM 模块 API（与 LoginForm/RegisterForm 配合）
- `hai-capacitor`：原生 App 开发（与 SafeArea/AppBar 配合）
- `hai-api-client`：客户端数据获取
