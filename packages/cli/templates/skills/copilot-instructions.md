# GitHub Copilot 项目指令

> 本文件作为 GitHub Copilot 的项目级指引，指向 `.github/skills/` 中的详细 Skill 文件。

## 项目概述

本项目使用 [hai-framework](https://github.com/nic%(200hub/hai-framework) 构建，基于 SvelteKit 2 + Svelte 5 (Runes) + TailwindCSS 4 + DaisyUI 5 + TypeScript 5.7+。

## 技术栈要点

- **前端框架**：Svelte 5 (Runes: `$props()`, `$state()`, `$derived()`, `$effect()`)
- **路由/SSR**：SvelteKit 2（文件路由、Handle Hook、load 函数）
- **样式**：TailwindCSS 4 + DaisyUI 5
- **后端框架**：hai-framework (`@h-ai/core`, `@h-ai/kit`, `@h-ai/db`, `@h-ai/iam` 等)
- **统一模式**：`module.init(config) → use → module.close()`，所有操作返回 `Result<T, E>`
- **单元测试**：Vitest
- **E2E 测试**：Playwright
- **包管理**：pnpm

## 编码规范

- 禁止 `any`（使用 `unknown` + 缩窄）
- 禁止 `console.log`（使用 `core.logger`）
- 禁止硬编码密钥
- 用户可见文本必须走 i18n（`$lib/paraglide/messages.js`）
- Result 错误直接透传，不重新包装
- 框架模块公共 API 不抛异常，统一返回 `Result<T, E>`；不要用 `try/catch` 处理模块返回的错误
- 日志消息英文、简洁动宾结构
- 代码注释中文

## Skills 目录

详细的开发指南位于 `.github/skills/` 目录：

| Skill            | 说明                                                  |
| ---------------- | ----------------------------------------------------- |
| `hai-build`      | 项目架构、模块依赖、初始化顺序、编码标准              |
| `hai-core`       | 配置加载、日志、i18n、Result 模型、模块生命周期       |
| `hai-kit`        | SvelteKit 集成：Handle Hook、守卫、中间件、响应、校验 |
| `hai-ui`         | UI 组件库：三层架构、自动导入、主题、i18n             |
| `hai-db`         | 数据库操作：DDL、SQL、CRUD、事务、分页                |
| `hai-iam`        | 认证与权限：密码/OTP/LDAP、会话、RBAC                 |
| `hai-crypto`     | 加密：SM2/SM3/SM4、密码哈希、随机生成                 |
| `hai-cache`      | 缓存：内存/Redis、TTL、集合操作、分布式锁             |
| `hai-storage`    | 存储：本地/S3、上传下载、预签名 URL                   |
| `hai-ai`         | AI：LLM 调用、MCP 服务器、工具定义、流处理            |
| `hai-app-create` | TDD 驱动的功能创建（先测试后实现）                    |
| `hai-app-review` | 应用代码审查（含 TDD 合规检查）                       |
| `hai-app-tests`  | TDD 测试规范（Vitest 单元测试 + Playwright E2E）      |

## 开发流程

**必须遵循 TDD**：先写测试（Red）→ 确认失败 → 再实现（Green）→ 确认通过 → 重构（Refactor）。

## 质量门禁

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm --filter <app-name> test:e2e     # E2E 测试
```
