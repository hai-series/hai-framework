# AGENTS.md

> 通用 AI 编程助手指引。详细 Skill 文件位于 `.github/skills/` 目录。

## 项目概述

本项目使用 hai-framework 构建，基于 SvelteKit 2 + Svelte 5 (Runes) + TailwindCSS 4 + DaisyUI 5 + TypeScript 5.7+。

## 核心规范

- 统一模式：`module.init(config) → use → module.close()`，所有操作返回 `Result<T, E>`
- 禁止 `any`（使用 `unknown` + 缩窄），禁止 `console.log`（使用 `core.logger`）
- 用户可见文本走 i18n，代码注释中文，日志英文
- Result 错误直接透传，不重新包装
- 质量门禁：`pnpm typecheck && pnpm lint && pnpm test`

## Skills 参考

所有详细指南位于 `.github/skills/` 目录，按需阅读：

- **入口**：`hai-build/SKILL.md` — 项目架构总览与 Skill 导航
- **框架模块**：`hai-core/`、`hai-kit/`、`hai-db/`、`hai-iam/`、`hai-crypto/`、`hai-cache/`、`hai-storage/`、`hai-ai/`
- **UI 组件**：`hai-ui/SKILL.md`
- **开发流程**：`hai-app-create/`（创建功能）、`hai-app-review/`（代码审查）、`hai-app-tests/`（测试）
