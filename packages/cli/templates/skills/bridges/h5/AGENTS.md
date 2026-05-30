# AGENTS.md

> H5 移动端项目 AI 编程助手入口。详细 Skill 文件位于 `.agents/skills/`。

## 项目概述

本项目是 hai-framework H5 模板，面向移动浏览器，重点是触屏布局、移动端导航、i18n、API 调用与端到端流程。

## 核心规范

- 使用移动端友好的布局和 `@h-ai/ui` 移动组件。
- 页面文本走 i18n，同步中英文 messages。
- 认证 token 不要写入不安全存储；按模板和 `hai-api-client` Skill 使用。
- API 输入必须校验，业务错误按 HaiResult 传递。
- 禁止 `any`、`console.log`、硬编码密钥。

## 质量门禁

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm test:e2e
```
