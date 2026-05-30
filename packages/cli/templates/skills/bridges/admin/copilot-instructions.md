# GitHub Copilot 项目指令

> 管理后台工程指引。详细模块用法按需读取 `.agents/skills/`。

## 技术栈要点

- SvelteKit 2 + Svelte 5 Runes。
- `@h-ai/kit` 负责 SvelteKit handle、守卫、响应和校验。
- `@h-ai/iam` 负责登录、会话与 RBAC。
- UI 使用 TailwindCSS、DaisyUI 与 `@h-ai/ui`。

## 编码规范

- 页面文本必须走 i18n。
- API 输入必须 Zod 校验，权限检查使用 kit guard。
- 公共模块 API 返回 `HaiResult<T>`，不要用 `try/catch` 包裹正常业务错误。
- 禁止 `any`、`console.log`、硬编码密钥。

## 质量门禁

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm test:e2e
```
