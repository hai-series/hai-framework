# AGENTS.md

> 通用 AI 编程助手入口。优先阅读 `README.md`、现有测试与 `.agents/skills/`；本文件同时作为 `hai add` / AI 支持回填时的 generic fallback。

## 行为契约

需求/设计文档审查或从文档生成代码时，读取 [hai-spec-review](.agents/skills/hai-spec-review/SKILL.md)，严格确认完备性、歧义、技术正确性与命名一致性；影响行为的问题未解决前不判定文档可生成。普通小改动不重审无关文档。

升级 hai-framework 到最新/指定版本、比较版本差异或同步框架 skills 时，先读 [框架升级与同步 Skill](.agents/skills/hai-framework-sync/SKILL.md)，执行版本发现、差异分析、用户选择/阻塞处理、迁移与验证；仅要求比较时不修改应用。

根据文档规划、实施、继续或返修任务时，读取 [hai-spec-implement](.agents/skills/hai-spec-implement/SKILL.md)：审查后按可验收功能和依赖拆分，维护 docs 下的清单及 docs/tasks 下的任务信息，每项独立分支 TDD、验证并本地合并；返修复用原任务与分支。仅规划不实施，指定任务先核验依赖。

普通新增、修改、修复任务开始前，先读 [应用开发 Skill](.agents/skills/hai-app-create/SKILL.md) 和 [开发规范与框架能力路由](.agents/skills/hai-app-create/development.md)；再按任务读取模块 Skill 及其相邻参考文件。架构/构建、审查、测试分别读取 hai-build、hai-app-review、hai-app-tests，不加载整个 skill 树。

- 对当前需求逐项检索 hai-framework 能力和已有实现，确认适用的公开 API 后优先复用；未安装模块先核对依赖与配置，不能因 Skill 已存在就假定已启用。框架不适用时说明具体限制与选用方案，不为覆盖清单引入无关模块。
- 按已安装版本的公开类型确认模块契约：生命周期模块按 init → use → close；core/serv/kit、纯函数/工厂与流按实际签名处理。返回 HaiResult 的操作先检查 success，不以 try/catch 代替判断；事务失败明确触发回滚。
- 边界输入做 schema 校验，服务端验证身份、租户与资源权限；SQL 动态值参数化，文件路径防逃逸。密钥不进入 PUBLIC_/VITE_ 变量、客户端代码和日志；敏感 token 不写 localStorage。
- 禁止 any、无说明的 as unknown as、console.log 和硬编码密钥；从包公开入口导入。注释中文、结构化日志英文并脱敏，用户文本走现有 i18n 并同步所有 locale。
- 完成时说明实际复用的框架能力、未采用的相关能力及原因、门禁结果；跨边界同步类型、配置、调用方、文档和测试。

先读 README、package.json、相关实现/测试和所需 .agents/skills；不要加载整个 skill 树。新增抽象前确认复用路径与真实需求；保留用户改动。跨文件任务简述影响和验证计划，无须固定规模标签或重复问卷。

- 直接影响：修改 / 新建 / 删除哪些文件；哪些脚本、类型、配置或路由会变。
- 间接影响：哪些测试、README、i18n、示例、共享类型、依赖方需要同步更新。

## 项目概述

本项目由 hai-framework CLI 生成。单应用工程通常在 `src/` 下开发；多包工程会同时包含 `packages/*` 与 `apps/*`。实际结构以当前项目目录为准。

如项目使用 SvelteKit，`+server.ts` 只能导出 HTTP handler 与 SvelteKit 允许的配置项；辅助函数放到 `src/lib/**`。

## 工作流程

1. 先搜索现有实现、引用点、测试和 README。
2. 小步修改，优先保持目录结构、公开 API 和脚本稳定。
3. 改动公共类型、配置、模板或共享逻辑时，同步更新所有调用方与文档。
4. 每次改动后按影响范围运行质量门禁并记录结果。

## 质量门禁

先核对 package.json，按影响范围执行已有脚本；文档检查引用，UI/路由变更再运行 E2E。未运行项说明原因。

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm test:e2e
```

## 完成条件

- typecheck / lint / build / test / test:e2e 状态明确；失败必须先修复或明确说明原因。
- README、i18n、测试、代码注释与实现保持一致。
- 最终回复说明执行过的门禁、已同步的文档 / 依赖方，以及未完成项。

## Skills 路由

- `.agents/skills/hai-build/SKILL.md`：架构、构建和质量门禁。
- `.agents/skills/hai-app-create/SKILL.md`：应用骨架、路由、页面与 API 模板。
- `.agents/skills/hai-app-review/SKILL.md`：应用代码审查。
- `.agents/skills/hai-app-tests/SKILL.md`：Vitest / Playwright 测试策略。
- 具体模块按需读取对应 `hai-*` Skill。
