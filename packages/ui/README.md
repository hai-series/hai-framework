# @hai/ui - UI 组件库

> Svelte 5 Runes 组件库，专为管理后台设计

## 安装

```bash
pnpm add @hai/ui
```

## 组件清单

### 基础组件
| 组件       | 描述     | 主要属性                                 |
| ---------- | -------- | ---------------------------------------- |
| `Button`   | 按钮     | `variant`, `size`, `loading`, `disabled` |
| `Input`    | 输入框   | `type`, `label`, `error`, `hint`         |
| `Select`   | 下拉选择 | `options`, `placeholder`                 |
| `Textarea` | 文本域   | `rows`, `maxlength`                      |
| `Checkbox` | 复选框   | `checked`, `label`                       |
| `Switch`   | 开关     | `checked`, `label`                       |

### 数据展示
| 组件            | 描述         | 主要属性                                            |
| --------------- | ------------ | --------------------------------------------------- |
| `Card`          | 卡片容器     | `title`, `padding`, `header`, `footer`, `actions`   |
| `Table`         | 基础表格     | `data`, `columns`                                   |
| `DataTable`     | 数据表格     | `data`, `columns`, `keyField`, `actions`, `loading` |
| `Badge`         | 徽章         | `variant`                                           |
| `Avatar`        | 头像         | `src`, `size`, `alt`                                |
| `Progress`      | 进度条       | `value`, `max`                                      |
| `ScoreBar`      | 分数条       | `value`, `max`, `size`, `showLabel`                 |
| `SeverityBadge` | 严重程度标签 | `type` (critical/high/medium/low), `size`           |

### 导航组件
| 组件         | 描述     | 主要属性                                |
| ------------ | -------- | --------------------------------------- |
| `Breadcrumb` | 面包屑   | `items`                                 |
| `Tabs`       | 标签页   | `items`, `activeIndex`                  |
| `Pagination` | 分页     | `currentPage`, `totalPages`, `onchange` |
| `Dropdown`   | 下拉菜单 | `items`, `trigger`                      |

### 反馈组件
| 组件             | 描述     | 主要属性                                      |
| ---------------- | -------- | --------------------------------------------- |
| `Modal`          | 模态框   | `open`, `title`, `size`, `closable`, `footer` |
| `Drawer`         | 抽屉     | `open`, `position`, `title`                   |
| `Alert`          | 警告框   | `variant`, `closable`                         |
| `Toast`          | 通知消息 | `messages`, `ondismiss`                       |
| `ToastContainer` | 通知容器 | 全局使用                                      |
| `Tooltip`        | 提示     | `content`, `position`                         |
| `Spinner`        | 加载动画 | `size`                                        |

### 业务组件
| 组件            | 描述         | 主要属性                                  |
| --------------- | ------------ | ----------------------------------------- |
| `PageHeader`    | 页面头部     | `title`, `description`, `actions`         |
| `MultiSelect`   | 多选自动补全 | `options`, `selected`, `onchange`         |
| `FeedbackModal` | 反馈模态框   | `open`, `onsubmit`                        |
| `SettingsModal` | 设置模态框   | `open`, `currentLanguage`, `currentTheme` |

### 设置组件
| 组件             | 描述     | 主要属性                                   |
| ---------------- | -------- | ------------------------------------------ |
| `LanguageSwitch` | 语言切换 | `currentLanguage`, `languages`, `onchange` |
| `ThemeToggle`    | 主题切换 | `currentTheme`, `onchange`                 |

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

## 图标

组件使用 Iconify (Tabler Icons)，需要安装：

```bash
pnpm add -D @iconify/tailwind @iconify-json/tabler
```

```js
// tailwind.config.js
plugins: [
  require('@iconify/tailwind').addIconSelectors(['tabler']),
]
```
