# AGENTS.md

hai-framework monorepo：`packages/*` 为框架包，`apps/*` 为应用，`packages/cli/templates/` 为生成模板。包管理使用 pnpm；PowerShell 使用 `pnpm.cmd`。

本文件是所有 AI 编程助手的共享入口。仓库开发或审查任务先读 [工作规范](.agents/instructions/workspace.md)，再按下表选择专属规范和 skill。

## 按任务读取

只读取与任务相关的规范和 skill；不要预加载所有参考文件。

| 任务                                  | 入口                                                                                                                                                             |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 仓库开发流程、影响分析、交付          | [.agents/instructions/workspace.md](.agents/instructions/workspace.md)                                                                                           |
| 修改框架包                            | [.agents/instructions/module-conventions.md](.agents/instructions/module-conventions.md)                                                                         |
| 创建 / 审查框架模块                   | [.agents/skills/hai-create-module/SKILL.md](.agents/skills/hai-create-module/SKILL.md) / [hai-review-module](.agents/skills/hai-review-module/SKILL.md)          |
| 修改应用                              | [.agents/instructions/app-conventions.md](.agents/instructions/app-conventions.md)；Svelte 另读 [svelte-conventions](.agents/instructions/svelte-conventions.md) |
| 修改测试                              | [.agents/instructions/test-conventions.md](.agents/instructions/test-conventions.md)                                                                             |
| 数据库                                | [.agents/instructions/reldb-conventions.md](.agents/instructions/reldb-conventions.md) + [hai-usage-reldb](.agents/skills/hai-usage-reldb/SKILL.md)              |
| 模块使用 / 应用创建审查 / AI 入口维护 | [LLMS.txt](LLMS.txt) 按模块或任务导航                                                                                                                            |

`.agents/skills/` 面向本仓库开发；`packages/cli/templates/skills/` 面向生成应用，CLI 将完整目录复制到应用 `.agents/skills/`。重叠公共契约必须同步，项目私有路径不应复制到应用模板。

## 工具入口

- Codex 原生读取根 `AGENTS.md` 并发现 `.agents/skills/`；可用 `$hai-create-module` 等名称调用，或按任务自动选择。规范由本文件路由，不依赖 Copilot 的 `applyTo`。
- 详细规范正文只在 `.agents/instructions/` 维护。`.github/copilot-instructions.md` 和 `.github/instructions/*.instructions.md` 仅桥接共享入口与对应规范，保留 Copilot 的路径匹配。
- Claude Code 通过根 `CLAUDE.md` 的 `@AGENTS.md` 复用规则，并按导航读取共享 skills；OpenCode 的 `opencode.json` 直接引用 `AGENTS.md`。不为各工具复制 skill 正文。

## 硬约束

- 先用 `rg` 查实现、引用、测试和文档，保留已有改动；复用优先，不为假设需求新增抽象。
- 生命周期模块按 `init(config) → use → close()` 使用；纯函数、工厂、core、serv、kit 等按实际类型契约处理，不臆造生命周期。
- 返回 `HaiResult` 的业务 API 不抛业务异常；调用方先判断 `success`。流式 API、显式抛错函数及框架控制流例外见模块规范。
- 禁止 `any`、无说明的 `as unknown as T`、`console.log`、硬编码密钥。代码注释中文、日志英文；用户可见文本走 i18n 并同步中英文。
- 公开 API、配置、类型、错误码或模板变动，全局核对并同步实现、调用方、测试、README、skills、LLMS.txt 和注释。

## 验证与报告

按 [工作规范](.agents/instructions/workspace.md#验证与交付) 分轮验证：先脚本化收集全部可执行门禁，普通失败只记录；汇总根因后集中修复，再验证失败及受影响项。默认顺序为 `pnpm typecheck` → `pnpm lint` → `pnpm build`（构建/模板/发布/跨包契约）→ `pnpm test`，优先用 `--filter <workspace>`；UI/路由/端到端改动加相应 `test:e2e` 或根 `pnpm e2e`。真实前置失败只阻塞依赖检查，不使用旧产物补成通过。

AI 文档执行 `pnpm check:skills` 并检查引用；CLI 模板验证 `pnpm --filter @h-ai/cli test:scaffold-gates`。最终报告已执行门禁、未执行原因、已同步文档/skill/依赖方；文档改动需明确有无运行时代码影响。
