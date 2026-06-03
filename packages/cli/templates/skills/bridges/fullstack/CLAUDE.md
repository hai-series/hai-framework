# CLAUDE.md

@AGENTS.md

> Claude Code fullstack 项目指引。共享规范通过 `@AGENTS.md` 复用；contract、serv、shared、Web/App/Desktop 的详细做法按需读取 `.agents/skills/`。

如果当前运行环境未自动展开 `@AGENTS.md`，必须先手动阅读 `AGENTS.md`，再开始修改代码或文档。

## 开始工作前

- 回复第一行保持：`规模: XS|S|M|L — <一句话意图>`。
- 任务规模 ≥ M 时，先输出 Q1-Q7 必要性自检与影响分析。
- 修改前先看相关 `packages/*`、`apps/*`、workspace 脚本、messages 和测试。

## Fullstack 特有提醒

- `packages/<project>-serv` 才是后端业务逻辑主场，不要把逻辑写进前端组件。
- contract、shared client、各端页面改动必须成套同步。
- App/Desktop 还要关注 Capacitor / Tauri 的原生壳配置与打包脚本。
