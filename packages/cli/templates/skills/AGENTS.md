# AGENTS.md

> 通用 AI 编程助手入口。详细 Skill 文件位于 `.agents/skills/` 目录。

## 项目概述

本项目由 hai-framework CLI 生成，使用 TypeScript、Svelte 5 / SvelteKit（如适用）、Vitest 和 Playwright。实际架构以当前项目目录为准：单应用工程通常在 `src/` 下开发；多包工程会同时包含 `packages/*` 与 `apps/*`。

## 核心规范

- 统一模式：`module.init(config) -> use -> module.close()`，公共 API 返回 `HaiResult<T>`。
- 禁止 `any`、无说明的 `as unknown as T`、`console.log`、硬编码密钥。
- 用户可见文本走 i18n；新增文案同步 `zh-CN` 和 `en-US`。
- 代码注释中文，日志消息英文。
- 修改公共 API、contract、模板或共享类型后，必须全局检索并同步依赖方。

## 工作流程

- 先用 `rg` 搜索现有实现、引用点、测试和文档。
- 优先复用当前模板和 `.agents/skills/` 中的约定，不新增无真实调用点的抽象。
- 修改后按影响范围执行质量门禁。

## 质量门禁

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm test:e2e
```

## 完成条件

- 失败的门禁先修复，不能留下“已知失败”。
- README、`.agents/skills/**/SKILL.md`、i18n、代码注释与实现保持一致。
- 最终回复说明执行过的门禁、未执行项原因、已同步的文档和依赖方。

## Skills 参考

- `hai-build/SKILL.md`：架构、构建和质量门禁。
- `hai-app-create/SKILL.md`：SvelteKit 应用创建与扩展。
- `hai-app-review/SKILL.md`：应用代码审查。
- `hai-app-tests/SKILL.md`：Vitest / Playwright 测试规范。
- 具体模块按需读取对应 `hai-*` Skill。
