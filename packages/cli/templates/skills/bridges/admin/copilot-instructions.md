# GitHub Copilot 项目指令

> 管理后台工程指引。详细模块用法按需读取 `.agents/skills/`。

## 行为契约

- 每次响应第一行写：`规模: XS|S|M|L — <一句话意图>`。
- 任务规模 ≥ M 时，先输出 Q1-Q7 必要性自检与影响分析，再开始修改。
- 修改前先阅读 `AGENTS.md`、`README.md`、相关页面 / service / 测试与 `.agents/skills/*/SKILL.md`。

## 技术栈要点

- SvelteKit 2 + Svelte 5 Runes。
- `@h-ai/kit` 负责 SvelteKit handle、守卫、响应和校验。
- `@h-ai/iam` 负责登录、会话与 RBAC。
- UI 使用 TailwindCSS、DaisyUI 与 `@h-ai/ui`。

## 技术边界

- 页面 / layout / load 只做渲染、权限态和请求编排；业务逻辑放到 `src/lib/server/services` 或 `@h-ai/*` 模块。
- `+server.ts` 只能导出 handler 与官方允许的配置项；helper 放到 `src/lib/server/**`。
- 页面文本必须走 i18n。
- API 输入必须 Zod 校验，权限检查使用 kit guard。
- 公共模块 API 返回 `HaiResult<T>`，不要用 `try/catch` 包裹正常业务错误。
- 本样板默认不以 `@h-ai/serv` / `@h-ai/api-client` / `@h-ai/api-contract` 作为主架构。

## 开发流程

1. 先检索现有路由、service、共享组件、messages 和测试。
2. 修改认证、导航、CRUD、表单流程后，同步测试、README 和 i18n。
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

- 页面、API、认证相关改动同步更新测试、README 和 i18n。
- 最终交付说明要列出门禁状态、已更新页面 / API / 文档与未完成项。
