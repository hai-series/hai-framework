# GitHub Copilot 项目指令

> H5 移动端工程指引。详细模块用法按需读取 `.agents/skills/`。

## 行为契约

- 每次响应第一行写：`规模: XS|S|M|L — <一句话意图>`。
- 任务规模 ≥ M 时，先输出 Q1-Q7 必要性自检与影响分析，再开始修改。
- 修改前先阅读 `AGENTS.md`、`README.md`、相关页面 / messages / 测试与 `.agents/skills/*/SKILL.md`。

## 技术栈要点

- SvelteKit + Svelte 5 Runes。
- TailwindCSS / DaisyUI / `@h-ai/ui` 移动组件。
- Paraglide i18n。

## 技术边界

- 页面组件只负责渲染和交互；复杂业务逻辑放在服务层或模块 API。
- 移动端文案、导航和错误提示全部走 i18n。
- `+server.ts` 只能导出 handler 与官方允许的配置项；helper 放到 `src/lib/**`。
- 优先复用现有移动端导航与组件，不要引入不必要的桌面式交互。
- 禁止 `any`、`console.log`、硬编码密钥。

## 开发流程

1. 先检索现有移动端页面、导航、messages、API 和测试。
2. 修改导航、API 或认证流程时，同步 README、i18n 和测试。
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

- 页面、导航、API、i18n 与测试同步更新。
- 最终交付说明中列出门禁状态、受影响流程 / 文档与未完成项。
