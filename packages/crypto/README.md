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

Node.js 请求处理使用 `crypto.password.hashAsync()` 和 `verifyAsync()`，在后台线程计算现有 SM3 密码记录。队列满时返回 `PASSWORD_BUSY`。

算法使用 `crypto.asymmetric/hash/symmetric/password`，传输工厂、缓存登记、密钥环解析与 HTTP 工具统一使用 `crypto.transport`。公钥校验接受外部未知值，无需初始化；类型与错误类仍按命名导入。

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
