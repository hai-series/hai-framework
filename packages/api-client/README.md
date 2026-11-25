# @h-ai/api-client

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/api-contract](../api-contract/README.md) · [@h-ai/core](../core/README.md) · [@h-ai/crypto](../crypto/README.md)

面向浏览器、Node.js 和移动应用的类型化 HTTP 客户端。它按共享的 oRPC/OpenAPI 契约调用接口，支持凭据存储、自动刷新、应用层加密和请求观察。运行环境须提供 Fetch，也可注入兼容实现。

## 快速开始

用 `pnpm add @h-ai/api-client` 安装。应用直接导入共享契约时，也将 `@h-ai/api-contract` 加入直接依赖。

[最小接入示例](../../docs/usage/function/api-client.md#quick-start) · [依赖与接入顺序](../../docs/usage/function/api-client.md#module-dependencies)

## 配置清单

应用负责读取运行配置，并向 `apiClient.init(config)` 或独立实例的 `client.init(config)` 提供 API 地址和所需选项。见[配置来源](../../docs/usage/configuration/api-client.md)和[调用参数](../../docs/usage/function/api-client.md#call-options)。

## 功能说明

- 使用默认客户端，或从应用自己的契约创建隔离实例。见[客户端生命周期](../../docs/usage/function/api-client.md#client-lifecycle)。
- 处理登录、凭据和会话刷新。见[认证操作](../../docs/usage/function/api-client.md#auth-actions)和[凭据刷新](../../docs/usage/function/api-client.md#credentials)。
- 设置单次调用的请求选项，按契约读取 `HaiResult`、裸 JSON 或 SSE。见[请求选项](../../docs/usage/function/api-client.md#request-options)和[自定义响应](../../docs/usage/function/api-client.md#custom-response-results)。
- 对接支持加密的服务端，或订阅请求摘要。见[加密传输](../../docs/usage/function/api-client.md#encrypted-requests)、[明文容量](../../docs/usage/function/crypto.md#transport-capacity)和[请求观察](../../docs/usage/function/api-client.md#transport-observation)。

[完整 API 清单](../../docs/usage/function/api-client.md#api-reference)

- 从项目契约创建客户端，接收流式聊天事件或调用已启用的扩展操作。 [扩展 HTTP 契约](../../docs/usage/function/api-client.md#http-contract-extensions)

## 数据结构

应用选择令牌存储，服务端保存会话与业务数据，调用方决定是否保存响应和观察记录。见[数据结构](../../docs/usage/data/api-client.md)。

## 开发测试

在已安装工作区依赖的仓库根目录运行以下命令。

```bash
pnpm --filter @h-ai/api-client typecheck
pnpm --filter @h-ai/api-client test
```

## 许可证

Apache-2.0
