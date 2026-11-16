# @h-ai/api-contract

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/core](../core/README.md)

hai-framework 的公共 HTTP API 契约包，用 oRPC contract 和 Zod 让前后端共用接口路径、输入输出校验与类型。

## 快速开始

```ts
import { apiContract } from '@h-ai/api-contract'

export const contract = apiContract.create({
  iam: apiContract.iam,
  storage: apiContract.storage,
  ai: false,
})
```

自定义应用 contract 也从本包定义路由，不依赖 `@h-ai/serv`：

```ts
import { apiContract } from '@h-ai/api-contract'
import { z } from 'zod'

export const appContract = {
  ping: apiContract
    .route({
      method: 'POST',
      path: '/app/ping',
      operationId: 'app.ping',
      tags: ['app']
    })
    .output(apiContract.haiResultSchema(z.object({
      pong: z.boolean()
    }))),
}
```

## 配置清单

用 `apiContract.create()` 组合需要发布的领域契约。

在[模块配置清单](../../docs/usage/configuration/api-contract.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

在[功能说明](../../docs/usage/function/api-contract.md)中查看调用示例、输入输出、错误处理与使用要点。

- `create` / `route` / `pathOf` — 定义契约、路由和路径
- `haiResultSchema` / `voidResultSchema` / `paginatedSchema` — 说明结果和分页的校验方式
- `iam` / `storage` / `ai` / `payment` / `feedback` — 复用各域的 HTTP 契约

## 数据结构

模块没有自建数据库表。

查看[数据结构](../../docs/usage/data/api-contract.md)，了解公开 HTTP 输入输出与持久化责任。

## 开发测试

```bash
pnpm --filter @h-ai/api-contract test
pnpm --filter @h-ai/api-contract typecheck
```

Schema、推导类型与组合工具均提供可类型检查的示例；见[模块 JSDoc 约定](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证)。Schema 示例使用受约束的本地数据，不代表 provider 已执行。

## 许可证

Apache-2.0
