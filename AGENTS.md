# AGENTS.md

> Codex / OpenCode / 通用 AI 编程助手入口。本文件只负责路由和少量硬约束；详细规范按需读取，避免把所有材料一次性塞进上下文。

## 入口顺序

1. 先读本文件，确认本次任务需要哪些规范。
2. 需要完整仓库工作规范时，读 `.github/copilot-instructions.md`。虽然文件名保留 Copilot，这是当前仓库的通用详细规则源。
3. 涉及特定路径时，按需读取 `.github/instructions/*.instructions.md`。
4. 涉及具体模块或流程时，读取 `.github/skills/<skill-name>/SKILL.md`；长示例或完整 API 再读同目录 `reference.md`。
5. `.github/skills/` 是本仓库的 skill 单一来源；可复用模板如存在，还要同步 `packages/cli/templates/skills/`。

## 仓库约定

- 本仓库是 hai-framework monorepo，核心包在 `packages/*`，示例/应用在 `apps/*`，CLI 生成模板在 `packages/cli/templates/`。
- 包管理使用 `pnpm`。优先使用 `pnpm --filter <workspace>` 做定向验证；跨包契约、共享类型或根配置变更再提升到根命令。
- 框架模块遵循 `module.init(config) -> use -> module.close()` 生命周期，公共 API 返回 `HaiResult<T>` 或 `Promise<HaiResult<T>>`。
- 公共模块 API 禁止业务异常直接 `throw`；错误按 HaiResult 透传，不用 `try/catch` 包裹正常业务错误。
- 禁止 `any`、无注释的 `as unknown as T`、`console.log`、硬编码密钥、用户可见文本绕过 i18n。
- 代码注释中文，日志消息英文；新增用户可见文本同时更新 `zh-CN` 和 `en-US`。

## 规范路由

- 修改 `packages/*` 模块：读 `.github/instructions/module-conventions.instructions.md`，需要创建/审查模块时再读 `.github/skills/hai-create-module` 或 `.github/skills/hai-review-module` skill。
- 修改 Svelte/SvelteKit 应用：读 `.github/instructions/app-conventions.instructions.md` 与 `.github/instructions/svelte-conventions.instructions.md`。
- 修改测试：读 `.github/instructions/test-conventions.instructions.md`。
- 修改 reldb 使用：读 `.github/instructions/reldb-conventions.instructions.md` 和 `.github/skills/hai-usage-reldb` skill。
- 修改 AI/iam/reldb 等模块用法：优先读对应 `.github/skills/hai-usage-*/SKILL.md`；通用模块模板优先看 `packages/cli/templates/skills/hai-*/SKILL.md`。

## 工作流程

- 先用 `rg` / `rg --files` 搜索现有实现、引用点、测试和文档；不要靠猜测判断影响面。
- 新增抽象、配置项、导出或文件前，确认当前仓库已有真实需求；能复用或删除冗余时优先复用/删除。
- 修改公共 API、类型、错误码、模板或脚手架后，全局检索受影响的 `packages/*`、`apps/*`、`packages/cli/templates/*` 并成套更新。
- 文档、README、skill、LLMS.txt、代码注释和测试要与实现同步；纯文档改动也要说明没有运行时代码影响。

## 质量门禁

按影响范围执行，失败先修复：

1. `pnpm typecheck`
2. `pnpm lint`
3. `pnpm build`（涉及构建产物、模板、发布路径或跨包契约时）
4. `pnpm test`
5. `pnpm --filter <workspace> test:e2e` 或 `pnpm e2e`（涉及 UI、路由、浏览器交互或端到端流程时）

最终回复必须说明执行过的门禁、未执行项原因、已同步的文档/skill/依赖方。
