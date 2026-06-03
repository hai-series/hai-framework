# AGENTS.md

> 管理后台项目 AI 编程助手入口。优先结合 `README.md`、`.agents/skills/`、`src/routes/`、`src/lib/server/` 与 `messages/*` 工作。

## 行为契约

1. 每次响应第一行写：`规模: XS|S|M|L — <一句话意图>`。
2. 任务规模 ≥ M 时，先回顾相关路由、服务、测试、i18n 文案与 `.agents/skills/*/SKILL.md`。
3. 在写第一行新代码前，用 1 行回答 Q1-Q7 必要性自检。
4. 任务规模 ≥ M 时，说明将影响的页面、layout、API、认证流程、测试和文档。

## 必要性自检（M / L 任务必须输出）

- Q1：已有页面 / service / 模块 API 是否可复用？
- Q2：能否扩展现有 `src/lib/server/services`、`src/routes`、共享组件，而不是新建抽象？
- Q3：当前真实调用点是哪些页面、表单、API 或 guard？
- Q4：能否用更少的 route / load / helper / 组件解决？
- Q5：是否把 provider、DB 细节或中间态泄漏给页面层？
- Q6：是否与现有路由结构、i18n、权限模型和脚本一致？
- Q7：是否比较过更安全的鉴权、校验和数据处理方案？

## 影响分析（M / L 任务必须输出）

- 直接影响：哪些 `+page.svelte`、`+layout.svelte`、`+page.server.ts`、`+server.ts`、service、messages、README、测试会变。
- 间接影响：哪些角色权限、导航入口、共享组件、表单流程和依赖模块需要同步。

## 项目定位

本项目是 hai-framework 管理后台：SvelteKit 负责路由、页面、`hooks.server.ts` 和 API 端点；IAM、数据库、缓存等能力通过 `@h-ai/*` 模块初始化后使用。

## 架构边界

- 页面组件、layout、load 只负责渲染、权限态拼装和请求编排；业务逻辑放在 `src/lib/server/services` 或模块 API。
- 认证授权使用 `@h-ai/iam` / `@h-ai/kit`；Web token 优先 httpOnly cookie。
- 所有用户可见文本走 `$lib/paraglide/messages.js`，同步 `messages/zh-CN.json` 与 `messages/en-US.json`。
- API 边界必须做 Zod 校验，HaiResult 错误用 kit response 转换。
- `+server.ts` 只能导出 handler 和 SvelteKit 允许的配置项；helper 放到 `src/lib/server/**`。
- 本样板默认不使用 `@h-ai/serv`、`@h-ai/api-contract`、`@h-ai/api-client`、`@h-ai/capacitor` 作为主架构。

## 工作流程

1. 先搜索现有路由、service、共享组件、messages 和测试。
2. 变更权限、登录、会话、导航或 CRUD 页面时，优先扩展现有 service / component，而不是临时散落逻辑。
3. 修改页面、API、认证流程后，同步测试、README 和 i18n。

## 质量门禁

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm test:e2e
```

## 完成条件

- 修改页面、API、认证流程时同步测试、README 和 i18n。
- 修改公共模块用法或共享组件时，全局检索并同步依赖方。
- 最终回复说明门禁状态、已更新页面 / API / 文档与未完成项。

## 优先 Skills

- `hai-build`、`hai-app-create`、`hai-app-review`、`hai-app-tests`
- `hai-kit`、`hai-ui`、`hai-iam`、`hai-reldb`、`hai-cache`、`hai-crypto`
- 其它 `hai-*` 模块按需读取
