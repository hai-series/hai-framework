---
name: hai-api-client
description: "接入或排查 @h-ai/api-client typed API、登录 Token、自动刷新与加密传输；适用于 Web、SSR 和原生客户端。"
---

# hai-api-client

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 使用 @h-ai/api-client 调用 typed API，管理 Token、刷新与加密传输 |
| 适用场景 | 跨端调用共享 HTTP API 或排查认证刷新 |
| 输入 | baseUrl、共享 contract、TokenStorage、可选 transport.crypto |
| 输出 | typed client；标准业务返回 HaiResult，自定义裸值或 SSE 另含客户端失败分支 |
| 限制 | 先 init，结束 close；浏览器 Cookie 与服务端配置匹配，原生端使用安全 TokenStorage。不要在多用户 SSR 中共享带用户 token 的单例。 |

## 使用路径

1. 读取服务端 contract、apiPrefix、CORS、Cookie 与 transport 配置。自定义客户端从[共享应用契约](../hai-api-contract/reference.md#use-with-client)取得操作签名，再传给 `apiClient.create(contract)`。
2. 浏览器使用 Cookie/内存；SSR 按请求创建客户端，原生使用安全 TokenStorage，不跨用户复用单例。
3. 检查 init 与标准业务调用的 `success`。自定义裸值或流先排除失败分支。在 `init` 中提供 `auth` 后，再使用 `createAuthActions` 连接认证界面并保存凭据。
4. 同步服务端与客户端的刷新、加密和错误处理。仅在明确的认证拒绝后按原身份恢复。退出时调用服务端接口撤销会话和 Cookie，再清理本地凭据。
5. 验证登录、刷新重试、失败、退出与会话恢复。

保留服务端错误的 `traceId`，UI 使用公开安全消息，重新翻译后用 `core.error.formatMessage` 保留编号。4xx 和可关联的服务端错误使用 `debug`。客户端自己的网络、协议或未关联的 5xx 失败使用 `error`，记录可用的传输诊断字段。具体见 [日志与错误诊断](../hai-app-create/logging.md)。

非 2xx HTTP 响应中的合法失败 HaiResult 保留服务端业务码、消息与 traceId，以真实 HTTP 状态执行脱敏。验证 409 冲突、422 输入错误、429 限流和 5xx，不只测试 HTTP 200 业务失败；UI 包装 Error 时通过 cause 保留 HaiError。

## 按需参考

Serv/Kit 对通过请求绑定、签名和 MAC 校验但超出时间窗口的请求返回加密的 HTTP 400 错误。Crypto 传输层产生 `TransportTimeError`（`hai:crypto:071`），应用可根据公开错误提示用户同步设备时间。`serverTime` 为 Unix 毫秒。`api-client` 映射为 `VALIDATION_FAILED`，在 `cause.transportCode` 和 `cause.serverTime` 保留诊断信息。

按本次操作读取对应小节；以已安装版本的公开类型核验签名，示例中的业务变量由应用提供。

- [使用步骤](reference.md#使用步骤)
- [Token Storage 适配器](reference.md#token-storage-适配器)
- [核心 API](reference.md#核心-api)
- [常见模式](reference.md#常见模式)
- [配置驱动认证页面](reference.md#配置驱动认证页面)

普通请求与 Token 刷新自动将当前 `core.i18n` 语言发送为 `Accept-Language`；切换语言时同步 core。`headers` 中显式配置的同名头优先。
