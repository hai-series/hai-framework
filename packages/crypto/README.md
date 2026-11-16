# @h-ai/crypto

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/cache](../cache/README.md) · [@h-ai/core](../core/README.md) · [@h-ai/reldb](../reldb/README.md)

加密模块，提供非对称加密、哈希、对称加密与密码哈希能力。

## 快速开始

[跟着最小示例完成接入](../../docs/usage/function/crypto.md#最小接入示例)。

## 配置清单

调用加密、签名或哈希函数时传入算法选项。为 HTTP 请求建立加密会话时，调用 `crypto.transport.createServer(options)` 提供服务器密钥和密钥存储，调用 `crypto.transport.createClient(options)` 提供客户端使用的密钥协商地址。

在[模块配置清单](../../docs/usage/configuration/crypto.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

[查 API 清单](../../docs/usage/function/crypto.md#api-reference)，包含调用入口、输入、返回值和用法。

## 数据结构

选择 RelDB 传输密钥仓库时创建数据库表。Redis 仓库使用缓存键保存公钥和防重放记录。

查看[数据结构](../../docs/usage/data/crypto.md)，了解密钥、传输会话、nonce 和可注入的存储组件。

## 开发测试

```bash
pnpm --filter @h-ai/crypto test
```

## 许可证

Apache-2.0
