# GitHub Copilot 项目指令

> Capacitor Mobile App 工程指引。详细模块用法按需读取 `.agents/skills/`。

## 行为契约

- 每次响应第一行写：`规模: XS|S|M|L — <一句话意图>`。
- 任务规模 ≥ M 时，先输出 Q1-Q7 必要性自检与影响分析，再开始修改。
- 修改前先阅读 `AGENTS.md`、`README.md`、相关页面 / 原生桥接 / 测试与 `.agents/skills/*/SKILL.md`。

## 技术栈要点

- Svelte 5 + Vite SPA（无 SvelteKit）。
- Capacitor Android/iOS 原生壳。
- `@h-ai/capacitor` 负责原生能力和安全 token 存储。
- `@h-ai/api-client` 负责 typed API 调用。

## 技术边界

- 不新增 `+page.svelte` / `+layout.svelte` / `hooks.server.ts` 等 SvelteKit 文件。
- 原生能力封装在 `src/lib/capacitor.ts` 或 service，不写进页面模板。
- 原生 token 使用安全存储；Web 预览不要落到不安全持久化存储。
- 页面文本走 i18n。
- 禁止 `any`、`console.log`、硬编码密钥。

## 开发流程

1. 先检索现有页面、store、原生桥接、API client、messages 和测试。
2. 修改原生能力、权限、登录态或 API 流程时，同步 README、i18n 和测试。
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

- 页面、原生桥接、API、i18n 与测试同步更新。
- 交付说明中列出门禁状态、受影响的设备能力 / 文档与未完成项。