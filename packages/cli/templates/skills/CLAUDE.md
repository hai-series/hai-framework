# CLAUDE.md

@AGENTS.md

> Claude Code 项目指引。共享规范通过 `@AGENTS.md` 复用；共享参考资料位于 `.agents/skills/` 目录。

## 使用说明

- 本文件是 Claude Code 的原生项目级指引入口。
- 项目概述、核心规范、质量门禁与完成条件统一维护在 `AGENTS.md`；Claude Code 通过 `@AGENTS.md` 复用这些共享规范，避免双份文档漂移。
- 如果当前运行环境未自动展开 `@AGENTS.md`，必须先手动阅读 `AGENTS.md`，再开始修改代码或文档。
- 共享的模块与工作流参考资料维护在 `.agents/skills/` 中；需要具体用法时，可按路径阅读对应 `SKILL.md`。
- 当前模板为了保持单一 Skill 树，不额外生成 `.claude/skills/`；如需 Claude Code 的原生 project skills 自动发现，需要单独维护该目录。
