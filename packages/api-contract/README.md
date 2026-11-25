# @h-ai/api-contract

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/core](../core/README.md)

hai-framework 的公共 HTTP API 契约包，用 oRPC contract 和 Zod 让前后端共用接口路径、输入输出校验与类型。

## 快速开始

使用 pnpm 安装：`pnpm add @h-ai/api-contract`。

[跟着最小示例完成接入](../../docs/usage/function/api-contract.md#quick-start)。

[依赖与接入顺序](../../docs/usage/function/api-contract.md#module-dependencies)。

## 配置清单

本模块没有独立的运行配置文件。文件归属见[配置说明](../../docs/usage/configuration/api-contract.md)，调用参数或响应结构见[参考页](../../docs/usage/data/api-contract.md#public-settings)。

## 功能说明

[查 API 清单](../../docs/usage/function/api-contract.md#api-reference)，包含调用入口、输入、返回值和用法。

参阅[按配置启用领域](../../docs/usage/function/api-contract.md#conditional-domains)及 [IAM 契约与 OpenAPI](../../docs/usage/function/api-contract.md#serv-iam-wiring)。

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
