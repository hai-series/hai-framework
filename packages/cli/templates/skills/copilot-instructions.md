# GitHub Copilot 项目指令

> 本文件作为 Copilot 项目级指引，详细用法按需读取 `.agents/skills/`。

## 通用约定

- 使用 hai-framework 的模块生命周期：`init(config) -> use -> close()`。
- 公共 API 返回 `HaiResult<T>` 或 `Promise<HaiResult<T>>`，业务错误不要直接 `throw`。
- 禁止 `any`、`console.log`、硬编码密钥。
- 用户可见文本必须走 i18n，并同步中英文消息文件。
- 代码注释中文，日志消息英文。

## 开发流程

1. 先用全局检索确认现有实现、引用点、测试和文档。
2. 按 `.agents/skills/` 中的对应 Skill 执行实现。
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

失败必须先修复；未执行项需要在交付说明中写明原因。
