---
name: hai-ui
description: "使用 @h-ai/ui 构建 Svelte 5 表单、表格、弹窗、新手引导、帮助中心、主题与 AI 内容展示。"
---

# hai-ui

## 能力契约

主题 DOM 与安全缓存复用 `@h-ai/ui/theme` 的 `applyTheme` / `getSavedTheme(fallbackTheme?)`；默认主题取应用配置，选择范围与已编译 CSS 主题一致。

| 项目 | 契约 |
| --- | --- |
| 能力 | 使用 @h-ai/ui 构建 Svelte 5 表单、表格、弹窗、移动界面、主题与 AI 内容展示 |
| 适用场景 | 已有 Svelte 项目中的组件选择与交互实现 |
| 输入 | 现有 Svelte 页面、组件 Props、Tailwind 扫描路径与主题 |
| 输出 | 复用原子/组合/场景组件的界面及交互验证 |
| 限制 | 无 init/close；按公开导出使用组件。复用内置翻译；SSR 不直接访问浏览器全局，高风险代码预览须显式启用。 |


## 使用路径

读取 [完整工作流程与按需参考](../../../packages/cli/templates/skills/hai-ui/SKILL.md)，共享契约只在该位置维护。仓库开发先按 [工作规范](../../instructions/workspace.md) 选择模块、应用与测试规范；框架 API 以本仓库真实公开导出与类型核验，发布包消费者以安装版本核验。

公共变化同步 packages、apps、CLI 模板、README、skills、LLMS 与受影响测试。只读审查和仅规划请求按其范围交付；已有实现/修复授权按流程继续，验证结果关联当前代码和实际环境。
