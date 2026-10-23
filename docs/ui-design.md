# Hai 应用界面设计约定

本约定供示例应用、CLI 生成应用和前端 skills 共同参考。公开组件 API 以实际安装版本为准，业务权限、字段和流程以项目需求为准。

## 从使用者的任务开始

管理界面优先让人查找、判断和操作：页面标题说明任务，主操作清楚，搜索/筛选与内容靠近，数据密度适合目标设备。官网根据真实内容组织表达与行动；帮助与文档保留阅读宽度和清楚的步骤。沿用现有品牌，页面变化只记录相对全局约定的差异。

## 视觉基础

- 使用 DaisyUI 语义色与已编译主题白名单；焦点使用 `--hai-focus-color`，跟随 `--color-primary`，可在主题层覆盖。
- `theme.css` 引入共享 `design-tokens.css`：间距、圆角、字体、触摸区域、层级和动效由同一组变量提供。业务扩展放在主题层。
- 后台外壳使用可用宽度；正文按阅读需要限制宽度。flex/grid 子项允许收缩，表格、代码和图表在自身容器内滚动，长链接与标识符自然换行。
- 桌面表格使用已有 `density`，触摸设备扩大操作区域。减少动态效果时停止装饰运动和平滑滚动，保留最终状态和状态文字。

## 组件选择与状态

| 用户任务 | 首选能力 | 必查场景 |
| --- | --- | --- |
| 查找与管理记录 | CrudPage；必要时 DataTable + TableToolbar + Pagination | 排序、筛选无结果、查询失败、分页同步、键盘与返回位置 |
| 填写与修改数据 | Form/FormLayout + FormField + 原有输入组件 | 首次失焦/提交、修正、中文输入法、窄容器、语言变化、失败保留输入 |
| 详情与确认 | Modal、Drawer、Confirm、Steps | 进入/关闭焦点、正文滚动、操作区域、长内容和危险操作 |
| 导航与移动 | Tabs、Breadcrumb、AppBar、BottomNav、SafeArea | 禁用项、方向键/Home/End、返回、深链、安全区域与触摸 |
| 提示与恢复 | Alert、Empty、Skeleton、Result、已有消息容器 | 区分无数据、无匹配、失败、无权限；给出适当下一动作 |
| 文件、AI、图表、引导 | 现有 storage/AI/charts/guide 场景组件 | 进度、取消/重试、真实完成状态、不可信内容、内部滚动、图例/单位和帮助入口 |

通用组件负责展示与交互，应用服务负责数据、授权和外部副作用。控件前端限制不能替代服务端校验；成功提示必须对应真实结果。

## 应用示例与验收

admin-console 的 `/admin/ui-gallery/compounds` 包含完整的状态与交互示例：正常、加载、无结果、失败恢复、长英文、表格排序、分页、筛选和页签。该示例以受控数据展示组件，不代表外部服务验收。原有 scenes/charts/overlays 展厅用于专项组件验证。

至少检查目标手机与桌面、明暗主题、项目支持的全部语言、长内容、键盘和适用触摸行为。后台列表与工作台另检查 1920/2560/3840px 的内容占宽；当前示例覆盖中英日文。截图保存布局证据，操作与断言验证行为。原生宿主和真实 Provider 另行保留各自证据。验收产物放忽略目录。

设计使用 [hai-ui-design](../packages/cli/templates/skills/hai-ui-design/SKILL.md)，实现使用 [hai-ui](../packages/cli/templates/skills/hai-ui/SKILL.md)，审查使用 [hai-ui-review](../packages/cli/templates/skills/hai-ui-review/SKILL.md)。SDD 交接沿 [handoff.md](../packages/cli/templates/skills/hai-spec-implement/handoff.md) 维护需求、验收与当前证据。
