# CLAUDE.md

@AGENTS.md

> Claude Code H5 项目指引。共享规范通过 `@AGENTS.md` 复用；具体模块用法按需读取 `.agents/skills/`。

如果当前运行环境未自动展开 `@AGENTS.md`，必须先手动阅读 `AGENTS.md`，再开始修改代码或文档。

## 开始工作前

- 回复第一行保持：`规模: XS|S|M|L — <一句话意图>`。
- 任务规模 ≥ M 时，先输出 Q1-Q7 必要性自检与影响分析。
- 修改前先看 `src/routes/`、移动端导航、`messages/*` 与测试。

## H5 特有提醒

- 优先复用现有移动端布局、底部导航和 `@h-ai/ui` 组件。
- 页面文案、导航标签和错误提示都要同步 i18n。
- 不要把 `@h-ai/serv` / `@h-ai/api-client` / `@h-ai/capacitor` 当成当前 H5 样板的默认主架构。
