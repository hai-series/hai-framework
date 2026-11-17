# @h-ai/serv

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/ai](../ai/README.md) · [@h-ai/api-contract](../api-contract/README.md) · [@h-ai/core](../core/README.md) · [@h-ai/crypto](../crypto/README.md) · [@h-ai/iam](../iam/README.md) · [@h-ai/storage](../storage/README.md)

hai-framework 的 API 服务运行时：对外暴露稳定的 HTTP App 抽象，把 `@h-ai/api-contract` 契约挂载为跨端可访问的 HTTP API；Hono 仅作为内部运行时实现。

从 `@h-ai/serv` 导入 `serv` 后，可用 `serv.createApp()` 创建 HTTP 应用、用 `serv.listen()` 启动监听。如果应用要为自己的封装标注类型，`ServFunctions` 也从同一包入口导入。

## 快速开始

使用 pnpm 安装：`pnpm add @h-ai/serv`。

[跟着最小示例完成接入](../../docs/usage/function/serv.md#quick-start)。

## 配置清单

生成的项目在 `config/_serv.yml` 中设置 HTTP 选项、监听地址和端口。服务端启动时先把 HTTP 选项、接口定义和处理函数传给 `serv.createApp(options)`，再把创建的应用、监听地址和端口交给 `serv.listen()`。

在[模块配置清单](../../docs/usage/configuration/serv.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

[查 API 清单](../../docs/usage/function/serv.md#api-reference)，包含调用入口、输入、返回值和用法。

## 数据结构

模块没有自建数据库表。

查看[数据结构](../../docs/usage/data/serv.md)，查阅会话 Cookie、文件和请求数据分别存在哪里。

## 开发测试

```bash
pnpm --filter @h-ai/serv test
pnpm --filter @h-ai/serv typecheck
pnpm --filter @h-ai/serv lint
```

声明旁的 JSDoc 示例从实际 `@h-ai/serv` 或已公开的 features 子路径导入；内部 Hono/guard/router/transport 示例明确标注“模块内部上下文”，不代表根 API。示例区分工厂的启动配置异常、领域 HaiResult、HTTP middleware 状态码和监听句柄的 Promise<void> 关闭；默认 AI completion 仍只返回非流式 JSON。框架维护运行 `node scripts/check-module-jsdoc.mjs --package serv` 对实际声明和内部词法绑定编译示例，编译不代替真实 HTTP、授权与分布式防重放验收。

## 许可证

Apache-2.0
