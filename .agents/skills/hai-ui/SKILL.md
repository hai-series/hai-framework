---
name: hai-ui
description: "使用 @h-ai/ui 构建 Svelte 5 表单、表格、弹窗、新手引导、帮助中心、主题与 AI 内容展示。"
---

# hai-ui

## 能力契约

主题 DOM 与安全缓存复用 `@h-ai/ui/theme` 的 `applyTheme` / `getSavedTheme(fallbackTheme?)`；默认主题取应用配置，选择范围与已编译 CSS 主题一致。共享 theme.css 已包含 high-contrast 高对比及 formal 直角商务主题；新应用默认提供该选项，显式主题白名单尊重宿主配置。不能通过淡化正文/占位符抵消其对比度，验收实际文字、边框、焦点、缩放及偏好持久化。

| 项目 | 契约 |
| --- | --- |
| 能力 | 使用 @h-ai/ui 构建 Svelte 5 表单、表格、弹窗、移动界面、主题与 AI 内容展示 |
| 适用场景 | 已有 Svelte 项目中的组件选择与交互实现 |
| 输入 | 现有 Svelte 页面、组件 Props、Tailwind 扫描路径与主题 |
| 输出 | 复用原子/组合/场景组件的界面及交互验证 |
| 限制 | 无 init/close；按公开导出使用组件。复用内置翻译；SSR 不直接访问浏览器全局，高风险代码预览须显式启用。 |



敏感操作复用 createSensitiveActions(Kit/API client 标准 actions) + ReauthenticationDialog，不在业务项目复制弹窗状态机。每个根布局创建一份，configure(公开策略)，卸载时 cancel()；authorize 返回 undefined 无需验证、null 取消/忙、有字符串才是本次证明。取消不发业务请求；会话恢复/证明失效后通过本次 reauthorize 回调重新 authorize，取消不续发；Kit 回调放 apiFetch 第三参数，typed client 放本次 options.context。typed client 只给本次 options.context.reauthentication，不放全局 header/持久存储。服务端仍检查授权并消费用途凭据。Input 的 datetime-local 值需按本地时区转换为明确时间戳。

AuthPanel 的 config.captcha.enabled 开启后，复用 createAuthActions 提供的 createCaptcha 自动完成自托管计算挑战。自定义认证动作保留 captcha 字段及 sendOtp/resetrequest 的可选 options；不要只在界面验证或持久化证明。关闭时不加载求解器，取消/卸载停止后续鉴别。

- 后台与工作台优先使用 WorkspaceLayout 统一紧凑顶栏、内容内边距和可选页脚，不叠加大段上下 padding。导航已显示页面标题时，内容区不再重复；PageHeader 与 SettingsLayout 保留说明/操作，CrudPage 将操作放入工具栏。独立页面或真实子区域保留必要标题。
- 多条件筛选使用 FilterBar 或 CrudFilterBar，默认收起扩展条件，搜索/查询/重置保持可用；提供 activeCount 和实际 onreset，收起不能丢值或隐式清空查询。复用组件状态及三语文案，不在页面复制折叠状态机。TableToolbar 已有弹层筛选可继续复用。

- 查询/登录采用原生表单 Enter 提交；提示使用 Button submitHint（仅 submit），不注册占用浏览器按键的全局监听。输入法确认不得触发搜索；保留 Tab、Enter/Space、Esc、菜单方向键和清晰焦点。弹窗默认聚焦首个可编辑项，危险确认优先聚焦取消；关闭恢复触发控件，忙碌/禁用时不得继续提交。

## 使用路径

读取 [完整工作流程与按需参考](../../../packages/cli/templates/skills/hai-ui/SKILL.md)，共享契约只在该位置维护。仓库开发先按 [工作规范](../../instructions/workspace.md) 选择模块、应用与测试规范；框架 API 以本仓库真实公开导出与类型核验，发布包消费者以安装版本核验。

公共变化同步 packages、apps、CLI 模板、README、skills、LLMS 与受影响测试。只读审查和仅规划请求按其范围交付；已有实现/修复授权按流程继续，验证结果关联当前代码和实际环境。

会话失效时复用 createSessionRecovery + SessionRecoveryDialog，configure(公开配置, 原用户)，recover 传给 Kit/API client recoverSession；卸载 cancel。标准登录携带 expectedUserId 限制原主体，明确认证拒绝可续接一次，结果不明的写入不重放。SensitiveOperationsForm 编辑权限的 sensitiveOperations；文件和数据库取并集，可信 API 授权与操作守卫仍必须执行。
