# AGENTS.md

> 企业官网项目 AI 编程助手入口。详细 Skill 文件位于 `.agents/skills/`。

## 项目概述

本项目是 hai-framework 企业官网模板，重点是 SvelteKit 页面、SEO、i18n、表单/API 边界和可部署构建产物。

## 核心规范

- 页面内容与导航文案全部走 i18n，同步中英文 messages。
- 表单和 API 输入必须 Zod 校验。
- UI 组件优先使用 `@h-ai/ui`，不要重复实现已有组件。
- 代码注释中文，日志消息英文；禁止 `any`、`console.log`、硬编码密钥。

## 质量门禁

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm test:e2e
```

## 完成条件

- 修改页面时同步 README、i18n、测试和 SEO 相关元信息。
