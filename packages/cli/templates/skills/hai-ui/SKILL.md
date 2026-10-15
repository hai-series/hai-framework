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

- 先检查组件导入、Tailwind @source 和主题 CSS，再选场景 → 组合 → 原子组件，缺能力才自定义。
- 按安装版本的 exports 选择公开 components 目录入口；主题工具使用 `@h-ai/ui/theme`，避免仅为主题加载根入口的 AI/图表组件。禁止导入内部 src/dist；例如原子组件使用 `@h-ai/ui/components/primitives/index`。
- 自动导入识别无分号、跨行及别名的运行时 import；已绑定的本地组件名称不会重复注入。
- 应用只提供页面级文案；组件内部中英文由 @h-ai/ui 维护。
- `UserProfile` 用 `avatarAccept` / `avatarHint` 对齐业务的头像格式与大小限制；文件最终校验和上传由业务回调完成。
- `BareInput type="file"` 通过 `onchange` 的 `currentTarget.files` 读取文件，不绑定文件路径 `value`；其他输入类型可 `bind:value`。
- AI 文本视为不可信；Markdown/Mermaid 预览与允许执行 HTML/JS 的预览有不同边界。

## 按需参考

新手引导、首次 Cookie 提示、操作导览和帮助中心见 [guide.md](guide.md)。fullstack 默认在共享管理界面接入，新增业务只补内容与 data-guide 锚点。

详细配置、API 签名、错误码和范本在 [reference.md](reference.md)。按下列标题定位所需小节，不默认通读；用例中的业务变量需结合当前应用补齐。

- 运行环境
- 适用场景
- 使用边界
- AI 使用顺序（先判断，再落地）
- 项目配置（从 npm 安装）
- 三层组件架构
- Design Token 系统
- 主题系统
- 代码高亮（Shiki）
- 重要约定
- 导出路径
- 相关 Skills

## 表单布局与错误提示

状态层通过轻量入口 `@h-ai/ui/i18n` 导入 `setGlobalLocale` / `createLocaleStore`，不加载组件或引导 CSS。

数据新增/修改统一使用 `Form`（托管提交）或原生 `<form>` + `FormLayout`，不要在应用复制字段 grid。两者支持 `columns={1 | 2}`、`labelPosition='top' | 'left'`、`labelWidth`；默认单列/标签在上，窄容器自动收拢。`FormField.colSpan='auto'` 自动让多行文本、上传和多选占两列，`1` / `2` 可覆盖；自定义宽控件标注 `data-form-wide`。已有控件 ID 或原生控件给 FormField 配 `for`，避免重复或失效的标签。

IAM 表单、AuthPanel、UserProfile、FeedbackModal 直接接收同组参数；CRUD 使用 `form={{ columns: 2, labelPosition: 'left', labelWidth: '6rem' }}`，字段支持 `colSpan` 和延迟翻译的 `validation.message: () => m.required()`。通用字段的 `label/error/hint`、Input/Textarea/Select 的 `validationMessage` 支持翻译函数。内置必填、类型、长度和范围错误由 UI 提供；应用只提供业务文案。通过 UI 的 `setGlobalLocale` / `createLocaleStore` 同步语言，已显示的错误随之更新；自定义提示只用于失败，不能把固定提示直接设成持续的 customValidity。字段错误只在 FormField 或控件其中一处展示。

验证一列/双列与两种标签位置、自动/显式跨列、窄抽屉/手机、无效提交与修正、切换语言后的错误、按钮和回车提交，以及关闭重开后的状态。
