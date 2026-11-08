# AGENTS.md

> H5 移动端项目 AI 编程助手入口。优先结合 `README.md`、`.agents/skills/`、`src/routes/`、`messages/*` 与移动端测试工作。


## 行为契约

先读 [项目共同规则](.agents/skills/hai-app-create/project.md)，按当前任务读取下面的入口；不要加载整个 skill 树。业务以用户当前明确要求及指定文档为准，模板行为是可调整的起点。

| 任务 | 入口 |
| --- | --- |
| 新增、修改、修复应用 | [hai-app-create](.agents/skills/hai-app-create/SKILL.md)；配置、注释与能力选择按需查 [development.md](.agents/skills/hai-app-create/development.md) |
| 需求/设计文档审查 | [hai-spec-review](.agents/skills/hai-spec-review/SKILL.md) |
| 文档驱动规划、实施或返修 | [hai-spec-implement](.agents/skills/hai-spec-implement/SKILL.md) |
| 代码审查 / 测试 / 构建 / 升级 | 按任务读取同名 hai-app-review / hai-app-tests / hai-build / hai-framework-sync；模块按实际依赖选择 |

## 项目定位

本项目是 hai-framework H5 模板，面向移动浏览器，重点是触屏布局、移动端导航、i18n、API 调用与端到端流程。

## 架构边界

- 使用移动端友好的布局和 `@h-ai/ui` 移动组件。
- 页面文本走 i18n，同步中英日文 messages。
- API 输入必须校验，业务错误按 HaiResult 传递。
- `+server.ts` 只能导出 handler 和 SvelteKit 允许的配置项；helper 放到 `src/lib/**`。
- 敏感 token 不要写入不安全存储；优先复用模板已有的鉴权与请求模式。
- 本样板默认不以 `@h-ai/serv`、`@h-ai/api-contract`、`@h-ai/api-client`、`@h-ai/capacitor` 作为主架构。


## 完成条件

按实际 package scripts 和 [分轮验证](.agents/skills/hai-app-tests/validation.md) 选择受影响范围，依次收集 typecheck → lint → build（需要时）→ test → 相关 E2E；例如 `pnpm typecheck`。普通失败不中断独立检查，汇总后集中修复并定向复测。报告实际结果、文档/调用方同步与未验证原因；不能用静态、mock 或 Web 结果代替真实业务、外部服务或原生验证。
