# AGENTS.md

> 通用 AI 编程助手指引。详细 Skill 文件位于 `.agents/skills/` 目录。

## 项目概述

本项目使用 hai-framework 构建，基于 SvelteKit 2 + Svelte 5 (Runes) + TailwindCSS 4 + DaisyUI 5 + TypeScript 5.7+。

前后端分离工程中，SvelteKit app 主要负责 UI、路由与请求编排；业务 API 与服务端逻辑位于 `packages/<project>-serv`，通过 `@h-ai/serv` 实现。SSR、SPA 或静态输出以各 app 的 adapter 与配置为准，不要把 fullstack 后端业务逻辑写进 SvelteKit 页面、`load` 或前端组件。

## 核心规范

- 统一模式：`module.init(config) → use → module.close()`，所有操作返回 `HaiResult<T>`
- **TDD 驱动开发**：先写测试（Red）→ 确认失败 → 再实现（Green）→ 确认通过 → 重构（Refactor）
- 禁止 `any`（使用 `unknown` + 缩窄），禁止 `console.log`（使用 `core.logger`）
- 用户可见文本走 i18n，代码注释中文，日志英文
- HaiResult 错误直接透传，不重新包装
- 框架模块公共 API 不抛异常，统一返回 `HaiResult<T>`；不要用 `try/catch` 处理模块返回的错误
- 质量门禁按顺序执行：`pnpm typecheck` → `pnpm lint` → `pnpm build`（涉及构建/发布时）→ `pnpm test` → `pnpm --filter <workspace> test:e2e`（涉及 UI/路由/E2E 时）

## 完成条件

- 失败的质量门禁必须先修复；不能提交或回复“已知失败”的改动。
- 新增/修改功能要同步测试；UI、路由和关键用户流程要同步 E2E。
- README、`.agents/skills/**/SKILL.md`、代码注释、i18n 消息、公共类型/API contract 与实现保持一致。
- 修改共享包、公共 API、contract、client、server procedure 或 CLI 模板后，必须检索并更新所有受影响的 `packages/*`、`apps/*` 与脚手架模板。
- 最终回复必须报告 typecheck/lint/build/test/e2e 状态、已更新文档、已更新依赖方；未执行或未通过项要说明原因和下一步。

## Skills 参考

所有详细指南位于 `.agents/skills/` 目录，按需阅读：

- **入口**：`hai-build/SKILL.md` — 项目架构总览与 Skill 导航
- **框架模块**：`hai-core/`、`hai-kit/`、`hai-reldb/`、`hai-iam/`、`hai-crypto/`、`hai-cache/`、`hai-storage/`、`hai-ai/`
- **UI 组件**：`hai-ui/SKILL.md`
- **TDD 开发流程**：`hai-app-tests/`（TDD 测试先行）、`hai-app-create/`（TDD 实现）、`hai-app-review/`（TDD 重构审查）
- **仓库工程流程**：`hai-ci/`（CI/CD 与质量门禁）、`hai-pr-review/`（PR / Issue 交付审查与 AI Review）、`hai-framework-sync/`（两仓同步）
