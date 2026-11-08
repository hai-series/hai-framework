---
name: hai-ui
description: "使用 @h-ai/ui 构建 Svelte 5 表单、表格、看板图表、弹窗、引导、主题与 AI 内容展示。"
---

# hai-ui

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 使用 @h-ai/ui 构建 Svelte 5 表单、表格、弹窗、移动界面、主题与 AI 内容展示 |
| 适用场景 | 已有 Svelte 项目中的组件选择与交互实现 |
| 输入 | 现有 Svelte 页面、组件 Props、Tailwind 扫描路径与主题 |
| 输出 | 复用原子/组合/场景组件的界面及交互验证 |
| 限制 | 无 init/close；按公开导出使用组件。复用内置翻译；SSR 不直接访问浏览器全局，高风险代码预览须显式启用。 |

## 使用路径

按 [共享使用契约](../../../packages/cli/templates/skills/hai-ui/SKILL.md) 选择操作与相邻参考，仅加载当前任务所需小节；模块 API、安全限制、生命周期和失败行为只在共享正文维护。

仓库内修改另按 [工作规范](../../instructions/workspace.md) 与 [模块规范](../../instructions/module-conventions.md)；公开签名以当前源码为准，发布包使用以实际安装版本为准。公共变化同步实现、调用方、模板、文档与测试。
