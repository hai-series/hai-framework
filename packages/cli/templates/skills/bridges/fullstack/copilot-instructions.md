# GitHub Copilot 项目指令

> Fullstack 工程指引。详细模块用法按需读取 `.agents/skills/`。

## 技术栈要点

- Contract：`packages/<project>-contract` 定义 API contract、schema 与共享类型。
- Fullstack 服务端：`packages/<project>-serv` 使用 `@h-ai/serv` 实现业务 API。
- Shared：`packages/<project>-shared` 放跨端 Shell、i18n、主题和 typed API client。
- Web：SvelteKit Web 前端。
- App：SvelteKit adapter-static + Capacitor 原生壳。
- Desktop：Tauri v2 + Vite + Svelte 纯客户端壳。

不要把后端业务逻辑写进 Svelte 页面、`load` 或前端组件。

## 编码规范

- 公共 API 返回 `HaiResult<T>`；业务错误不要直接 `throw`。
- Contract、serv procedure、shared client 与各端调用方必须一起更新。
- 用户可见文本走 i18n，shared 与各端 messages 分工清晰。
- 禁止 `any`、`console.log`、硬编码密钥。
- 代码注释中文，日志消息英文。

## 质量门禁

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm test:e2e
pnpm compile
pnpm package
```

失败必须先修复；未执行项需要说明原因。

## 完成条件

- README、`.agents/skills/**/SKILL.md`、i18n、测试与实现同步。
- 修改公共契约后，全局检索并更新所有受影响的 `packages/*`、`apps/*` 和 CLI 模板。
