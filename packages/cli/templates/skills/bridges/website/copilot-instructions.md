# GitHub Copilot 项目指令

> 企业官网工程指引。详细模块用法按需读取 `.agents/skills/`。

## 行为契约

- 每次响应第一行写：`规模: XS|S|M|L — <一句话意图>`。
- 任务规模 ≥ M 时，先输出 Q1-Q7 必要性自检与影响分析，再开始修改。
- 修改前先阅读 `AGENTS.md`、`README.md`、相关页面 / messages / 测试与 `.agents/skills/*/SKILL.md`。

## 技术栈要点

- SvelteKit 页面与路由。
- TailwindCSS / DaisyUI / `@h-ai/ui`。
- Paraglide i18n，messages 位于 `messages/zh-CN.json` 与 `messages/en-US.json`。

## 技术边界

- 所有页面文案走 i18n。
- 表单/API 输入使用 Zod 校验。
- `+server.ts` 只能导出 handler 与官方允许的配置项；helper 放到 `src/lib/**`。
- 页面内容、SEO 元信息和测试要一起维护。
- 禁止 `any`、`console.log`、硬编码密钥。

## 开发流程

1. 先检索现有页面、组件、messages、表单/API 和测试。
2. 修改页面或 SEO 相关实现时，同步 README、i18n、测试和元信息。
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

- 页面、表单、SEO、i18n 与测试同步更新。
- 最终交付说明中列出门禁状态、受影响页面 / 文档与未完成项。
