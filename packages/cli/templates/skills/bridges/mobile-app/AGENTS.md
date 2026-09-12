# AGENTS.md

> Capacitor Mobile App 项目 AI 编程助手入口。优先结合 `README.md`、`.agents/skills/`、`src/`、`messages/*` 与移动端测试工作。

## 行为契约

先读 README、package.json、相关实现/测试和所需 .agents/skills；不要加载整个 skill 树。新增抽象前确认复用路径与真实需求；保留用户改动。跨文件任务简述影响和验证计划，无须固定规模标签或重复问卷。

- 直接影响：哪些页面、store、原生桥接、messages、README、测试和打包脚本会变。
- 间接影响：哪些 Android/iOS 权限、API 调用方、构建/打包流程和共享组件需要同步。

## 项目概述

本项目是 hai-framework Mobile/Capacitor 模板：直接使用 Svelte 5 + Vite 输出 SPA，Capacitor 负责 Android/iOS 原生壳和设备能力。

## 架构边界

- 不使用 SvelteKit 路由、server hooks 或 `@h-ai/kit`。
- 不新增 `+page.svelte`、`+layout.svelte`、`hooks.server.ts`、`src/routes/*` 等 SvelteKit 文件。
- 原生能力通过 `@h-ai/capacitor` 使用；token 原生端使用 Capacitor 安全存储，Web 预览仅使用内存存储。
- API 调用使用 `@h-ai/api-client`，业务错误按 HaiResult 处理。
- 页面文本走 i18n，同步中英文 messages。
- 原生桥接与设备调用放在 `src/lib/capacitor.ts` 或 service，避免散落在页面模板中。
- 本样板默认不使用 `@h-ai/core`、`@h-ai/kit`、`@h-ai/serv`、`@h-ai/api-contract` 作为主架构。

## 常用命令

```bash
pnpm build
pnpm cap:sync:android
pnpm cap:run:android
pnpm cap:build:android:debug
pnpm cap:build:android:release
```

## 工作流程

1. 先搜索现有页面、stores、原生桥接、API client、messages 和测试。
2. 修改原生能力、权限、登录态或 API 流程时，同步 README、i18n 和测试。
3. 按改动范围验证，修复本次引入的失败；已有问题与未运行项明确报告。

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

- 页面、原生桥接、API、i18n 与测试保持一致。
- 若改动影响打包 / 原生权限 / 设备能力，README 与脚本说明必须同步更新。
- 最终回复说明门禁状态、已更新移动端流程 / 文档与未完成项。

## 优先 Skills

- `hai-build`、`hai-app-review`、`hai-app-tests`
- `hai-ui`、`hai-api-client`、`hai-capacitor`
- 其它 `hai-*` 模块按需读取
