# GitHub Copilot 项目指令

> Fullstack 工程指引。详细模块用法按需读取 `.agents/skills/`。

## 行为契约

- 每次响应第一行写：`规模: XS|S|M|L — <一句话意图>`。
- 任务规模 ≥ M 时，先输出 Q1-Q7 必要性自检与影响分析，再开始修改。
- 修改前先阅读 `AGENTS.md`、`README.md`、相关 `packages/*` / `apps/*` / 测试与 `.agents/skills/*/SKILL.md`。

## 技术栈要点

- Contract：`packages/<project>-contract` 定义 API contract、schema 与共享类型。
- Fullstack 服务端：`packages/<project>-serv` 使用 `@h-ai/serv` 实现业务 API。
- Shared：`packages/<project>-shared` 放跨端 Shell、i18n、主题和 typed API client。
- Web：Svelte 5 + Vite 前端。
- App：Svelte 5 + Vite + Capacitor 原生壳。
- Desktop：Svelte 5 + Vite + Tauri v2 纯客户端壳。

不要把后端业务逻辑写进 Svelte 前端组件。

## 技术边界

- 公共 API 返回 `HaiResult<T>`；业务错误不要直接 `throw`。
- Contract、serv procedure、shared client 与各端调用方必须一起更新。
- 用户可见文本走 i18n，shared 与各端 messages 分工清晰。
- Web/App/Desktop 前端只做 UI 与请求编排；后端逻辑放在 Fullstack 服务端。
- 禁止 `any`、`console.log`、硬编码密钥。
- 代码注释中文，日志消息英文。

## 开发流程

1. 先检索相关 package、app、workspace 脚本、messages 和测试。
2. 修改公共契约后，全局检索并更新所有受影响的 `packages/*`、`apps/*` 和 CLI 模板。
3. 修改 App / Desktop 时，同时检查 Capacitor / Tauri v2 原生壳配置与打包脚本。
4. 不要把未运行或失败的门禁写成“已通过”。

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

## 完成条件

- README、`.agents/skills/**/SKILL.md`、i18n、测试与实现同步。
- 修改公共契约后，全局检索并更新所有受影响的 `packages/*`、`apps/*` 和 CLI 模板。
- 交付说明中列出门禁状态、受影响 package/app 与未完成项。
