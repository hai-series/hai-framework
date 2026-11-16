# @h-ai/datapipe

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/core](../core/README.md)

数据处理管线模块，提供文本清洗（clean）、分块（chunk）和可组合管线（pipeline）功能。纯函数模块，无需初始化。

## 快速开始

[跟着最小示例完成接入](../../docs/usage/function/datapipe.md#最小接入示例)。

## 配置清单

把清洗选项传给 `datapipe.clean()`，把片段大小和重叠长度等选项传给 `datapipe.chunk()`。调用 `datapipe.pipeline()` 时可以一次指定两类选项。

在[模块配置清单](../../docs/usage/configuration/datapipe.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

[查 API 清单](../../docs/usage/function/datapipe.md#api-reference)，包含调用入口、输入、返回值和用法。

## 数据结构

模块没有自建数据库表。

查看[数据结构](../../docs/usage/data/datapipe.md)，了解清洗结果、文本块与应用侧存储责任。

## 开发测试

```bash
pnpm --filter @h-ai/datapipe test
```

源码示例区分无需生命周期的纯函数、同步 HaiResult 与异步管线；类型检查方法见[模块 JSDoc 约定](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证).

## 许可证

Apache-2.0
