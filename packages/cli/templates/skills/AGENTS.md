# AGENTS.md

> 通用 AI 编程助手入口。优先阅读 `README.md`、现有测试与 `.agents/skills/`；本文件同时作为 `hai add` / AI 支持回填时的 generic fallback。

## 行为契约

先读 README、package.json、相关实现/测试和所需 .agents/skills；不要加载整个 skill 树。新增抽象前确认复用路径与真实需求；保留用户改动。跨文件任务简述影响和验证计划，无须固定规模标签或重复问卷。

- 直接影响：修改 / 新建 / 删除哪些文件；哪些脚本、类型、配置或路由会变。
- 间接影响：哪些测试、README、i18n、示例、共享类型、依赖方需要同步更新。

## 项目概述

本项目由 hai-framework CLI 生成。单应用工程通常在 `src/` 下开发；多包工程会同时包含 `packages/*` 与 `apps/*`。实际结构以当前项目目录为准。

## 通用硬约束

- 先用全局检索确认是否已有实现、测试和文档；优先复用，避免为“未来可能”新增抽象。
- 生命周期模块按 init → use → close；core/serv/kit/纯函数和流式 API 按实际签名使用。返回 HaiResult 的业务操作先检查 success，不以 try/catch 代替判断。
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

先核对 package.json，按影响范围执行已有脚本；文档检查引用，UI/路由变更再运行 E2E。未运行项说明原因。

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

- `.agents/skills/hai-build/SKILL.md`：架构、构建和质量门禁。
- `.agents/skills/hai-app-create/SKILL.md`：应用骨架、路由、页面与 API 模板。
- `.agents/skills/hai-app-review/SKILL.md`：应用代码审查。
- `.agents/skills/hai-app-tests/SKILL.md`：Vitest / Playwright 测试策略。
- 具体模块按需读取对应 `hai-*` Skill。
