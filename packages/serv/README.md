# @h-ai/serv

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/ai](../ai/README.md) · [@h-ai/api-contract](../api-contract/README.md) · [@h-ai/core](../core/README.md) · [@h-ai/crypto](../crypto/README.md) · [@h-ai/iam](../iam/README.md) · [@h-ai/storage](../storage/README.md)

hai-framework 的 API 服务运行时：对外暴露稳定的 HTTP App 抽象，把 `@h-ai/api-contract` 契约挂载为跨端可访问的 HTTP API；Hono 仅作为内部运行时实现。

从 `@h-ai/serv` 导入 `serv` 后，可用 `serv.createApp()` 创建 HTTP 应用、用 `serv.listen()` 启动监听。如果应用要为自己的封装标注类型，`ServFunctions` 也从同一包入口导入。

## 快速开始

使用 pnpm 安装：`pnpm add @h-ai/serv`。

[跟着最小示例完成接入](../../docs/usage/getting-started/serv.md#quick-start)。 [依赖与接入顺序](../../docs/usage/function/serv.md#module-dependencies)。

## 配置清单

生成的项目在 `config/_serv.yml` 中设置 HTTP 选项、监听地址和端口。服务端启动时先把 HTTP 选项、接口定义和处理函数传给 `serv.createApp(options)`，再把创建的应用、监听地址和端口交给 `serv.listen()`。

`http.access` 和 `http.trustedProxies` 用于访问控制和可信代理。启用传输加密时，`transport.keyExchangePath` 从站点根开始，默认 `/api/v1/_hai/key-exchange`。

在[模块配置清单](../../docs/usage/configuration/serv.md)中查阅监听、HTTP、跨域和传输加密的字段与部署示例。配置 SvelteKit 站点时，参见 [Kit 配置清单](../../docs/usage/configuration/kit.md)。

Serv 的请求访问、可信代理与限流均通过 `http` 配置。启用 `http.rateLimit` 时，应用提供计数存储。 [限流与恢复示例](../../docs/usage/function/serv.md#rate-limit-example)

## 功能说明

`serv.storageAssets()` 提供公开只读文件。GET 从同一次 Storage 读取生成响应头并取得正文。

[查 API 清单](../../docs/usage/function/serv.md#api-reference)，包含调用入口、输入、返回值和用法。

- 在报告助手中显示聊天增量、保存写作偏好，或在商品后台生成图像。 [流式聊天](../../docs/usage/function/serv.md#ai-streaming-procedures-api) · [记忆写入](../../docs/usage/function/serv.md#ai-memory-write-procedures-api) · [音频与图像生成](../../docs/usage/function/serv.md#ai-media-procedures-api)
- 为授权的审计员签发实时语音票据并播放报告。 [IAM 语音装配](../../docs/usage/function/serv.md#iam-audio-api)
- 为管理端挂载角色权限和 API Key 管理、私有文件中转或订单关单。 [IAM 管理](../../docs/usage/function/serv.md#iam-management-procedures-api) · [文件中转](../../docs/usage/function/serv.md#storage-transfer-procedures-api) · [支付关单](../../docs/usage/function/serv.md#payment-close-order-procedures-api)
- 按已挂载的操作配置 multipart、文件和 SSE 请求上限。 [文件与流式传输](../../docs/usage/function/serv.md#http-contract-extensions)
- 订单 API 可以通过 `serv.createContractHandler()` 挂到 Kit；两端使用相同的 A2A 处理器、访问策略和限流配置。

## 数据结构

模块没有自建数据库表。

查看[数据结构](../../docs/usage/data/serv.md)，查阅会话 Cookie、文件和请求数据分别存在哪里。

## 开发测试

```bash
pnpm --filter @h-ai/serv test
pnpm --filter @h-ai/serv typecheck
pnpm --filter @h-ai/serv lint
```

公开 API 的 JSDoc 示例从 `@h-ai/serv` 导入；内部 Hono/guard/router/transport 示例明确标注“模块内部上下文”，不代表根 API。示例区分工厂的启动配置异常、领域 HaiResult、HTTP middleware 状态码和监听句柄的 Promise<void> 关闭；默认 AI completion 仍只返回非流式 JSON。框架维护运行 `node scripts/check-module-jsdoc.mjs --package serv` 对实际声明和内部词法绑定编译示例，编译不代替真实 HTTP、授权与分布式防重放验收。

## 许可证

Apache-2.0
