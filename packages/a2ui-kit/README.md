# @h-ai/a2ui-kit

> **Vue 3** 组件库：渲染 [A2UI](https://a2ui.org/) v0.10 消息，并解析工作流 `outputs`（如 `systemResponse` 双编码）。与 **`@h-ai/ui`（Svelte 5）并列**，技术栈不同，职责不同。

## 与 `@h-ai/ui` 的分工

| 场景                                       | 使用包               | 说明                                                                  |
| ------------------------------------------ | -------------------- | --------------------------------------------------------------------- |
| **Markdown / 富文本** AI 回复              | **`@h-ai/ui`**       | Svelte 组件，如 `MarkdownRenderer`（`scenes/ai`），DaisyUI + 主题一致 |
| **结构化 A2UI**（Card、Table、自研图表等） | **`@h-ai/a2ui-kit`** | Vue 3 + `@vkdevfolio/a2ui-vue`，协议化 UI，适合问数 / 工作流试运行    |

**原则**：同一屏若既要 Markdown 又要 A2UI，可分区渲染（例如左侧 Markdown 区用 Svelte，右侧 A2UI 区用 Vue 子应用或嵌入组件），避免强行把 Vue 组件塞进 Svelte 单文件。

## 依赖

- `vue` ^3.5
- `@vkdevfolio/a2ui-vue` ^0.1.1

## 扩展组件（Table / BarChart / LineChart / PieChart）

本 monorepo 通过 **pnpm patch** 扩展上游 `a2ui-vue`。补丁文件位于：

`packages/a2ui-kit/patches/@vkdevfolio__a2ui-vue@0.1.1.patch`

根目录 `pnpm-workspace.yaml` 中已配置 `patchedDependencies` 指向该路径。安装依赖后自动生效。

消费端 **Vite** 建议将 `@vkdevfolio/a2ui-vue` **alias 到包内 `src`**（否则 `dist` 不含扩展组件），示例：

```text
// vite.config.ts
resolve: {
  alias: {
    '@vkdevfolio/a2ui-vue': fileURLToPath(new URL('./node_modules/@vkdevfolio/a2ui-vue/src/index.ts', import.meta.url)),
  },
},
```

## 安装

```bash
pnpm add @h-ai/a2ui-kit @vkdevfolio/a2ui-vue vue
```

（monorepo 内：`workspace:*` 引用 `@h-ai/a2ui-kit`。）

## 样式

在应用入口引入：

```ts
import '@vkdevfolio/a2ui-vue/dist/a2ui-vue.css'
```

## 导出组件与工具

- **`A2UiWorkflowView`**：`outputs` 或已解析 `messages`（优先 messages）
- **`A2UiMessageView`**：仅纯 A2UI 消息数组，不经 workflow 解析
- **`buildAssistantDisplayFromOutputs`** 等：`parseWorkflowOutputs` 相关 API

## 用法示例

```vue
<script setup lang="ts">
import { A2UiWorkflowView } from '@h-ai/a2ui-kit'

const outputs = { systemResponse: '...' }
</script>

<template>
  <A2UiWorkflowView :outputs="outputs">
    <template #empty>
      无 A2UI 可展示
    </template>
  </A2UiWorkflowView>
</template>
```

纯消息：

```vue
<script setup lang="ts">
import { A2UiMessageView } from '@h-ai/a2ui-kit'
</script>

<template>
  <A2UiMessageView :messages="messages" />
</template>
```

## 提示词与模板

包内模板见 `templates/a2ui-output-spec.md`。

## A2UI 调试页

本包内置一个本地调试台，适合排查两类问题：

- 纯 `A2UI messages` 本身是否符合协议、能否渲染
- `workflow outputs` 是否被 `extractA2UiPayload` / `buildAssistantDisplayFromOutputs` 正确解析

### 启动

```bash
pnpm --filter @h-ai/a2ui-kit dev:demo
```

默认地址：

```txt
http://localhost:5182
```

### 页面能力

- 左侧可切换两种模式：`A2UI messages` / `workflow outputs`
- 可直接粘贴 JSON，也可一键载入预置样例
- 右侧会同时展示：
  - `Parsed Input`
  - `Extracted Messages`
  - `Fallback Text / Error`
  - 最终渲染预览

### 建议调试步骤

1. 先用预置样例确认页面和渲染器本身工作正常。
2. 如果预置样例正常，再粘贴你自己的 JSON，先看 `status` 是否变成“存在问题”。
3. 若是 `messages` 模式报错，重点检查顶层是否是数组，以及每条消息是否是合法 A2UI envelope。
4. 若是 `outputs` 模式无渲染，先看 `Extracted Messages` 是否为空。
5. `Extracted Messages` 为空时，优先检查 `systemResponse` / `systemOutput` / `a2ui` / `a2ui_messages` 这些字段。
6. 如果有 `Fallback Text` 但没有渲染，说明当前输入被识别成普通文本而不是结构化 A2UI。
7. 如果 `Extracted Messages` 有值但预览异常，优先怀疑具体组件协议字段不符合 `a2ui-vue` 的要求。

### 常见排查思路

- 双编码问题：看 `systemResponse` 是否是 `JSON.stringify(messages)` 之后又被包了一层字符串
- Markdown 代码块问题：看返回里是否包了 ```json 代码块
- 顶层结构问题：`messages` 模式必须是数组，`outputs` 模式必须是对象
- 协议问题：消息里要包含 `beginRendering`、`updateComponents` 等合法 envelope

### 验证命令

```bash
pnpm --filter @h-ai/a2ui-kit test
pnpm --filter @h-ai/a2ui-kit typecheck
pnpm --filter @h-ai/a2ui-kit build:demo
```
