---
applyTo: "apps/**"
---

# 应用层开发规范

> 编辑 apps/ 下的文件时自动激活。SvelteKit 应用层的架构、i18n、UI 组件使用等规范。

## 分层约束

- **禁止在 UI 层写业务逻辑**：组件只负责渲染和用户交互，业务逻辑放在 services / stores
- **禁止在 services 层写 UI 代码**：services 不引用 Svelte 组件或 DOM API
- 数据库/加密/存储等底层操作一律通过 @h-ai 模块调用，不直接操作

## SvelteKit 控制流

- `throw redirect()` / `throw error()` 等 SvelteKit 框架约定的控制流是合规用法
- 在 `+page.server.ts` / `+layout.server.ts` / `hooks.server.ts` 中使用

## i18n 规则

- 所有用户可见字符串必须使用 i18n key（标题、Toast、Alert、按钮、校验提示、错误信息）
- 翻译文件位于 `messages/{zh-CN,en-US}.json`
- ❌ 禁止直接修改 `src/lib/paraglide` 生成文件

## @h-ai/ui 组件使用

- @h-ai/ui 场景组件（`scenes/`）内置中英文翻译，自动响应全局 locale
- **应用层只管页面级文本**：标题、错误提示、导航等由应用层 i18n 处理
- **不要为 UI 组件传入翻译 props**：组件内部文本由 @h-ai/ui 统一管理
- 可选覆盖：通过 `submitText` 等 props 覆盖特定文本
- @h-ai/ui 已有组件不得重复实现
- 翻译文件位于 `packages/ui/src/lib/messages/{zh-CN,en-US}.json`

## 路由与端点安全

- API 端点应设置 CORS、CSP、X-Content-Type-Options 响应头
- 用户输入必须 Zod schema 校验后才进入业务层
- token 存储使用 httpOnly cookie，禁止 localStorage 存敏感 token
- 文件操作 API 必须校验路径合法性，禁止 `../` 逃逸

## 环境变量

- 禁止硬编码 API Key / 密钥
- `PUBLIC_` 前缀仅用于客户端安全的变量
- 服务端密钥使用 `$env/static/private` 或 `$env/dynamic/private`
