# @h-ai/api-client

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

普通请求与 Token 刷新默认使用当前 `core.i18n` 语言作为 `Accept-Language`，服务端错误随界面语言切换。可通过 `headers` 显式覆盖该请求头。

[框架首页](../../README.md) · 相关模块：[@h-ai/api-contract](../api-contract/README.md) · [@h-ai/core](../core/README.md) · [@h-ai/crypto](../crypto/README.md)

hai-framework 的跨端 oRPC/OpenAPI typed client，面向 Web、App、小程序等运行时提供统一 API 调用与 Token 管理。

## 快速开始

调用 `apiClient.close()` 后，关闭前已经开始的刷新不能再更新会话。该调用会等正在写入的操作结束，保留外部 `TokenStorage` 中的凭据，之后可以复用该存储重新初始化。

设置 `timeout` 后，客户端在规定时间内等待响应头和完整的 JSON 正文。服务端返回错误时，读取错误正文也计入时限，包括 HTML 错误页。调用超时或被取消后，不会再尝试刷新令牌。应用自行读取的成功流式正文由传入的取消信号控制。

默认 Cookie 存储方式会让浏览器在登录和刷新时携带 Cookie（`credentials: "include"`）。网页和 API 不在同一来源时，API 需要在 CORS 配置中允许网页的实际来源和凭据。使用内存或原生存储时，客户端沿用应用为请求设置的 `credentials`。

```ts
import type { IamAuthLoginInput } from '@h-ai/api-client'
import { apiClient } from '@h-ai/api-client'

async function loginAndLoadProfile(input: IamAuthLoginInput) {
  const initialized = await apiClient.init({ baseUrl: '/api/v1', auth: {} })
  if (!initialized.success)
    return initialized
  try {
    const actions = apiClient.createAuthActions(apiClient)
    const loggedIn = await actions.login(input)
    if (!loggedIn.success)
      return loggedIn
    const profile = await apiClient.iam.auth.currentUser()
    if (!profile.success)
      return profile
    return profile
  }
  catch (writeError) {
    try {
      await apiClient.auth.clear()
    }
    catch (cleanupError) {
      throw new AggregateError([writeError, cleanupError], 'Credential persistence and cleanup failed')
    }
    throw writeError
  }
  finally {
    await apiClient.close()
  }
}
```

## 配置清单

调用 `apiClient.init(config)` 时传入服务端 API 的基础地址。按需提供凭据存储方式、请求超时和传输加密选项。

在[模块配置清单](../../docs/usage/configuration/api-client.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

在[功能说明](../../docs/usage/function/api-client.md)中查看调用示例、输入输出、错误处理与使用要点。

- `apiClient.init` / `apiClient.create` / `apiClient.close` / `apiClient.config` / `apiClient.isInitialized` — 初始化默认客户端或创建独立实例
- `apiClient.auth` / `apiClient.tokenStorage` / `apiClient.createAuthActions` — 选择凭据保存方式，创建登录和刷新会话等操作
- `apiClient.iam` / `apiClient.storage` / `apiClient.ai` / `apiClient.observeRequests` — 调用用户、文件和 AI 接口，或订阅每次调用结束时的结果和耗时

## 数据结构

模块没有自建数据库表。

查看[数据结构](../../docs/usage/data/api-client.md)，查阅访问令牌和刷新令牌分别保存在哪里，重新加载页面或关闭客户端后是否还可以使用。

## 开发测试

```bash
pnpm --filter @h-ai/api-client test
pnpm --filter @h-ai/api-client typecheck
```

客户端默认从服务端握手获取 `transport.maxPlaintextBytes`；可显式设置本地同名字段取较小值。容量失败返回 `HaiApiClientError.PAYLOAD_TOO_LARGE`（`hai:api-client:020`），保留方向、阶段和字节诊断。见 [容量配置与升级](../crypto/TRANSPORT-CAPACITY.md)。

Serv/Kit 对通过请求绑定、签名和 MAC 校验但超出时间窗口的请求返回加密的 HTTP 400 错误。客户端抛出 `TransportTimeError`（`hai:crypto:071`），显示校验时的服务器 UTC 时间，提示开启设备的自动校时或手工修改时间后刷新。`serverTime` 为 Unix 毫秒。`api-client` 映射为 `VALIDATION_FAILED`，在 `cause.transportCode` 和 `cause.serverTime` 保留诊断信息。

## 许可证

Apache-2.0
