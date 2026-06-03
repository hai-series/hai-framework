# GitHub Copilot 项目指令

> API 服务工程指引。详细模块用法按需读取 `.agents/skills/`。

## 行为契约

- 每次响应第一行写：`规模: XS|S|M|L — <一句话意图>`。
- 任务规模 ≥ M 时，先输出 Q1-Q7 必要性自检与影响分析，再开始修改。
- 修改前先阅读 `AGENTS.md`、`README.md`、相关 route / config / 测试与 `.agents/skills/*/SKILL.md`。

## 技术栈要点

- `apps/*-contract` 维护 typed API contract、Zod schema 与共享类型。
- `apps/*-service` 基于 `@h-ai/serv` 装配 HTTP App、procedures 与模块初始化。
- `@h-ai/core` 提供配置、日志、i18n 与 HaiResult 基础能力。
- `@h-ai/api-client` 负责 typed client 调用与测试接入。

## 技术边界

- API 输入必须 Zod 校验。
- contract / service / typed client 必须共用同一份 contract 定义，不要复制路径或类型。
- 响应统一使用 HaiResult 约定，业务错误按 HaiResult 透传。
- 后端主架构使用 `@h-ai/serv` + `@h-ai/api-contract` + `@h-ai/api-client`，不要退回到 SvelteKit API routes。
- 禁止 UI 页面样板、`any`、`console.log`、硬编码密钥。
- 配置文件位于 `apps/*-service/config/`，service 入口与 procedures 位于 `apps/*-service/src/`。

## 开发流程

1. 先检索现有 contract、procedures、config 和测试。
2. 修改响应格式、安全头、错误码或环境变量说明时，同步 README、测试和调用方。
3. 不要把未运行或失败的门禁写成“已通过”。

## 质量门禁

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm test:e2e
```

## 完成条件

- API、配置和测试同步更新。
- 交付说明中列出门禁状态、受影响 route / 配置 / 文档与未完成项。
