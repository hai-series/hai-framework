# GitHub Copilot 项目指令

> 本文件作为 GitHub Copilot 的项目级指引，指向 `.agents/skills/` 中的详细 Skill 文件。

## 项目概述

本项目使用 [hai-framework](https://github.com/nicehero/hai-framework) 构建，基于 SvelteKit 2 + Svelte 5 (Runes) + TailwindCSS 4 + DaisyUI 5 + TypeScript 5.7+。

## 技术栈要点

- **前端框架**：Svelte 5 (Runes: `$props()`, `$state()`, `$derived()`, `$effect()`)
- **SvelteKit 应用层**：使用文件系统路由、`+layout/+page`、`load` 与 `hooks.server.ts` 做 UI/请求编排；SSR/SPA/静态输出以具体 app 的 adapter 与配置为准
- **Fullstack 服务端**：前后端分离工程的业务 API 在 `packages/<project>-serv` 中通过 `@h-ai/serv` 实现；不要把服务端业务逻辑塞进 SvelteKit 页面、`load` 或前端组件
- **样式**：TailwindCSS 4 + DaisyUI 5
- **后端框架**：hai-framework (`@h-ai/core`, `@h-ai/kit`, `@h-ai/reldb`, `@h-ai/iam` 等)
- **统一模式**：`module.init(config) → use → module.close()`，所有操作返回 `HaiResult<T>`
- **单元测试**：Vitest
- **E2E 测试**：Playwright
- **包管理**：pnpm

## 编码规范

- 禁止 `any`（使用 `unknown` + 缩窄）
- 禁止 `console.log`（使用 `core.logger`）
- 禁止硬编码密钥
- `xx-main.ts` 仅做生命周期管理和 API 编排，禁止在 main 中编写具体业务逻辑（委托给 `xx-functions.ts` / `xx-runner.ts` 等）
- 用户可见文本必须走 i18n（`$lib/paraglide/messages.js`）
- HaiResult 错误直接透传，不重新包装
- 框架模块公共 API 不抛异常，统一返回 `HaiResult<T>`；不要用 `try/catch` 处理模块返回的错误
- 日志消息英文、简洁动宾结构
- 代码注释中文

## Skills 目录

详细的开发指南位于 `.agents/skills/` 目录：

| Skill            | 说明                                                  |
| ---------------- | ----------------------------------------------------- |
| `hai-build`      | 项目架构、模块依赖、初始化顺序、编码标准              |
| `hai-core`       | 配置加载、日志、i18n、HaiResult 模型、模块生命周期       |
| `hai-kit`        | SvelteKit 集成：`handle` hook、守卫、中间件、响应、校验 |
| `hai-ui`         | UI 组件库：三层架构、自动导入、主题、i18n             |
| `hai-reldb`      | 数据库操作：DDL、SQL、CRUD、事务、分页                |
| `hai-iam`        | 认证与权限：密码/OTP/LDAP、会话、RBAC                 |
| `hai-crypto`     | 加密：SM2/SM3/SM4、密码哈希、随机生成                 |
| `hai-cache`      | 缓存：内存/Redis、TTL、集合操作、分布式锁             |
| `hai-storage`    | 存储：本地/S3、上传下载、预签名 URL                   |
| `hai-ai`         | AI：LLM 调用、MCP 服务器、工具定义、流处理            |
| `hai-app-create` | TDD 驱动的功能创建（先测试后实现）                    |
| `hai-app-review` | 应用代码审查（含 TDD 合规检查）                       |
| `hai-app-tests`  | TDD 测试规范（Vitest 单元测试 + Playwright E2E）      |
| `hai-ci`         | CI/CD、GitHub Actions、质量门禁与 workflow 安全       |
| `hai-pr-review`  | PR / Issue 交付审查、AI Review 策略、CODEOWNERS 与合并门禁 |
| `hai-framework-sync` | hai-framework 模板源头与应用仓库同步            |

## 开发流程

**必须遵循 TDD**：先写测试（Red）→ 确认失败 → 再实现（Green）→ 确认通过 → 重构（Refactor）。

## 质量门禁

改动完成后按顺序执行，失败必须先修复，不能把已知失败留给下一轮：

1. `pnpm typecheck`
2. `pnpm lint`（可先 `pnpm lint:fix`，再重新执行 `pnpm lint`）
3. `pnpm build`（涉及构建产物、打包配置、前后端分离工程或发布路径时必须执行）
4. `pnpm test`
5. `pnpm --filter <app-or-package> test:e2e`（涉及 UI、路由、浏览器交互或端到端流程时必须执行）

优先使用 `pnpm --filter <workspace-name>` 缩小验证范围；跨包契约、共享类型或根配置变更必须提升到根命令验证。

## 完成条件

- **测试同步**：新增/修改功能必须补单元测试；UI、路由和关键用户流程必须补 E2E 或更新现有 E2E。
- **文档同步**：README、`.agents/skills/**/SKILL.md`、代码注释与实际行为保持一致；生成模板改动要同步模板与测试断言。
- **i18n 同步**：所有用户可见文本必须走 i18n，并同时更新 `zh-CN` 与 `en-US` 消息文件。
- **类型/契约同步**：公共类型、API contract、client、server procedure 与调用方必须一起更新，不能只改一端。
- **错误处理同步**：新增错误码、错误消息或 HaiResult 形态时，同步文档、测试和调用方处理逻辑。
- **依赖方传导**：修改共享包、公共 API 或模板后，用全局检索确认引用点，并更新受影响的 `packages/*`、`apps/*`、CLI 模板/脚手架。
- **完成报告**：最终回复必须列出 typecheck/lint/build/test/e2e 状态、已更新文档、已更新依赖方；未执行或未通过的项目必须说明原因与后续动作。
