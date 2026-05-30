# GitHub Copilot 项目指令

> API 服务工程指引。详细模块用法按需读取 `.agents/skills/`。

## 技术栈要点

- SvelteKit API routes。
- `@h-ai/core` 配置、日志、i18n 和 HaiResult 基础能力。
- 可选模块按 `.agents/skills/hai-*/SKILL.md` 使用。

## 编码规范

- API 输入必须 Zod 校验。
- 响应统一使用模板中的响应模式，业务错误按 HaiResult 转换。
- 禁止 UI 页面样板、`any`、`console.log`、硬编码密钥。

## 质量门禁

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm test:e2e
```
