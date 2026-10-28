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


所有警告、错误和即时操作结果统一使用 `toast` / `notifyError` 等，根布局只挂载一次 `ToastContainer`；默认右下角，使用主题语义色、浅色底、细色边及类型图标，可手工关闭，默认 3 秒消失（notifyError/notifyWarning 默认 5 秒）。FIFO 队列逐条展示，等待期间不计时；`toast.add({ message, position, traceId })` 支持六个方位，`duration: 0` 需手动移除。traceId 无默认，正文不显示编号，容器自动分离已有格式；有编号才显示排查图标，展开可查看和复制。悬停、聚焦和展开时暂停，结束后继续剩余时间。状态层使用轻量 `@h-ai/ui/toast`。响应式安全文案使用 `useToastFeedback`，同类、同文案、同编号合并，来源更新/清空时替换/移除其旧提示，卸载不撤销已发通知。字段保留错误标记与读屏关联，恢复动作留在原位；Alert 仅支持 info/success 持续信息。迁移旧 warning/error Alert 时改用 Toast，不新增行内错误段落。

- 后台与工作台优先使用 WorkspaceLayout 统一紧凑顶栏、内容内边距和可选页脚，不叠加大段上下 padding。导航已显示页面标题时，内容区不再重复；PageHeader 与 SettingsLayout 保留说明/操作，CrudPage 将操作放入工具栏。独立页面或真实子区域保留必要标题。
- 列表统一使用卡片内查询栏、独立滚动表格和底部分页。多条件筛选使用 FilterBar / TableToolbar / CrudFilterBar，默认收起扩展条件，搜索/查询/重置保持可用；Query 或 Enter 一次提交搜索和全部条件，草稿变化不自动请求，折叠保留值。翻页和排序沿用已提交条件，重置清空条件并回第一页。TableToolbar 与 CrudFilterBar 共用原生查询表单，onfilterchange 仅通知草稿变化，onsearch 读取绑定草稿并提交；实际 onreset/onclearfilters 必须重新查询。排序只在后端支持的 DataTable 列头提供，不新增图标筛选/排序弹层或页面私有折叠状态机。 扩展筛选使用自适应网格，字段横向间距 20px、纵向间距 16px，标签与控件分别对齐且控件等高；窄屏改为单列，避免定宽输入框贴边挤压。

- 查询/登录采用原生表单 Enter 提交；提示使用 Button submitHint（仅 submit），不注册占用浏览器按键的全局监听。输入法确认不得触发搜索；保留 Tab、Enter/Space、Esc、菜单方向键和清晰焦点。弹窗默认聚焦首个可编辑项，危险确认优先聚焦取消；关闭恢复触发控件，忙碌/禁用时不得继续提交。

## 使用路径

Toast 支持 F8 聚焦/返回、Escape 关闭可关闭提示并恢复焦点；Modal 内也要验证键盘路径。`notifyError` 接收完整错误对象或安全本地化字符串；Promise 组件需抛异常时用 `new Error(result.error.message, { cause: result.error })` 保留安全业务原因和 traceId。普通 Error 和 5xx 使用兜底，不传未知 `err.message`。修改及交付遵循[沟通与同步维护](../hai-app-create/collaboration.md)。

状态层可从轻量 `@h-ai/ui/i18n` 导入同一个 `authErrorMessage`，避免加载场景组件；管理台、移动/桌面示例与模板保持一致。

认证错误复用公开 `authErrorMessage(error)`（从 `@h-ai/ui/components/scenes/iam/index` 导入）：凭据错误统一，不显示未知原文，保留有效 traceId 供排查图标展开；首次/到期改密、密码复用 034 和会话上限有明确指引。AuthPanel 与敏感操作确认已内置；自定义改密复用此映射。确认密码按原始字符串比较，不裁剪或 Unicode 归一化；字段错误、操作成功和认证错误均使用统一 Toast，字段保留定位与无障碍关联。

新页面或较大改版先使用 [hai-ui-design](../hai-ui-design/SKILL.md) 确定任务、布局、状态和组件映射；本 skill 负责正确实现。完成后按 [hai-ui-review](../hai-ui-review/SKILL.md) 查看真实页面，小范围修复沿用已有设计。

- 密码登录只接收 identifier/password；AuthPanel 将 LoginForm 的 username 映射为 identifier。会话期限来自服务端 session.maxAge/refreshTokenMaxAge，不增加未实现的登录偏好字段或持久会话选择框。

- 先检查组件导入、Tailwind @source 和主题 CSS，再选场景 → 组合 → 原子组件，缺能力才自定义。
- 管理列表和工作台随可用宽度展开；flex/grid 子项设 min-width: 0，表格在自身容器滚动。阅读页与登录表单按内容约束宽度。实际检查 390、1440、1920、2560、3840px，避免宽屏仍挤在中央窄列，手机出现整页横向滚动。
- 按安装版本的 exports 选择明确列出的 components barrel 入口（不开放任意内部文件）；主题工具使用 `@h-ai/ui/theme`，避免仅为主题加载根入口的 AI/图表组件。禁止导入内部 src/dist；例如原子组件使用 `@h-ai/ui/components/primitives/index`。
- 自动导入识别无分号、跨行及别名的运行时 import；已绑定的本地组件名称不会重复注入。
- 应用只提供页面级文案；组件内部中英日文由 @h-ai/ui 维护。
- `UserProfile` 用 `avatarAccept` / `avatarHint` 对齐业务的头像格式与大小限制；文件最终校验和上传由业务回调完成。
- `BareInput type="file"` 通过 `onchange` 的 `currentTarget.files` 读取文件，不绑定文件路径 `value`；其他输入类型可 `bind:value`。
- AI 文本视为不可信；Markdown/Mermaid 预览与允许执行 HTML/JS 的预览有不同边界。

- Tabs 支持方向键、Home/End、跳过禁用项与单一 Tab 入口，children 内容关联当前页签；DataTable 通过 aria-sort/aria-busy 和加载文字提供状态，有 onrowclick 时支持行 Enter/Space，单元格操作不重复触发行操作。
- Pagination 导航和输入名称跟随 UI locale，外部 page 变化同步跳页草稿，触摸设备扩大导航按钮；TableToolbar 展开筛选遵循文档焦点顺序，视图按钮带选中状态。应用仍需接入排序、筛选、分页和视图对应的数据行为。
- CrudPage 占满宿主剩余高度，空数据和少量数据时分页保留在底部；宿主从视口外壳到内容区逐层使用 flex/grid 的剩余空间约束与 min-height: 0，避免自动高度包装层截断布局。数据区独立滚动，分页不覆盖数据。
- theme.css 自动引入 design-tokens.css；全局样式的焦点使用 --hai-focus-color（缺省跟随当前 primary），减少动态效果时保留最终状态并缩短动画。长内容在 Empty/Alert 中换行；业务自定义 snippet 也要能收缩。


敏感操作复用 createSensitiveActions(Kit/API client 标准 actions) + ReauthenticationDialog，不在业务项目复制弹窗状态机。每个根布局创建一份，configure(公开策略)，卸载时 cancel()；authorize 返回 undefined 无需验证、null 取消/忙、有字符串才是本次证明。取消不发业务请求；会话恢复/证明失效后通过本次 reauthorize 回调重新 authorize，取消不续发；Kit 回调放 apiFetch 第三参数，typed client 放本次 options.context。typed client 只给本次 options.context.reauthentication，不放全局 header/持久存储。服务端仍检查授权并消费用途凭据。Input 的 datetime-local 值需按本地时区转换为明确时间戳。

AuthPanel 的 config.captcha.enabled 开启后，复用 createAuthActions 提供的 createCaptcha 自动完成自托管计算挑战。自定义认证动作保留 captcha 字段及 sendOtp/resetrequest 的可选 options；不要只在界面验证或持久化证明。关闭时不加载求解器，取消/卸载停止后续鉴别。

## 按需参考

新手引导、首次 Cookie 提示、操作导览和帮助中心见 [guide.md](guide.md)。fullstack 默认在共享管理界面接入，新增业务只补内容与 data-guide 锚点。

按任务读取 [reference.md](reference.md) 的对应小节；签名以当前源码或安装版本的公开类型为准，不默认加载全部资料。示例中的业务变量由应用提供。

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

问题反馈使用 `FeedbackModal/FeedbackForm` 收集、`FeedbackList/FeedbackDetail` 管理、`FeedbackScreenshot` 标注。组件只负责交互，先固定现场再打开弹窗；跨页截图用 oncapture，实际脱敏材料用 evidence，短录屏随 onfileschange 接入，详情 onreplay 按需读取完整操作记录；可靠受理、上传、通知、权限和离线包按 [hai-feedback](../hai-feedback/SKILL.md) 接入，不把表单回调完成当作持久化成功。

文本控件输入后失焦显示前端错误，修正输入时即时更新；未输入空字段留到提交校验，避免默认焦点离开时挤动操作。CRUD 新增/编辑同样在输入后失焦或提交时校验。Select 在焦点离开触发器及选项后校验。应用无需逐项绑定 blur；业务异步校验仍由应用提供。PasswordInput 的 minLength 提供时执行长度校验；登录现有密码时省略该属性。

UserProfile 的 `fieldConstraints` 按字段声明 `required/minlength/maxlength/pattern/validationMessage`；单行控件支持 pattern，业务文案可用翻译函数。不要只在保存回调内放前端校验，服务端仍须执行 schema 校验。

状态层通过轻量入口 `@h-ai/ui/i18n` 导入 `setGlobalLocale` / `createLocaleStore`，不加载组件或引导 CSS。

应用业务文案使用项目自己的 Paraglide 消息。`uiM` 为 UI 包内部函数，不能从 `@h-ai/ui/i18n` 导入或复制内部字典。

数据新增/修改统一使用 `Form`（托管提交）或原生 `<form>` + `FormLayout`，不要在应用复制字段 grid。两者支持 `columns={1 | 2}`、`labelPosition='top' | 'left'`、`labelWidth`；默认单列/标签在上，窄容器自动收拢。`FormField.colSpan='auto'` 自动让多行文本、上传和多选占两列，`1` / `2` 可覆盖；自定义宽控件标注 `data-form-wide`。已有控件 ID 或原生控件给 FormField 配 `for`，避免重复或失效的标签。

IAM 表单、AuthPanel、UserProfile、FeedbackModal 直接接收同组参数；CRUD 使用 `form={{ columns: 2, labelPosition: 'left', labelWidth: '6rem' }}`，字段支持 `colSpan` 和延迟翻译的 `validation.message: () => m.required()`。通用字段的 `label/error/hint`、Input/Textarea/Select 的 `validationMessage` 支持翻译函数。内置必填、类型、长度和范围错误由 UI 提供；应用只提供业务文案。通过 UI 的 `setGlobalLocale` / `createLocaleStore` 同步语言，已显示的错误随之更新；自定义提示只用于失败，不能把固定提示直接设成持续的 customValidity。FormField 或控件将字段名与错误发送到 Toast，避免父子重复；修正或关闭宿主后清除过期通知，读屏关联说明仍保留在控件旁。

验证一列/双列与两种标签位置、自动/显式跨列、窄抽屉/手机、无效提交与修正、切换语言后的错误、按钮和回车提交，以及关闭重开后的状态。字段 Toast 关闭或超时后，再次提交相同无效输入仍须显示提示，修正后清除旧通知。

Node 请求/SSR 必须用 `core.i18n.runWithLocale(locale, callback)`（kit 同名方法）包裹实际异步 resolve；serv 自动建立请求语言上下文。浏览器 setGlobalLocale/createLocaleStore 继续管理应用语言，SSR 的 UI setter/store 不写全局值。显式 MessageOptions.locale 优先；进程默认语言仅在启动时设置。

`@h-ai/ui/i18n` 的 `createLocaleStore` 按“可解析的持久化值 → 完整 navigator.languages（再检查 navigator.language）→ defaultLocale → 支持列表首项”选择语言；首个不支持的候选不触发默认回退。匹配大小写、语言简写及逐级区域/脚本回退，返回 supportedLocales 中的配置代码；同语言多个变体按列表顺序选择。detectBrowserLocale 无实际命中返回 null，不插入框架默认值；空支持列表最终保留调用方默认值。SSR 不读取浏览器候选或修改全局语言。应用若使用 Paraglide，仍需用该项目的 setLocale 同步应用翻译；内置 UI 字典的覆盖范围不因自定义 store 列表而自动增加。

会话失效时复用 createSessionRecovery + SessionRecoveryDialog，configure(公开配置, 原用户)，recover 传给 Kit/API client recoverSession；卸载 cancel。标准登录携带 expectedUserId 限制原主体，明确认证拒绝可续接一次，结果不明的写入不重放。SensitiveOperationsForm 编辑权限的 sensitiveOperations；文件和数据库取并集，可信 API 授权与操作守卫仍必须执行。
