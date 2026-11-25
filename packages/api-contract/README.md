# @h-ai/api-contract

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/core](../core/README.md)

hai-framework 的公共 HTTP API 契约包，用 oRPC contract 和 Zod 让前后端共用接口路径、输入输出校验与类型。

## 快速开始

使用 pnpm 安装：`pnpm add @h-ai/api-contract`。

[跟着最小示例完成接入](../../docs/usage/function/api-contract.md#quick-start)。

[依赖与接入顺序](../../docs/usage/function/api-contract.md#module-dependencies)。

## 配置清单

应用通过代码声明契约。HTTP 前缀和传输设置由宿主读取，详情见[配置说明](../../docs/usage/configuration/api-contract.md)。

## 功能说明

[查 API 清单](../../docs/usage/function/api-contract.md#api-reference)，包含调用入口、输入、返回值和用法。

[声明单个操作](../../docs/usage/function/api-contract.md#declare-routes)、[组合应用领域](../../docs/usage/function/api-contract.md#compose-domains)和[读取操作路径](../../docs/usage/function/api-contract.md#read-route-path)分别使用 `route`、`create` 和 `pathOf`。

接入时按场景选择 [Serv 装配](../../docs/usage/function/api-contract.md#use-with-serv)、[Kit 文件路由](../../docs/usage/function/api-contract.md#use-with-kit)或 [API Client](../../docs/usage/function/api-contract.md#use-with-client)。

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
