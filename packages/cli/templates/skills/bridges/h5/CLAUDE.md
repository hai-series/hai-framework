# CLAUDE.md

@AGENTS.md

> Claude Code H5 项目指引。共享规范通过 `@AGENTS.md` 复用；具体模块用法按需读取 `.agents/skills/`。

共享规则见项目根 [AGENTS.md](AGENTS.md)；若未自动加载，先读取该文件。模块/流程按需读取项目根 .agents/skills/<name>/SKILL.md 及其相邻参考文件。

## 质量门禁

按 AGENTS.md 和实际 package.json 选择 typecheck、lint、build、test、test:e2e；最终说明已执行结果、未运行原因及同步文档/依赖方。

普通新增、修改、修复任务先读 [应用开发 Skill](.agents/skills/hai-app-create/SKILL.md) 和 [开发规范与框架能力路由](.agents/skills/hai-app-create/development.md)，依照 AGENTS.md 的默认规则复用框架并完成安全与质量验证。

Claude Code 从 `.claude/skills/` 原生发现技能入口，再读取 `.agents/skills/` 的共享正文与相邻参考。项目规则通过 `@AGENTS.md` 加载；同名技能不在入口目录另维护一份规则。
