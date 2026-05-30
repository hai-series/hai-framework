# AGENTS.md

> 管理后台项目 AI 编程助手入口。详细 Skill 文件位于 `.agents/skills/`。

## 项目概述

本项目是 hai-framework 管理后台：SvelteKit 负责路由、页面、`hooks.server.ts` 和 API 端点；IAM、数据库、缓存等能力通过 `@h-ai/*` 模块初始化后使用。

## 核心规范

- 页面组件只负责渲染与交互；业务逻辑放在 `src/lib/server/services` 或模块 API。
- 认证授权使用 `@h-ai/iam` / `@h-ai/kit`；Web token 优先 httpOnly cookie。
- 所有用户可见文本走 `$lib/paraglide/messages.js`，同步 `messages/zh-CN.json` 与 `messages/en-US.json`。
- API 边界必须做 Zod 校验，HaiResult 错误用 kit response 转换。
- 禁止 `any`、`console.log`、硬编码密钥；代码注释中文，日志英文。

## 质量门禁

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm test:e2e
```

## 完成条件

- 修改页面、API、认证流程时同步测试、README 和 i18n。
- 修改公共模块用法时全局检索依赖方。
