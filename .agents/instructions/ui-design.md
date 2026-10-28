# Hai 应用界面设计约定

本约定供示例应用、CLI 生成应用和前端 skills 共同参考。公开组件 API 以实际安装版本为准，业务权限、字段和流程以项目需求为准。

## 从使用者的任务开始

管理界面优先让人查找、判断和操作：页面标题说明任务，主操作清楚，搜索/筛选与内容靠近，数据密度适合目标设备。官网根据真实内容组织表达与行动；帮助与文档保留阅读宽度和清楚的步骤。沿用现有品牌，页面变化只记录相对全局约定的差异。

## 视觉基础

- 使用 DaisyUI 语义色与已编译主题白名单；焦点使用 `--hai-focus-color`，跟随 `--color-primary`，可在主题层覆盖。
- `theme.css` 引入共享 `design-tokens.css`：间距、圆角、字体、触摸区域、层级和动效由同一组变量提供。业务扩展放在主题层。
- 后台外壳使用可用宽度；正文按阅读需要限制宽度。flex/grid 子项允许收缩，表格、代码和图表在自身容器内滚动，长链接与标识符自然换行。
- 桌面表格使用已有 `density`，触摸设备扩大操作区域。减少动态效果时停止装饰运动和平滑滚动，保留最终状态和状态文字。

## 后台布局与筛选

- 后台与工作台优先使用 WorkspaceLayout 统一紧凑顶栏、内容内边距和可选页脚，不叠加大段上下 padding。导航已显示页面标题时，内容区不再重复；PageHeader 与 SettingsLayout 保留说明/操作，CrudPage 将操作放入工具栏。独立页面或真实子区域保留必要标题。
- 列表统一使用卡片内查询栏、独立滚动表格和底部分页。多条件筛选使用 FilterBar / TableToolbar / CrudFilterBar，默认收起扩展条件，搜索/查询/重置保持可用；Query 或 Enter 一次提交搜索和全部条件，草稿变化不自动请求，折叠保留值。翻页和排序沿用已提交条件，重置清空条件并回第一页。TableToolbar 与 CrudFilterBar 共用原生查询表单，onfilterchange 仅通知草稿变化，onsearch 读取绑定草稿并提交；实际 onreset/onclearfilters 必须重新查询。排序只在后端支持的 DataTable 列头提供，不新增图标筛选/排序弹层或页面私有折叠状态机。 扩展筛选使用自适应网格，字段横向间距 20px、纵向间距 16px，标签与控件分别对齐且控件等高；窄屏改为单列，避免定宽输入框贴边挤压。

- 外壳、页面容器、表格逐层传递剩余高度和 min-height: 0；分页保留在数据滚动区外。列表页不使用营销式的大段上下留白，窄屏仍保留可触达的操作。
- 验收导航标题唯一、展开/收起、保留条件、重置所有条件、键盘以及手机/宽屏；紧凑布局不得遮挡或缩小可操作区域。
- 放大文字或窄容器下允许顶栏换行，不能让标题/关键按钮缩到不可见。提供 high-contrast 高对比和 formal 直角商务外观；按实际文字/背景验收对比度，不能仅凭主题名称判定无障碍通过。
- 查询/登录使用原生表单 Enter 与 submitHint 提示；IME 确认不触发搜索。验收 Tab、方向键、Enter/Space、Esc、弹窗初始焦点及关闭恢复；危险确认默认聚焦取消。

## 组件选择与状态

| 用户任务 | 首选能力 | 必查场景 |
| --- | --- | --- |
| 查找与管理记录 | CrudPage；必要时 DataTable + TableToolbar + Pagination | 排序、筛选无结果、查询失败、分页同步、键盘与返回位置 |
| 填写与修改数据 | Form/FormLayout + FormField + 原有输入组件 | 输入后失焦/提交、修正、中文输入法、窄容器、语言变化、失败保留输入 |
| 详情与确认 | Modal、Drawer、Confirm、Steps | 进入/关闭焦点、正文滚动、操作区域、长内容和危险操作 |
| 导航与移动 | Tabs、Breadcrumb、AppBar、BottomNav、SafeArea | 禁用项、方向键/Home/End、返回、深链、安全区域与触摸 |
| 提示与恢复 | Alert、Empty、Skeleton、Result、已有消息容器 | 区分无数据、无匹配、失败、无权限；给出适当下一动作 |
| 文件、AI、图表、引导 | 现有 storage/AI/charts/guide 场景组件 | 进度、取消/重试、真实完成状态、不可信内容、内部滚动、图例/单位和帮助入口 |

通用组件负责展示与交互，应用服务负责数据、授权和外部副作用。控件前端限制不能替代服务端校验；成功提示必须对应真实结果。

## 应用示例与验收

admin-console 的 `/admin/ui-gallery/compounds` 包含完整的状态与交互示例：正常、加载、无结果、失败恢复、长英文、表格排序、分页、筛选和页签。该示例以受控数据展示组件，不代表外部服务验收。原有 scenes/charts/overlays 展厅用于专项组件验证。

至少检查目标手机与桌面、明暗主题、项目支持的全部语言、长内容、键盘和适用触摸行为。后台列表与工作台另检查 1920/2560/3840px 的内容占宽；当前示例覆盖中英日文。截图保存布局证据，操作与断言验证行为。原生宿主和真实 Provider 另行保留各自证据。验收产物放忽略目录。

设计使用 [hai-ui-design](../../packages/cli/templates/skills/hai-ui-design/SKILL.md)，实现使用 [hai-ui](../../packages/cli/templates/skills/hai-ui/SKILL.md)，审查使用 [hai-ui-review](../../packages/cli/templates/skills/hai-ui-review/SKILL.md)。SDD 交接沿 [handoff.md](../../packages/cli/templates/skills/hai-spec-implement/handoff.md) 维护需求、验收与当前证据。
