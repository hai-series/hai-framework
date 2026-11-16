# @h-ai/serv

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/ai](../ai/README.md) · [@h-ai/api-contract](../api-contract/README.md) · [@h-ai/core](../core/README.md) · [@h-ai/crypto](../crypto/README.md) · [@h-ai/iam](../iam/README.md) · [@h-ai/storage](../storage/README.md)

hai-framework 的 API 服务运行时：对外暴露稳定的 HTTP App 抽象，把 `@h-ai/api-contract` 契约挂载为跨端可访问的 HTTP API；Hono 仅作为内部运行时实现。

从 `@h-ai/serv` 导入 `serv` 后，可用 `serv.createApp()` 创建 HTTP 应用、用 `serv.listen()` 启动监听。如果应用要为自己的封装标注类型，`ServFunctions` 也从同一包入口导入。

## 快速开始

在应用启动时初始化 `core`、`iam`、`storage` 和 `ai`，加载并校验 `serv` 配置，再调用 `startApi(closeApp)`。`closeApp` 是应用提供的异步回调，负责按初始化的逆序释放业务资源。函数返回 Node 监听句柄。传入回调后，`serv.listen` 会在收到退出信号时先关闭监听，再调用该回调。只提供健康检查时，可以用空契约和空 procedures 创建 App。

```ts
import type { ServConfig } from '@h-ai/serv'
import { ai } from '@h-ai/ai'
import { apiContract } from '@h-ai/api-contract'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { serv } from '@h-ai/serv'
import { createAiProcedures } from '@h-ai/serv/features/ai'
import { createIamProcedures } from '@h-ai/serv/features/iam'
import { createStorageProcedures } from '@h-ai/serv/features/storage'
import { storage } from '@h-ai/storage'

export function startApi(closeApp: () => Promise<void>) {
  // 用三个模块的契约生成 HTTP 路由契约。
  const contract = apiContract.create({ iam: apiContract.iam, storage: apiContract.storage, ai: apiContract.ai })

  // 将已初始化的业务模块绑定为实现；存储检查所有 key 的归属。
  const procedures = {
    iam: createIamProcedures({ iam }),
    storage: createStorageProcedures({
      storage,
      authorize: ({ context, keys }) => keys.every(key =>
        key.startsWith(`users/${encodeURIComponent(context.session.userId)}/`)),
    }),
    ai: createAiProcedures({ ai }),
  }

  // 使用契约、实现和 HTTP 设置构建 App。
  const app = serv.createApp({
    contract,
    procedures,
    iam,
    http: {
      apiPrefix: '/api/v1',
      openapi: { path: '/openapi.json' },
      docs: { path: '/docs' },
    },
  })

  // 读取已加载的监听配置，返回包含地址和 close() 的句柄。
  const { server } = core.config.getOrThrow<ServConfig>('serv')
  return serv.listen(app, {
    host: server.host,
    port: server.port,
    onListening: info => core.logger.info('API service listening', { port: info.port }),
    onClose: closeApp,
  })
}
```

用 `createStorageProcedures()` 创建文件接口时，需要传入 `authorize({ context, operation, keys })`。这个函数根据已登录用户判断该操作能否访问所有给定的对象键。下载、上传、列表、读取元数据和删除都会检查。没有配置检查函数的接口会拒绝请求。上例只允许 `users/<编码后的 userId>/` 下的 key，列表同样必须携带该用户前缀；批量中任何一个 key 未获授权时全部不执行。管理员访问须由应用显式授权。

批量删除 `apiClient.storage.files.deleteMany()` 成功时返回 `{ deletedKeys, failures: [] }`；失败进度位于 `error.ext.deleteMany`（`failed / unknown / notAttempted`），不能只根据 HTTP 200 判断完成。详见 [Storage 批量删除](../storage/README.md#api-概览)。

客户端未提供 `objectId` 时，AI 接口使用服务端已认证的 `context.session.userId`。聊天、写消息、查历史、列出会话和查询记忆都使用经过授权的 `objectId`。服务端按 `objectId` 与 `sessionId` 的组合区分会话。写入时省略 `sessionId` 会使用 `default`。传入其它 objectId 默认返回 FORBIDDEN，管理员跨主体访问也必须显式传入 `authorizeObject` 并根据可信权限及租户关系授权。

`apiClient.ai.chats.createCompletion()`（`POST /ai/chats/completions`）只返回一次非流式 `HaiResult<AiChatCompletionData>`。完整 function `tools`（含嵌套 JSON Schema、`strict`）和 `tool_choice`（`auto` / `none` / `required` / 指定名称）传递到模型；消息保留角色、`name`、用户图片和工具调用。工具结果必须使用 `role: 'tool'` 与非空 `tool_call_id`，指定工具选择须引用本次提供的工具。默认 procedure 不自动执行工具，应用授权并执行后，将助手的 `tool_calls` 与对应工具结果一并回传。输入不提供 `stream` 字段，传入 `true` 或 `false` 均在 HTTP 边界返回 400；需要流式时由应用使用 `ai.llm.chatStream()` 定义匹配流输出的独立 endpoint。

## 配置清单

生成的项目在 `config/_serv.yml` 中设置 HTTP 选项、监听地址和端口。服务端启动时先把 HTTP 选项、接口定义和处理函数传给 `serv.createApp(options)`，再把创建的应用、监听地址和端口交给 `serv.listen()`。

在[模块配置清单](../../docs/usage/configuration/serv.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

在[功能说明](../../docs/usage/function/serv.md)中查看调用示例、输入输出、错误处理与使用要点。

- `serv.createApp` / `serv.listen` / `serv.toFetch` / `serv.cors` / `serv.storageAssets` — 创建 HTTP 应用，在 Node.js 监听端口，或将应用转成 fetch 处理函数，并按需提供跨域和静态文件服务
- `serv.implement` / `serv.validateInputOrFail` / `serv.generateSpec` / `serv.m` — 实现类型化端点、校验输入并生成 OpenAPI
- `serv.parseRequestContext` / `serv.buildAuthContextFactory` / `serv.resolveRequestLocale` / `serv.createRuntimeSecurityPolicy` — 读取请求来源与语言，构建身份检查，并准备请求访问规则
- `@h-ai/serv/features/*` — 按需导入 IAM、存储、AI 或反馈的接口处理函数，并传给 `serv.createApp()`

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
