# AGENTS.md

> 管理后台项目 AI 编程助手入口。优先结合 `README.md`、`.agents/skills/`、`src/routes/`、`src/lib/server/` 与 `messages/*` 工作。

## 行为契约

普通新增、修改、修复任务开始前，先读 [应用开发 Skill](.agents/skills/hai-app-create/SKILL.md) 和 [开发规范与框架能力路由](.agents/skills/hai-app-create/development.md)；再按任务读取模块 Skill 及其相邻参考文件。架构/构建、审查、测试分别读取 hai-build、hai-app-review、hai-app-tests，不加载整个 skill 树。

- 对当前需求逐项检索 hai-framework 能力和已有实现，确认适用的公开 API 后优先复用；未安装模块先核对依赖与配置，不能因 Skill 已存在就假定已启用。框架不适用时说明具体限制与选用方案，不为覆盖清单引入无关模块。
- 按已安装版本的公开类型确认模块契约：生命周期模块按 init → use → close；core/serv/kit、纯函数/工厂与流按实际签名处理。返回 HaiResult 的操作先检查 success，不以 try/catch 代替判断；事务失败明确触发回滚。
- 边界输入做 schema 校验，服务端验证身份、租户与资源权限；SQL 动态值参数化，文件路径防逃逸。密钥不进入 PUBLIC_/VITE_ 变量、客户端代码和日志；敏感 token 不写 localStorage。
- 禁止 any、无说明的 as unknown as、console.log 和硬编码密钥；从包公开入口导入。注释中文、结构化日志英文并脱敏，用户文本走现有 i18n 并同步所有 locale。
- 完成时说明实际复用的框架能力、未采用的相关能力及原因、门禁结果；跨边界同步类型、配置、调用方、文档和测试。

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
