# CLAUDE.md

@AGENTS.md

> Claude Code 企业官网项目指引。共享规范通过 `@AGENTS.md` 复用；具体模块用法按需读取 `.agents/skills/`。

如果当前运行环境未自动展开 `@AGENTS.md`，必须先手动阅读 `AGENTS.md`，再开始修改代码或文档。

## 开始工作前

- 回复第一行保持：`规模: XS|S|M|L — <一句话意图>`。
- 任务规模 ≥ M 时，先输出 Q1-Q7 必要性自检与影响分析。
- 修改前先看 `src/routes/`、`messages/*`、表单/API 与测试。

## 官网特有提醒

- 页面文案、导航、SEO 元信息与 i18n 需要一起维护。
- 优先复用现有 `@h-ai/ui` 组件，不要重复造轮子。
- 不要把 `@h-ai/serv` / `@h-ai/api-client` 当成默认官网主架构。
