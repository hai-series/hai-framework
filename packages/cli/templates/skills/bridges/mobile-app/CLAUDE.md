# CLAUDE.md

@AGENTS.md

> Claude Code Capacitor Mobile App 项目指引。共享规范通过 `@AGENTS.md` 复用；具体模块用法按需读取 `.agents/skills/`。

如果当前运行环境未自动展开 `@AGENTS.md`，必须先手动阅读 `AGENTS.md`，再开始修改代码或文档。

## 开始工作前

- 回复第一行保持：`规模: XS|S|M|L — <一句话意图>`。
- 任务规模 ≥ M 时，先输出 Q1-Q7 必要性自检与影响分析。
- 修改前先看 `src/`、`src/lib/capacitor.ts`、API client、messages 和测试。

## Mobile/Capacitor 特有提醒

- 本项目是 Svelte 5 + Vite，不是 SvelteKit；不要新建 `+page.svelte`、`hooks.server.ts` 等文件。
- 设备能力与 token 存储放在原生桥接 / service 层，不要散落进页面模板。
- 页面文本、错误提示和设置项都要同步 i18n。