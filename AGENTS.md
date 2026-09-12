# AGENTS.md

hai-framework monorepo：`packages/*` 为框架包，`apps/*` 为应用，`packages/cli/templates/` 为生成模板。包管理使用 pnpm；PowerShell 使用 `pnpm.cmd`。

## 按任务读取

只读取与任务相关的规范和 skill；不要预加载所有参考文件。

| 任务                                  | 入口                                                                                                                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 仓库开发流程、影响分析、交付          | [.github/copilot-instructions.md](.github/copilot-instructions.md)                                                                                                                                      |
| 修改框架包                            | [.github/instructions/module-conventions.instructions.md](.github/instructions/module-conventions.instructions.md)                                                                                      |
| 创建 / 审查框架模块                   | [.github/skills/hai-create-module/SKILL.md](.github/skills/hai-create-module/SKILL.md) / [hai-review-module](.github/skills/hai-review-module/SKILL.md)                                                 |
| 修改应用                              | [.github/instructions/app-conventions.instructions.md](.github/instructions/app-conventions.instructions.md)；Svelte 另读 [svelte-conventions](.github/instructions/svelte-conventions.instructions.md) |
| 修改测试                              | [.github/instructions/test-conventions.instructions.md](.github/instructions/test-conventions.instructions.md)                                                                                          |
| 数据库                                | [.github/instructions/reldb-conventions.instructions.md](.github/instructions/reldb-conventions.instructions.md) + [hai-usage-reldb](.github/skills/hai-usage-reldb/SKILL.md)                           |
| 模块使用 / 应用创建审查 / AI 入口维护 | [LLMS.txt](LLMS.txt) 按模块或任务导航                                                                                                                                                                   |

`.github/skills/` 面向本仓库开发；`packages/cli/templates/skills/` 面向生成应用，CLI 将完整目录复制到应用 `.agents/skills/`。重叠公共契约必须同步，项目私有路径不应复制到应用模板。

## 硬约束

- 先用 `rg` 查实现、引用、测试和文档，保留已有改动；复用优先，不为假设需求新增抽象。
- 生命周期模块按 `init(config) → use → close()` 使用；纯函数、工厂、core、serv、kit 等按实际类型契约处理，不臆造生命周期。
- 返回 `HaiResult` 的业务 API 不抛业务异常；调用方先判断 `success`。流式 API、显式抛错函数及框架控制流例外见模块规范。
- 禁止 `any`、无说明的 `as unknown as T`、`console.log`、硬编码密钥。代码注释中文、日志英文；用户可见文本走 i18n 并同步中英文。
- 公开 API、配置、类型、错误码或模板变动，全局核对并同步实现、调用方、测试、README、skills、LLMS.txt 和注释。

## 验证与报告

按范围执行 `pnpm typecheck` → `pnpm lint` → `pnpm build`（构建/模板/发布/跨包契约）→ `pnpm test`；优先用 `--filter <workspace>`。UI/路由/端到端改动执行相应 `test:e2e` 或根 `pnpm e2e`。

AI 文档执行 `pnpm check:skills` 并检查引用；CLI 模板验证 `pnpm --filter @h-ai/cli test:scaffold-gates`。最终报告已执行门禁、未执行原因、已同步文档/skill/依赖方；文档改动需明确有无运行时代码影响。
