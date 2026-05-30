# AGENTS.md

> API 服务项目 AI 编程助手入口。详细 Skill 文件位于 `.agents/skills/`。

## 项目概述

本项目是 hai-framework API 服务模板，无 UI 和页面 i18n。重点是 SvelteKit API routes、模块初始化、配置校验、HTTP 安全头、输入校验和 HaiResult 错误传递。

## 核心规范

- API 边界必须 Zod 校验。
- 公共模块 API 返回 `HaiResult<T>`；业务错误不要直接 `throw`。
- 不生成用户页面；不要引入 UI 专属依赖或页面文案。
- 配置和密钥来自 `config/` 与环境变量，禁止硬编码。
- 代码注释中文，日志消息英文；禁止 `any`、`console.log`。

## 质量门禁

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm test:e2e
```

## 完成条件

- 修改 API contract 或响应格式时，同步测试、README 和调用方。
