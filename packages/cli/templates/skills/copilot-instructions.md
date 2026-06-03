# GitHub Copilot 项目指令

> 本文件作为 Copilot 项目级指引；当缺少 appType 专属桥接时，使用本文件作为 generic fallback。详细用法按需读取 `.agents/skills/`。

## 行为契约

- 每次响应第一行写：`规模: XS|S|M|L — <一句话意图>`。
- 任务规模 ≥ M 时，先输出 Q1-Q7 必要性自检与影响分析，再开始修改。
- 修改前先阅读 `README.md`、相关测试、`AGENTS.md` 与对应 `.agents/skills/*/SKILL.md`。
- 不要把未运行或失败的门禁写成“已通过”。

## 通用约定

- 使用 hai-framework 的模块生命周期：`init(config) -> use -> close()`。
- 公共 API 返回 `HaiResult<T>` 或 `Promise<HaiResult<T>>`，业务错误不要直接 `throw`。
- 禁止 `any`、`console.log`、硬编码密钥。
- 用户可见文本必须走 i18n，并同步中英文消息文件。
- 代码注释中文，日志消息英文。
- 若项目使用 SvelteKit，`+server.ts` 只能导出 handler 与官方允许的配置项。

## 开发流程

1. 先用全局检索确认现有实现、引用点、测试和文档。
2. 优先复用现有目录和模块，不新增无真实调用点的抽象。
3. 修改公共类型、API、模板或共享逻辑后，同步 README、测试和所有依赖方。

## 质量门禁

按影响范围执行：

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm test:e2e
```

## 完成条件

- 门禁失败必须先修复；未执行项要写明原因。
- README、i18n、测试、代码注释与实现保持一致。
- 最终交付说明中列出门禁状态、已同步文档与依赖方。
