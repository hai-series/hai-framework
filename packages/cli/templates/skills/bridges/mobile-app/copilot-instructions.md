# GitHub Copilot 项目指令

> Capacitor Mobile App 工程指引。详细模块用法按需读取 `.agents/skills/`。

## 技术栈要点

- Svelte 5 + Vite SPA（无 SvelteKit）。
- Capacitor Android/iOS 原生壳。
- `@h-ai/capacitor` 原生能力和安全 token 存储。
- `@h-ai/api-client` typed API 调用。

## 编码规范

- 不新增 `+page.svelte` / `+layout.svelte` / `hooks.server.ts` 等 SvelteKit 文件。
- 原生能力封装在 `src/lib/capacitor.ts` 或服务层，不写进页面模板。
- 页面文本走 i18n。
- 禁止 `any`、`console.log`、硬编码密钥。

## 质量门禁

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm test:e2e
```