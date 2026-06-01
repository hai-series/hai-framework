# AGENTS.md

> Fullstack 多包工程 AI 编程助手入口。详细 Skill 文件位于 `.agents/skills/`。

## 项目概述

本项目是 hai-framework fullstack 工作区：

- `packages/<project>-contract`：前后端共享 API contract、Zod schema 与类型。
- `packages/<project>-serv`：后端服务，使用 `@h-ai/serv` 实现业务 API。
- `packages/<project>-shared`：跨端共享 UI Shell、主题、语言切换和 typed API client。
- `apps/<project>-web`：Svelte 5 + Vite Web 前端。
- `apps/<project>-app`：Svelte 5 + Vite + Capacitor 移动端 SPA。
- `apps/<project>-desktop`：Svelte 5 + Vite + Tauri v2 桌面端。

前端只做 UI 与请求编排；后端业务逻辑放在 `packages/<project>-serv`，不要写进前端组件。

## 核心规范

- Contract、serv、shared、各端页面必须同步演进。
- 公共 API 返回 `HaiResult<T>`，错误直接透传，不重新包装。
- 用户可见文本走 i18n：shared 放跨端文案，各 app 放本端文案。
- 移动端 token 使用 Capacitor 安全存储；Web 使用 httpOnly cookie；桌面端按 Tauri 安全边界配置。
- 代码注释中文，日志消息英文；禁止 `any`、`console.log`、硬编码密钥。

## 质量门禁

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm test:e2e
```

涉及发布时还要运行：

```bash
pnpm compile
pnpm package
```

## 完成条件

- 修改 contract / serv / shared 后，全局检索并同步所有 `packages/*` 和 `apps/*`。
- 修改 Web/App/Desktop 页面时，同步对应 README、messages 和测试。
- 最终回复说明门禁状态、未执行项原因、已同步文档和依赖方。
