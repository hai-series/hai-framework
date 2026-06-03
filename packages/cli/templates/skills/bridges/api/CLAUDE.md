# CLAUDE.md

@AGENTS.md

> Claude Code API 服务项目指引。共享规范通过 `@AGENTS.md` 复用；具体模块用法按需读取 `.agents/skills/`。

如果当前运行环境未自动展开 `@AGENTS.md`，必须先手动阅读 `AGENTS.md`，再开始修改代码或文档。

## 开始工作前

- 回复第一行保持：`规模: XS|S|M|L — <一句话意图>`。
- 任务规模 ≥ M 时，先输出 Q1-Q7 必要性自检与影响分析。
- 修改前先看 `src/routes/api/**`、`src/lib/server/**`、配置文件和测试。

## API 特有提醒

- `+server.ts` 只能导出 handler 与允许的配置项。
- 输入校验、安全头、环境变量说明和错误响应要一起维护。
- 不要把 UI 页面、营销文案或客户端状态管理带进 API 项目。
