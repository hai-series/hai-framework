# @h-ai/kit

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/core](../core/README.md) · [@h-ai/crypto](../crypto/README.md) · [@h-ai/iam](../iam/README.md)

`@h-ai/kit` 是 hai-framework 的 SvelteKit 集成模块，提供统一的请求管道与同源 endpoint 工具：

运行时统一通过 `kit.xx` 使用。根入口公开 `KitFunctions`（服务端）和 `BrowserKitFunctions`（浏览器）命名空间类型，浏览器条件入口的 `kit` 仅包含客户端、CRUD、页面 Token 与默认语言操作。`AuthCookieWriter` 是服务端认证对当前请求 Cookie 的最小写入契约。导出这些方法或命名空间时，可直接生成消费者声明，无需导入内部 helper。

- `kit.createHandle()`：会话解析、路由守卫、中间件链、可选传输加密与 Cookie 加密
- `kit.handler()`：API 端点异常边界
- `kit.guard` / `kit.response` / `kit.validate` / `kit.auth` / `kit.client` / `kit.crud`

> 公共跨端 HTTP API contract 统一放在 `@h-ai/api-contract`，由 `@h-ai/serv` 挂载，客户端通过 `@h-ai/api-client` typed client 调用；`@h-ai/kit` 不定义也不承载业务 API contract。

## 快速开始

`sequence` 保留并组合 SvelteKit 的 `resolve` 选项：页面转换由内向外执行，`preload` 与序列化响应头过滤使用首个配置，确保 i18n 的 HTML 语言标记正确替换。

### 安装

```bash
npm install @h-ai/kit @h-ai/core sm-crypto@0.5.8
npm install svelte @sveltejs/kit zod
npm install -D @sveltejs/vite-plugin-svelte vite
```

### 项目配置

**vite.config.ts**：

```ts
import adapter from '@sveltejs/adapter-node'
import { sveltekit } from '@sveltejs/kit/vite'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    sveltekit({
      adapter: adapter(),
      preprocess: [
        vitePreprocess()
      ],
      compilerOptions: { runes: true },
      // 绝对路径保持 SSR 与浏览器端认证、加密路径一致。
      paths: { base: '', relative: false },
    }),
    tailwindcss(),
  ],
  optimizeDeps: {
    exclude: ['bits-ui']
  },
  ssr: {
    noExternal: ['@h-ai/ui', '@h-ai/kit'],
    external: ['@h-ai/core', 'sm-crypto']
  },
})
```

使用 Crypto 或依赖它的 Kit/IAM 时，应用生产依赖需包含 `sm-crypto@0.5.8`。CLI 已配好这一项；手工接入时运行 `pnpm add sm-crypto@0.5.8`。仅设置 external 不够，adapter-node 还需要这项直接依赖声明才能保留原包加载。

## 配置清单

生成项目使用 `config/_kit.yml`。应用将解析后的配置传入 SvelteKit 的 hook、客户端和构建适配器。

在[模块配置清单](../../docs/usage/configuration/kit.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

在[功能说明](../../docs/usage/function/kit.md)中查看调用示例、输入输出、错误处理与使用要点。

- `createHandle` / `sequence` / `middleware` / `guard` / `handler` — 组合 SvelteKit hooks、端点与权限检查
- `response` / `validate` / `crud` / `i18n` — 校验输入并生成结果、CRUD 配置和本地化内容
- `auth` / `client` / `createFeedbackHandler` — 连接认证、浏览器客户端和反馈接口
- `@h-ai/kit/adapter` / `@h-ai/kit/crypto` / `@h-ai/kit/a2a` — 配置构建适配器、传输加密和 A2A 路由

## 数据结构

模块没有自建数据库表。

查看[数据结构](../../docs/usage/data/kit.md)，了解请求上下文、Cookie 和应用侧持久化。

## 开发测试

```bash
pnpm --filter @h-ai/kit test
```

模块无统一 init/close；共享缓存、IAM 与 crypto 由应用启动时初始化并统一关闭。示例使用真实公开入口并作类型检查，见[模块 JSDoc 约定](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证)。请求认证必须调用 iam.auth.verifyToken，不能把非空 token 视为有效身份。

## 许可证

Apache-2.0
