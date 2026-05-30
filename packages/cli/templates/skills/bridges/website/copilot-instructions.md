# GitHub Copilot 项目指令

> 企业官网工程指引。详细模块用法按需读取 `.agents/skills/`。

## 技术栈要点

- SvelteKit 页面与路由。
- TailwindCSS / DaisyUI / `@h-ai/ui`。
- Paraglide i18n，messages 位于 `messages/zh-CN.json` 与 `messages/en-US.json`。

## 编码规范

- 所有页面文案走 i18n。
- 表单/API 输入使用 Zod 校验。
- 禁止 `any`、`console.log`、硬编码密钥。

## 质量门禁

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm test:e2e
```
