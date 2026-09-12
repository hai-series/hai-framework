# AGENTS.md

> 管理后台项目 AI 编程助手入口。优先结合 `README.md`、`.agents/skills/`、`src/routes/`、`src/lib/server/` 与 `messages/*` 工作。

## 行为契约

先读 README、package.json、相关实现/测试和所需 .agents/skills；不要加载整个 skill 树。新增抽象前确认复用路径与真实需求；保留用户改动。跨文件任务简述影响和验证计划，无须固定规模标签或重复问卷。

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

先核对 package.json，按影响范围执行已有脚本；文档检查引用，UI/路由变更再运行 E2E。未运行项说明原因。

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
