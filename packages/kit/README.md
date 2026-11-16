# @h-ai/kit

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/core](../core/README.md) · [@h-ai/crypto](../crypto/README.md) · [@h-ai/iam](../iam/README.md)

`@h-ai/kit` 为 SvelteKit 项目处理请求、校验身份和编写 API。页面和 API 由同一站点提供时，可以直接通过当前网站地址调用 API。

在 SvelteKit 服务端从 `@h-ai/kit` 导入 `kit`，用 `kit.createHandle()` 创建请求处理函数。浏览器从同一包导入时，可以创建客户端、使用列表和表单工具、读取页面令牌和设置默认语言。为这些对象标注类型时，服务端使用 `KitFunctions`，浏览器使用 `BrowserKitFunctions`。`AuthCookieWriter` 描述服务端认证需要的 Cookie 写入方法，例如登录后设置当前请求响应里的 Cookie。

- `kit.createHandle()`：会话解析、路由守卫、中间件链、可选传输加密与 Cookie 加密
- `kit.handler()`：API 端点异常边界
- `kit.guard` / `kit.response` / `kit.validate` / `kit.auth` / `kit.client` / `kit.crud`

> 公共跨端 HTTP API contract 统一放在 `@h-ai/api-contract`，由 `@h-ai/serv` 挂载，客户端通过 `@h-ai/api-client` typed client 调用；`@h-ai/kit` 不定义也不承载业务 API contract。

## 快速开始

[跟着最小示例完成接入](../../docs/usage/function/kit.md#最小接入示例)。

## 配置清单

生成的项目将监听地址和端口写在 `config/_kit.yml`。服务启动时把访问检查与加密设置传给 `kit.createHandle(options)`，并在 SvelteKit 的服务端 hook 中使用它返回的处理函数。

在[模块配置清单](../../docs/usage/configuration/kit.md)中查阅配置入口、默认值、取值限制和生效条件。

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
