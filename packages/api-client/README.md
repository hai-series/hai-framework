# @h-ai/api-client

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/api-contract](../api-contract/README.md) · [@h-ai/core](../core/README.md) · [@h-ai/crypto](../crypto/README.md)

hai-framework 的跨端 oRPC/OpenAPI typed client，面向 Web、App、小程序等运行时提供统一 API 调用与 Token 管理。

## 快速开始

使用 pnpm 安装：`pnpm add @h-ai/api-client`。

[跟着最小示例完成接入](../../docs/usage/function/api-client.md#quick-start)。

## 配置清单

本模块没有独立的运行配置文件。文件归属见[配置说明](../../docs/usage/configuration/api-client.md)，调用参数或响应结构见[参考页](../../docs/usage/function/api-client.md#call-options)。

## 功能说明

普通请求与令牌刷新默认用当前 `core.i18n` 语言设置 `Accept-Language`。应用可通过 `headers` 覆盖请求头。

浏览器可将同源根路径（如 `/api/v1`）作为 `baseUrl`。Node.js 和没有浏览器来源的设备使用 HTTP(S) 绝对地址。地址无效时，`init()` 返回 `CONFIG_ERROR`。

[查 API 清单](../../docs/usage/function/api-client.md#api-reference)，包含调用入口、输入、返回值和用法。

请求绑定发起时的身份和客户端运行期。参阅[凭据刷新和会话恢复](../../docs/usage/function/api-client.md#credentials)及[自定义 JSON 和 SSE 的结果](../../docs/usage/function/api-client.md#custom-response-results)。

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
