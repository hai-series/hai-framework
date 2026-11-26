# @h-ai/kit

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/core](../core/README.md) · [@h-ai/crypto](../crypto/README.md) · [@h-ai/iam](../iam/README.md)

`@h-ai/kit` 为 SvelteKit 项目处理请求、校验身份和编写 API。页面和 API 由同一站点提供时，可以直接通过当前网站地址调用 API。

在 SvelteKit 服务端从 `@h-ai/kit` 导入 `kit`，用 `kit.createHandle()` 创建请求处理函数。浏览器代码从 `@h-ai/kit/client` 导入客户端、列表和表单工具、页面令牌操作和语言设置。根入口的命名空间类型为服务端 `KitFunctions` 和浏览器 `BrowserKitFunctions`。`AuthCookieWriter` 描述服务端认证需要的 Cookie 写入方法，例如登录后设置当前请求响应里的 Cookie。

- `kit.createHandle()`：会话解析、路由守卫、中间件链、可选传输加密与 Cookie 加密
- `kit.handler()`：API 端点异常边界
- `kit.guard` / `kit.response` / `kit.validate` / `kit.auth` / `kit.client` / `kit.crud`
- `kit.guard.matchPermission()` 用于页面判断是否显示操作。服务端通过 `kit.guard.require()` 校验请求权限。
- `kit.crud.resolveText()` 和 `kit.crud.resolveOptions()` 在渲染列表和表单时解析文案与选项。
- A2A 由服务端将 `ai.a2a.createHttpHandler()` 交给 `kit.createHandle({ a2a })`；`kit.crypto` 从服务端调用，`@h-ai/kit/adapter` 用于构建。

独立的跨端 HTTP 服务可用 `@h-ai/api-contract` 声明契约、`@h-ai/serv` 装配路由，再由 `@h-ai/api-client` 提供类型化调用。

## 快速开始

使用 pnpm 安装：`pnpm add @h-ai/kit`。

[跟着最小示例完成接入](../../docs/usage/getting-started/kit.md#quick-start)。 [依赖与接入顺序](../../docs/usage/function/kit.md#module-dependencies)。

## 配置清单

生成项目的 Node 服务从 `HOST` 和 `PORT` 读取监听地址和端口。应用从 `config/_kit.yml` 读取 `http` 和 `transport`，传给 `kit.createHandle({ http, transport })`。启用传输时，服务端注入已初始化的 Crypto、密钥环和共享密钥登记存储。其中 `http` 包含可信代理与访问控制，`transport.keyExchangePath` 使用从站点根开始的绝对路径。

在[模块配置清单](../../docs/usage/configuration/kit.md)中查阅监听、可信代理、访问控制和传输加密的字段与部署示例。配置独立 HTTP 服务时，参见 [Serv 配置清单](../../docs/usage/configuration/serv.md)。

Kit 的请求访问、可信代理与限流均通过 `http` 配置。启用 `http.rateLimit` 时，应用提供计数存储。 [限流与恢复示例](../../docs/usage/function/kit.md#rate-limit-example)

启用传输后，Kit 自动加密挂载的契约 API。使用自定义前缀时，把同一完整路径交给浏览器安装器。 [子目录中的报告示例](../../docs/usage/function/kit.md#kit-custom-contract-transport)

## 功能说明

[查 API 清单](../../docs/usage/function/kit.md#api-reference)，包含调用入口、输入、返回值和用法。

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
