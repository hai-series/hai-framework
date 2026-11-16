# @h-ai/api-client

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

普通请求与 Token 刷新默认使用当前 `core.i18n` 语言作为 `Accept-Language`，服务端错误随界面语言切换。可通过 `headers` 显式覆盖该请求头。

[框架首页](../../README.md) · 相关模块：[@h-ai/api-contract](../api-contract/README.md) · [@h-ai/core](../core/README.md) · [@h-ai/crypto](../crypto/README.md)

hai-framework 的跨端 oRPC/OpenAPI typed client，面向 Web、App、小程序等运行时提供统一 API 调用与 Token 管理。

## 快速开始

`close()` 会使旧刷新失效并等待已有凭据写入完成，保留外置 TokenStorage 当前值；关闭完成后可复用同一存储重新初始化。`timeout` 覆盖响应头、完整 JSON 正文及所有非成功响应正文（包括 HTML 错误页）；超时或取消后不再刷新凭据。内置 Cookie 适配器的登录和刷新使用 `credentials: include`，跨域服务须明确允许凭据与 Origin；内存和原生存储保留原请求的凭据策略。应用自定义流按需读取，其正文由调用方 signal 取消。

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

通过 `ApiClientConfig` 设置 API 地址、认证、请求与加密。

在[模块配置清单](../../docs/usage/configuration/api-client.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

在[功能说明](../../docs/usage/function/api-client.md)中查看调用示例、输入输出、错误处理与使用要点。

- `init` / `create` / `close` / `config` / `isInitialized` — 初始化默认客户端或创建独立实例
- `auth` / `tokenStorage` / `createAuthActions` — 注入凭据、刷新会话和建立认证操作
- `iam` / `storage` / `ai` / `observeRequests` — 调用领域接口并订阅逻辑请求状态

## 数据结构

模块没有自建数据库表。

查看[数据结构](../../docs/usage/data/api-client.md)，了解请求去重和会话的内存状态、Cookie 和可注入的凭据存储。

## 开发测试

```bash
pnpm --filter @h-ai/api-client test
pnpm --filter @h-ai/api-client typecheck
```

客户端默认从服务端握手获取 `transport.maxPlaintextBytes`；可显式设置本地同名字段取较小值。容量失败返回 `HaiApiClientError.PAYLOAD_TOO_LARGE`（`hai:api-client:020`），保留方向、阶段和字节诊断。见 [容量配置与升级](../crypto/TRANSPORT-CAPACITY.md)。

Serv/Kit 对通过请求绑定、签名和 MAC 校验但超出时间窗口的请求返回加密的 HTTP 400 错误。客户端抛出 `TransportTimeError`（`hai:crypto:071`），显示校验时的服务器 UTC 时间，提示开启设备的自动校时或手工修改时间后刷新。`serverTime` 为 Unix 毫秒。`api-client` 映射为 `VALIDATION_FAILED`，在 `cause.transportCode` 和 `cause.serverTime` 保留诊断信息。

## 许可证

Apache-2.0
