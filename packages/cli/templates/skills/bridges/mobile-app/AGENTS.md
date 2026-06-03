# AGENTS.md

> Capacitor Mobile App 项目 AI 编程助手入口。优先结合 `README.md`、`.agents/skills/`、`src/`、`messages/*` 与移动端测试工作。

## 行为契约

1. 每次响应第一行写：`规模: XS|S|M|L — <一句话意图>`。
2. 任务规模 ≥ M 时，先回顾现有页面、原生桥接、API 调用、messages、测试与 `.agents/skills/*/SKILL.md`。
3. 在写第一行新代码前，用 1 行回答 Q1-Q7 必要性自检。
4. 任务规模 ≥ M 时，说明将影响的页面、状态管理、原生桥接、API、messages、README 和测试。

## 必要性自检（M / L 任务必须输出）

- Q1：已有页面、store、service、Capacitor 封装是否可复用？
- Q2：能否扩展现有 `src/lib/capacitor.ts`、service 或组件，而不是新建抽象层？
- Q3：当前真实调用点是哪些页面、原生能力或 API 流程？
- Q4：能否用更少的 page、store、helper 解决？
- Q5：是否把原生桥接、token 或 API 细节泄漏给页面层？
- Q6：是否与现有 Svelte 5 + Vite + Capacitor 目录、脚本和 i18n 一致？
- Q7：是否比较过更安全的存储、权限和网络调用方案？

## 影响分析（M / L 任务必须输出）

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
3. 每次改动后运行质量门禁，不能留下“已知失败”。

## 质量门禁

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