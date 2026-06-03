# AGENTS.md

> 通用 AI 编程助手入口。优先阅读 `README.md`、现有测试与 `.agents/skills/`；本文件同时作为 `hai add` / AI 支持回填时的 generic fallback。

## 行为契约

1. 每次响应第一行写：`规模: XS|S|M|L — <一句话意图>`。
2. 任务规模 ≥ M 时，先回顾 `README.md`、相关测试、现有 AI 指导文件与对应 `.agents/skills/*/SKILL.md`。
3. 在写第一行新代码前，用 1 行回答 Q1-Q7：复用对象、可扩展点、当前真实调用点、更简方案、知识泄漏、一致性、性能/安全对比。
4. 任务规模 ≥ M 时，同步说明直接/间接影响：文件、接口/类型、导入、测试、文档、依赖方。
5. 不能把未运行或失败的门禁写成“已通过”。

## 必要性自检（M / L 任务必须输出）

- Q1：仓库里是否已有同类能力可复用？
- Q2：能否扩展现有文件/模块，而不是新建抽象或目录？
- Q3：当前真实调用点是什么，不要为了“以后可能”而设计？
- Q4：有没有少一层、少一个参数、少一个文件的更简单方案？
- Q5：这次改动会不会让使用方必须了解新的内部细节？
- Q6：是否与当前项目命名、目录、脚本和对外暴露形式一致？
- Q7：是否已经比较过更高效或更安全的做法？

## 影响分析（M / L 任务必须输出）

- 直接影响：修改 / 新建 / 删除哪些文件；哪些脚本、类型、配置或路由会变。
- 间接影响：哪些测试、README、i18n、示例、共享类型、依赖方需要同步更新。

## 项目概述

本项目由 hai-framework CLI 生成。单应用工程通常在 `src/` 下开发；多包工程会同时包含 `packages/*` 与 `apps/*`。实际结构以当前项目目录为准。

## 通用硬约束

- 先用全局检索确认是否已有实现、测试和文档；优先复用，避免为“未来可能”新增抽象。
- 统一模式：`module.init(config) -> use -> module.close()`；公共 `@h-ai/*` API 返回 `HaiResult<T>` 或 `Promise<HaiResult<T>>`，业务错误不要直接 `throw`。
- 禁止 `any`、无说明的危险类型断言、`console.log`、硬编码密钥。
- 用户可见文本必须走 i18n；如果项目启用了 `messages/zh-CN.json` 与 `messages/en-US.json`，修改文案时必须同步更新。
- 代码注释中文，日志消息英文。
- 如项目使用 SvelteKit，`+server.ts` 只能导出 HTTP handler 与 SvelteKit 允许的配置项；辅助函数放到 `src/lib/**`。

## 工作流程

1. 先搜索现有实现、引用点、测试和 README。
2. 小步修改，优先保持目录结构、公开 API 和脚本稳定。
3. 改动公共类型、配置、模板或共享逻辑时，同步更新所有调用方与文档。
4. 每次改动后按影响范围运行质量门禁并记录结果。

## 质量门禁

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm test:e2e
```

## 完成条件

- typecheck / lint / build / test / test:e2e 状态明确；失败必须先修复或明确说明原因。
- README、i18n、测试、代码注释与实现保持一致。
- 最终回复说明执行过的门禁、已同步的文档 / 依赖方，以及未完成项。

## Skills 路由

- `hai-build/SKILL.md`：架构、构建和质量门禁。
- `hai-app-create/SKILL.md`：应用骨架、路由、页面与 API 模板。
- `hai-app-review/SKILL.md`：应用代码审查。
- `hai-app-tests/SKILL.md`：Vitest / Playwright 测试策略。
- 具体模块按需读取对应 `hai-*` Skill。
