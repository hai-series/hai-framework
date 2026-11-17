# @h-ai/crypto

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/cache](../cache/README.md) · [@h-ai/core](../core/README.md)

加密模块，提供非对称加密、哈希、对称加密与密码哈希能力。

## 快速开始

使用 pnpm 安装：`pnpm add @h-ai/crypto`。

[跟着最小示例完成接入](../../docs/usage/function/crypto.md#quick-start)。

## 配置清单

本模块没有独立的运行配置文件。文件归属见[配置说明](../../docs/usage/configuration/crypto.md)，调用参数或响应结构见[参考页](../../docs/usage/function/crypto.md#call-options)。

## 功能说明

传输的精确格式见[协议说明](../../docs/usage/function/crypto.md#transport-protocol)，算法输入边界见[输入校验](../../docs/usage/function/crypto.md#primitive-validation)。

[查 API 清单](../../docs/usage/function/crypto.md#api-reference)，包含调用入口、输入、返回值和用法。

## 数据结构

传输状态统一使用 `@h-ai/cache`：有限期公钥、原子防重放记录和共享分钟配额；生产使用 Redis。Crypto 不创建数据库表。

[传输状态](../../docs/usage/data/crypto.md#transport-state)

## 开发测试

```bash
pnpm --filter @h-ai/crypto test
```

## 许可证

Apache-2.0
