# @h-ai/api-contract

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/core](../core/README.md)

hai-framework 的公共 HTTP API 契约包，用 oRPC contract 和 Zod 让前后端共用接口路径、输入输出校验与类型。

## 快速开始

[跟着最小示例完成接入](../../docs/usage/function/api-contract.md#最小接入示例)。

## 配置清单

把应用需要公开的接口定义传给 `apiContract.create(options)` 时，参数对象的键确定每组接口的名称。同一个返回对象可以用于生成 API 文档，也可作为服务端和类型化客户端的接口描述。

在[模块配置清单](../../docs/usage/configuration/api-contract.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

[查 API 清单](../../docs/usage/function/api-contract.md#api-reference)，包含调用入口、输入、返回值和用法。

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
