# @h-ai/cache

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/core](../core/README.md)

统一缓存模块，通过 `cache` 对象提供 KV / Hash / List / Set / ZSet / 分布式锁 操作，支持内存与 Redis 两种后端。

## 快速开始

使用 pnpm 安装：`pnpm add @h-ai/cache`。

[跟着最小示例完成接入](../../docs/usage/function/cache.md#quick-start)。

## 配置清单

生成的项目在 `config/_cache.yml` 中设置后端类型和 Redis 连接参数。应用启动代码读取该文件，把配置对象传给 `cache.init(config)`。

在[模块配置清单](../../docs/usage/configuration/cache.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

[查 API 清单](../../docs/usage/function/cache.md#api-reference)，包含调用入口、输入、返回值和用法。

## 数据结构

查看[数据结构](../../docs/usage/data/cache.md)，了解Redis/内存的数据类型、键、TTL 和锁所有者。

## 开发测试

```bash
pnpm --filter @h-ai/cache test
```

> Redis 集成测试需要可用的 Docker API，例如 Docker 或已启用 Docker 兼容 API 的 Podman。

公开契约与内部结构均提供可类型检查的示例；见[模块 JSDoc 约定](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证).

## 许可证

Apache-2.0
