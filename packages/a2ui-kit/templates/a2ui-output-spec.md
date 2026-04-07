# A2UI Output Spec (Wenshu)

前端封装包：`@h-ai/a2ui-kit`（`A2UiWorkflowView` / `A2UiMessageView` + `buildAssistantDisplayFromOutputs`），见 `packages/a2ui-kit/README.md`。`@vkdevfolio/a2ui-vue` 扩展补丁位于 `packages/a2ui-kit/patches/`。

## System Prompt

```text
你是一个只输出 A2UI v0.10 消息的 UI 生成器。

# 目标
根据用户问题与数据，返回可渲染的 A2UI 消息数组，用于前端 A2StaticRenderer。

# 严格输出规则
1. 仅输出 JSON（不要 Markdown、不要代码块、不要解释文字）。
2. 顶层必须是数组，元素为 A2UI v0.10 消息对象。
3. 必须包含并按逻辑完整：
   - createSurface
   - updateComponents
   - beginRendering
4. 根节点必须可渲染（例如 Card -> Column -> children.explicitList）。
5. Text 只做文本显示，不作为容器承载 child。
6. 图表组件仅允许：Table / BarChart / LineChart / PieChart。
7. 不要输出未知组件，不要输出空数组，不要输出半截 JSON。
8. 数值必须是 number，不要把数字写成字符串。
9. 若信息不足，仍输出最小可渲染结构，并在 Text 中说明“数据不足”。

# 组件约定
- Table:
  - component: "Table"
  - columns?: string[]
  - rows 或 data: object[]
- BarChart:
  - component: "BarChart"
  - data:
    - 单系列: [{label, value}]
    - 多系列: [{label, 指标A, 指标B, ...}]
- LineChart:
  - component: "LineChart"
  - data 同 BarChart
- PieChart:
  - component: "PieChart"
  - data: [{label, value}]

# 输出风格
优先使用：
Card(root) -> Column(main_col, explicitList) -> Text/Table/BarChart/LineChart/PieChart
```

## Template 1: 纯 A2UI（最小可渲染）

```json
[
  { "version": "v0.10", "createSurface": { "surfaceId": "report", "catalogId": "" } },
  {
    "version": "v0.10",
    "updateComponents": {
      "surfaceId": "report",
      "components": [
        { "id": "root", "component": "Card", "child": "main_col" },
        { "id": "main_col", "component": "Column", "children": { "explicitList": ["title", "summary"] } },
        { "id": "title", "component": "Text", "variant": "h4", "text": "分析结果" },
        { "id": "summary", "component": "Text", "variant": "body", "text": "这是摘要内容。" }
      ]
    }
  },
  { "version": "v0.10", "beginRendering": { "surfaceId": "report", "root": "root" } }
]
```

## Template 2: 仅 Table

```json
[
  { "version": "v0.10", "createSurface": { "surfaceId": "report", "catalogId": "" } },
  {
    "version": "v0.10",
    "updateComponents": {
      "surfaceId": "report",
      "components": [
        { "id": "root", "component": "Card", "child": "main_col" },
        { "id": "main_col", "component": "Column", "children": { "explicitList": ["title", "tbl"] } },
        { "id": "title", "component": "Text", "variant": "h4", "text": "表格模板" },
        {
          "id": "tbl",
          "component": "Table",
          "columns": ["region", "count"],
          "rows": [
            { "region": "华东", "count": 120 },
            { "region": "华北", "count": 80 },
            { "region": "华南", "count": 95 }
          ]
        }
      ]
    }
  },
  { "version": "v0.10", "beginRendering": { "surfaceId": "report", "root": "root" } }
]
```

## Template 3: 仅 BarChart（柱状图）

```json
[
  { "version": "v0.10", "createSurface": { "surfaceId": "report", "catalogId": "" } },
  {
    "version": "v0.10",
    "updateComponents": {
      "surfaceId": "report",
      "components": [
        { "id": "root", "component": "Card", "child": "main_col" },
        { "id": "main_col", "component": "Column", "children": { "explicitList": ["title", "bar"] } },
        { "id": "title", "component": "Text", "variant": "h4", "text": "柱状图模板" },
        {
          "id": "bar",
          "component": "BarChart",
          "data": [
            { "label": "Q1", "待签收": 42, "审理中": 18, "已结案": 12 },
            { "label": "Q2", "待签收": 58, "审理中": 22, "已结案": 16 },
            { "label": "Q3", "待签收": 49, "审理中": 20, "已结案": 14 }
          ]
        }
      ]
    }
  },
  { "version": "v0.10", "beginRendering": { "surfaceId": "report", "root": "root" } }
]
```

## Template 4: 仅 LineChart（折线图）

```json
[
  { "version": "v0.10", "createSurface": { "surfaceId": "report", "catalogId": "" } },
  {
    "version": "v0.10",
    "updateComponents": {
      "surfaceId": "report",
      "components": [
        { "id": "root", "component": "Card", "child": "main_col" },
        { "id": "main_col", "component": "Column", "children": { "explicitList": ["title", "line"] } },
        { "id": "title", "component": "Text", "variant": "h4", "text": "折线图模板" },
        {
          "id": "line",
          "component": "LineChart",
          "data": [
            { "label": "1月", "待签收": 10, "审理中": 26, "已结案": 8 },
            { "label": "2月", "待签收": 22, "审理中": 20, "已结案": 12 },
            { "label": "3月", "待签收": 18, "审理中": 16, "已结案": 10 },
            { "label": "4月", "待签收": 30, "审理中": 24, "已结案": 15 }
          ]
        }
      ]
    }
  },
  { "version": "v0.10", "beginRendering": { "surfaceId": "report", "root": "root" } }
]
```

## Template 5: 仅 PieChart（饼图）

```json
[
  { "version": "v0.10", "createSurface": { "surfaceId": "report", "catalogId": "" } },
  {
    "version": "v0.10",
    "updateComponents": {
      "surfaceId": "report",
      "components": [
        { "id": "root", "component": "Card", "child": "main_col" },
        { "id": "main_col", "component": "Column", "children": { "explicitList": ["title", "pie"] } },
        { "id": "title", "component": "Text", "variant": "h4", "text": "饼图模板" },
        {
          "id": "pie",
          "component": "PieChart",
          "data": [
            { "label": "待签收", "value": 179 },
            { "label": "审理中", "value": 86 },
            { "label": "已结案", "value": 57 }
          ]
        }
      ]
    }
  },
  { "version": "v0.10", "beginRendering": { "surfaceId": "report", "root": "root" } }
]
```

## Template 6: 组合模板（Table + Bar + Line + Pie）

```json
[
  { "version": "v0.10", "createSurface": { "surfaceId": "report", "catalogId": "" } },
  {
    "version": "v0.10",
    "updateComponents": {
      "surfaceId": "report",
      "components": [
        { "id": "root", "component": "Card", "child": "main_col" },
        { "id": "main_col", "component": "Column", "children": { "explicitList": ["title", "tbl", "bar", "line", "pie"] } },
        { "id": "title", "component": "Text", "variant": "h4", "text": "案件统计看板" },

        {
          "id": "tbl",
          "component": "Table",
          "columns": ["region", "待签收", "审理中", "已结案"],
          "rows": [
            { "region": "华东", "待签收": 120, "审理中": 48, "已结案": 36 },
            { "region": "华北", "待签收": 80, "审理中": 32, "已结案": 20 },
            { "region": "华南", "待签收": 95, "审理中": 36, "已结案": 24 }
          ]
        },

        {
          "id": "bar",
          "component": "BarChart",
          "data": [
            { "label": "Q1", "待签收": 42, "审理中": 18, "已结案": 12 },
            { "label": "Q2", "待签收": 58, "审理中": 22, "已结案": 16 },
            { "label": "Q3", "待签收": 49, "审理中": 20, "已结案": 14 }
          ]
        },

        {
          "id": "line",
          "component": "LineChart",
          "data": [
            { "label": "1月", "待签收": 10, "审理中": 26, "已结案": 8 },
            { "label": "2月", "待签收": 22, "审理中": 20, "已结案": 12 },
            { "label": "3月", "待签收": 18, "审理中": 16, "已结案": 10 },
            { "label": "4月", "待签收": 30, "审理中": 24, "已结案": 15 }
          ]
        },

        {
          "id": "pie",
          "component": "PieChart",
          "data": [
            { "label": "待签收", "value": 179 },
            { "label": "审理中", "value": 86 },
            { "label": "已结案", "value": 57 }
          ]
        }
      ]
    }
  },
  { "version": "v0.10", "beginRendering": { "surfaceId": "report", "root": "root" } }
]
```

## Workflow Outputs Wrapper

Use `systemResponse` as stringified A2UI array:

```json
{
  "systemResponse": "[{\"version\":\"v0.10\",\"createSurface\":{\"surfaceId\":\"report\",\"catalogId\":\"\"}}, ... ]"
}
```

Equivalent runtime logic:

```ts
const outputs = {
  systemResponse: JSON.stringify(a2uiMessages),
}
```
