# GitHub Copilot 项目指令

> H5 移动端工程指引。详细模块用法按需读取 `.agents/skills/`。

## 技术栈要点

- SvelteKit + Svelte 5 Runes。
- TailwindCSS / DaisyUI / `@h-ai/ui` 移动组件。
- Paraglide i18n。

## 编码规范

- 页面组件只负责渲染和交互。
- 移动端文案、导航和错误提示全部走 i18n。
- 禁止 `any`、`console.log`、硬编码密钥。

## 质量门禁

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm test:e2e
```
