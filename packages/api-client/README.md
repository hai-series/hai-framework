# @h-ai/api-client

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

普通请求与 Token 刷新默认使用当前 `core.i18n` 语言作为 `Accept-Language`，服务端错误随界面语言切换。可通过 `headers` 显式覆盖该请求头。

[框架首页](../../README.md) · 相关模块：[@h-ai/api-contract](../api-contract/README.md) · [@h-ai/core](../core/README.md) · [@h-ai/crypto](../crypto/README.md)

hai-framework 的跨端 oRPC/OpenAPI typed client，面向 Web、App、小程序等运行时提供统一 API 调用与 Token 管理。

## 快速开始

使用 pnpm 安装：`pnpm add @h-ai/api-client`。

[跟着最小示例完成接入](../../docs/usage/function/api-client.md#quick-start)。

## 配置清单

本模块没有独立的运行配置文件。文件归属见[配置说明](../../docs/usage/configuration/api-client.md)，调用参数或响应结构见[参考页](../../docs/usage/function/api-client.md#call-options)。

## 功能说明

[查 API 清单](../../docs/usage/function/api-client.md#api-reference)，包含调用入口、输入、返回值和用法。

客户端默认从服务端握手获取 `transport.maxPlaintextBytes`；可显式设置本地同名字段取较小值。容量失败返回 `HaiApiClientError.PAYLOAD_TOO_LARGE`（`hai:api-client:020`），保留方向、阶段和字节诊断。见 [容量配置与升级](../../docs/usage/function/crypto.md#transport-capacity)。

Serv/Kit 对通过请求绑定、签名和 MAC 校验但超出时间窗口的请求返回加密的 HTTP 400 错误。客户端抛出 `TransportTimeError`（`hai:crypto:071`），显示校验时的服务器 UTC 时间，提示开启设备的自动校时或手工修改时间后刷新。`serverTime` 为 Unix 毫秒。`api-client` 映射为 `VALIDATION_FAILED`，在 `cause.transportCode` 和 `cause.serverTime` 保留诊断信息。

## 数据结构

模块没有自建数据库表。

查看[数据结构](../../docs/usage/data/api-client.md)，查阅访问令牌和刷新令牌分别保存在哪里，重新加载页面或关闭客户端后是否还可以使用。

## 开发测试

```bash
pnpm --filter @h-ai/api-client test
pnpm --filter @h-ai/api-client typecheck
```

## 许可证

Apache-2.0
