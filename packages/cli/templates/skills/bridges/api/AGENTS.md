# AGENTS.md

> API 服务项目 AI 编程助手入口。优先结合 `README.md`、`.agents/skills/`、`apps/*-contract/src/**`、`apps/*-serv/src/**` 与测试工作。


## 行为契约

先读 [项目共同规则](.agents/skills/hai-app-create/project.md)，按当前任务读取下面的入口；不要加载整个 skill 树。业务以用户当前明确要求及指定文档为准，模板行为是可调整的起点。

| 任务 | 入口 |
| --- | --- |
| 新增、修改、修复应用 | [hai-app-create](.agents/skills/hai-app-create/SKILL.md)；配置、注释与能力选择按需查 [development.md](.agents/skills/hai-app-create/development.md) |
| 需求/设计文档审查 | [hai-spec-review](.agents/skills/hai-spec-review/SKILL.md) |
| 文档驱动规划、实施或返修 | [hai-spec-implement](.agents/skills/hai-spec-implement/SKILL.md) |
| 代码审查 / 测试 / 构建 / 升级 | 按任务读取同名 hai-app-review / hai-app-tests / hai-build / hai-framework-sync；模块按实际依赖选择 |

## 项目定位

本项目是 hai-framework API workspace：`apps/<project>-contract` 提供 typed contract，`apps/<project>-serv` 提供 `@h-ai/serv` 实现，无 UI 页面和前端 i18n。

## 架构边界

- API 输入输出必须由 `apps/*-contract/src/**` 中的 Zod schema 与 contract 定义统一约束。
- 当前 Service 通过 `@h-ai/serv` + `@h-ai/api-contract` 装配 HTTP App；保留此架构时不混入 SvelteKit API routes，需求要求迁移时同步入口、contract、调用方与脚本。
- Typed client / contract / service 三者保持同一份路径与类型定义，不要复制粘贴接口。
- 纯 API 需求不生成用户页面或引入 UI 专属依赖；需求增加前端时，按实际架构补充应用及其文案和验证。
- 配置和密钥来自 `apps/*-serv/config/` 与环境变量，禁止硬编码。


## 完成条件

按实际 package scripts 和 [分轮验证](.agents/skills/hai-app-tests/validation.md) 选择受影响范围，依次收集 typecheck → lint → build（需要时）→ test → 相关 E2E；例如 `pnpm typecheck`。普通失败不中断独立检查，汇总后集中修复并定向复测。报告实际结果、文档/调用方同步与未验证原因；不能用静态、mock 或 Web 结果代替真实业务、外部服务或原生验证。
