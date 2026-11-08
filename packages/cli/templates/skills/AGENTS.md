# AGENTS.md

> 通用 AI 编程助手入口；hai add / AI 支持回填未能确定工程类型时使用。实际布局以当前 README、package.json 和目录为准。

## 行为契约

先读 [项目共同规则](.agents/skills/hai-app-create/project.md)，按当前任务读取下面的入口；不要加载整个 skill 树。业务以用户当前明确要求及指定文档为准，模板行为是可调整的起点。

| 任务 | 入口 |
| --- | --- |
| 新增、修改、修复应用 | [hai-app-create](.agents/skills/hai-app-create/SKILL.md)；配置、注释与能力选择按需查 [development.md](.agents/skills/hai-app-create/development.md) |
| 需求/设计文档审查 | [hai-spec-review](.agents/skills/hai-spec-review/SKILL.md) |
| 文档驱动规划、实施或返修 | [hai-spec-implement](.agents/skills/hai-spec-implement/SKILL.md) |
| 代码审查 / 测试 / 构建 / 升级 | 按任务读取同名 hai-app-review / hai-app-tests / hai-build / hai-framework-sync；模块按实际依赖选择 |

## 项目概述

本项目由 hai-framework CLI 生成，单应用通常位于 src/，多包工程位于 apps/ 与 packages/。不要按目录名猜测运行端或强行转换架构。

## 完成条件

按实际 package scripts 和 [分轮验证](.agents/skills/hai-app-tests/validation.md) 选择受影响范围，依次收集 typecheck → lint → build（需要时）→ test → 相关 E2E；例如 `pnpm typecheck`。普通失败不中断独立检查，汇总后集中修复并定向复测。报告实际结果、文档/调用方同步与未验证原因；不能用静态、mock 或 Web 结果代替真实业务、外部服务或原生验证。
