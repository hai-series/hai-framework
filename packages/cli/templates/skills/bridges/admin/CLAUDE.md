# CLAUDE.md

@AGENTS.md

> Claude Code 管理后台项目指引。共享规范通过 `@AGENTS.md` 复用；具体模块用法按需读取 `.agents/skills/`。

如果当前运行环境未自动展开 `@AGENTS.md`，必须先手动阅读 `AGENTS.md`，再开始修改代码或文档。

## 开始工作前

- 回复第一行保持：`规模: XS|S|M|L — <一句话意图>`。
- 任务规模 ≥ M 时，先输出 Q1-Q7 必要性自检与影响分析。
- 修改前先看 `src/routes/`、`src/lib/server/`、`messages/*` 与相关测试。

## 管理后台特有提醒

- 页面层只做渲染与请求编排，不把业务逻辑塞进 `+page.svelte`。
- 鉴权、guard、response 优先复用 `@h-ai/kit` / `@h-ai/iam`。
- 所有用户可见文本都要同步 i18n。
