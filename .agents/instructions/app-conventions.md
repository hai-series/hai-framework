# 应用层开发规范

> 适用于 apps/ 下的文件的修改。适用于 SvelteKit 应用、纯 Svelte/Vite 客户端与 API service workspace；其中 SvelteKit 专属规则仅在使用 Kit 的应用中生效。

## 分层约束

- **禁止在 UI 层写业务逻辑**：组件只负责渲染和用户交互，业务逻辑放在 services / stores
- **禁止在 services 层写 UI 代码**：services 不引用 Svelte 组件或 DOM API
- 数据库/加密/存储等底层操作一律通过 @h-ai 模块调用，不直接操作

## SvelteKit 控制流

- `throw redirect()` / `throw error()` 等 SvelteKit 框架约定的控制流是合规用法
- 在 `+page.server.ts` / `+layout.server.ts` / `hooks.server.ts` 中使用

## i18n 规则

- 所有用户可见字符串必须使用 i18n key（标题、Toast、Alert、按钮、校验提示、错误信息）
- 翻译文件位于 `messages/{zh-CN,en-US,ja-JP}.json`
- ❌ 禁止直接修改 `src/lib/paraglide` 生成文件

## @h-ai/ui 组件使用

- @h-ai/ui 场景组件（`scenes/`）内置中英日文翻译，自动响应全局 locale
- **应用层只管页面级文本**：标题、错误提示、导航等由应用层 i18n 处理
- **不要把页面翻译样板传给 UI 组件**：组件内部默认文本由 @h-ai/ui 统一管理
- 可选覆盖：仅使用组件显式提供的 `submitText` / `placeholderText` 等 props 覆盖特定文本
- @h-ai/ui 已有组件不得重复实现
- 翻译文件位于 `packages/ui/src/lib/messages/{zh-CN,en-US,ja-JP}.json`

## 路由与端点安全

- API 端点优先通过 `kit.handler` / 全局 handle 设置 CORS、CSP、X-Content-Type-Options；自定义 Response 时补齐安全头
- 用户输入必须 Zod schema 校验后才进入业务层
- Web 认证沿用 Cookie / 内存 access token + httpOnly refresh cookie 的实际流程；移动/桌面使用安全 TokenStore；禁止 localStorage 存敏感 token
- 文件操作 API 必须校验路径合法性，禁止 `../` 逃逸

## 环境变量

- `.env.example` 完整列出可用字段、用途、默认值、枚举与范围；`.env` 为公共基础，`.env.dev` / `.env.test` / `.env.prod` 为公共环境覆盖，均提交 Git。`.env.local` 保存本机共享私有覆盖，`.env.<mode>.local` 保存模式私有值，均不提交 Git。
- 统一优先级为进程 > `.env.<mode>.local` > `.env.local` > `.env.<mode>` > `.env` > YAML。同源父 JSON 为基础，细项覆盖；高来源整段替换清掉低来源细项。Vite 在 Node 配置阶段通过 `core.config.loadEnvFiles` 读取并检查结果，Node 启动脚本复用 `scripts/run-node.mjs`，避免原生多 `--env-file` 遗留低来源细项；`core.init` 不自行读取 dotenv。完整约定见 [环境配置](../../packages/cli/templates/skills/hai-app-create/development.md#环境配置)。
- YAML 使用 `HAI_<配置名>_<字段路径>` 显式引用；camelCase 不拆词，数组使用从零开始的索引。运行参数、示例应用、CLI 模板与模块文档使用相同变量名，并保留 Schema 校验。
- 禁止硬编码 API Key / 密钥
- `PUBLIC_` / `VITE_` 前缀仅用于客户端安全的变量
- SvelteKit 服务端密钥使用 `$env/static/private` 或 `$env/dynamic/private`，其他 Node 入口使用已注入的进程环境。
