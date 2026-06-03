# CLAUDE.md

@AGENTS.md

> Claude Code 项目指引。共享规范通过 `@AGENTS.md` 复用；本文件用于 generic fallback 场景，模块和工作流参考资料位于 `.agents/skills/`。

如果当前运行环境未自动展开 `@AGENTS.md`，必须先手动阅读 `AGENTS.md`，再开始修改代码或文档。

## 开始工作前

- 回复第一行保持：`规模: XS|S|M|L — <一句话意图>`。
- 任务规模 ≥ M 时，先输出 Q1-Q7 必要性自检与影响分析，再写代码。
- 修改前先看 `README.md`、相关测试和对应 `.agents/skills/*/SKILL.md`。

## 工作重点

- 优先复用现有实现，不为未来假设提前抽象。
- 若项目启用 SvelteKit，记住 `+server.ts` 不能导出自定义 helper。
- 若项目启用 i18n，用户可见文本必须同步多语言文件。

## 完成前检查

- 按影响范围运行 `pnpm typecheck`、`pnpm lint`、`pnpm build`、`pnpm test`、`pnpm test:e2e`。
- 在最终回复里说明门禁结果、文档 / 测试同步情况与未完成项。
