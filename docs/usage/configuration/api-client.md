# API Client 配置

[配置手册](README.md)

## 配置入口

页面或原生应用的启动代码调用 `apiClient.init(config)`，告诉客户端往哪里发请求、如何验证身份，以及是否加密业务数据。多个客户端需要不同地址或认证设置时，用 `apiClient.create(contract)` 创建独立实例，再分别初始化。

`baseUrl` 填运行该客户端的浏览器或设备实际能访问的服务地址。例如 Web 页面和 API 同域时可以用 `/api/v1`，移动端可以用 `https://api.example.com/api/v1`。API 地址可以写入前端配置，服务端私钥和数据库密码应留在服务端。

## 配置示例

```ts
import { apiClient } from '@h-ai/api-client'

const initialized = await apiClient.init({
  baseUrl: 'https://api.example.com/api/v1',
  auth: { terminalType: 'web' },
  timeout: 15000,
})
if (!initialized.success)
  throw new Error(initialized.error.message)
```

## 配置清单

| 配置项                        | 默认值/必填                               | 说明                                                                                                                                                                |
| ----------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `baseUrl`                     | 必填                                      | 完整 API 基础地址，通常含 `/api/v1`。刷新、密钥交换及业务请求都以此地址为基础                                                                                       |
| `timeout`                     | `30000`                                   | 请求到响应头及 JSON 正文读取完毕的期限，单位毫秒。读取流式正文时使用调用方的取消信号                                                                                |
| `clientName`                  | `hai-api-client`                          | 写入 `x-request-client`，便于服务端关联诊断                                                                                                                         |
| `headers`                     | 无附加标头                                | 静态对象或返回请求头的同步/异步函数                                                                                                                                 |
| `fetch`                       | 全局 `fetch`                              | 接入原生网络库或测试替身时，传入符合 Fetch 接口的函数，仍须正确处理取消和 Cookie                                                                                    |
| `auth`                        | 不启用自动认证                            | 传入 `{}` 即启用默认行为。登录后客户端自动为请求带上访问令牌，过期后尝试刷新                                                                                        |
| `auth.storage`                | `apiClient.tokenStorage.httpOnlyCookie()` | 浏览器把访问令牌放内存，浏览器自动收发由服务端设置的刷新 Cookie。服务端渲染和测试可为每个客户端单独调用 `apiClient.tokenStorage.memory()`，原生端可使用平台安全存储 |
| `auth.refreshPath`            | `/auth/refresh`                           | 相对于 `baseUrl` 的服务端刷新路径                                                                                                                                   |
| `auth.refreshTimeoutMs`       | `10000`                                   | 刷新请求超时毫秒数，超时保留已有凭据供后续重试                                                                                                                      |
| `auth.terminalType`           | `web`                                     | 会话终端类别，也可用 `app`、`desktop`、`api`。需与 IAM 允许的类别一致                                                                                               |
| `auth.recoverSession`         | 可省略                                    | 刷新明确失效后尝试恢复同一用户会话。返回 `true` 时自动重试原请求一次                                                                                                |
| `auth.onTokenRefreshed`       | 可省略                                    | 刷新成功时调用此函数。应用可用它更新页面上的登录状态                                                                                                                |
| `auth.onRefreshFailed`        | 可省略                                    | 刷新明确失败时调用此函数。应用可用它提示重新登录                                                                                                                    |
| `transport`                   | 不启用加密                                | 传入对象启用端到端应用层传输加密                                                                                                                                    |
| `transport.crypto`            | 启用时必填                                | 已初始化的 `@h-ai/crypto` 运行实例                                                                                                                                  |
| `transport.keyExchangePath`   | `/_hai/key-exchange`                      | 相对于 `baseUrl` 的密钥协商路径。拼接后的完整地址须对应服务端已开启的协商接口                                                                                       |
| `transport.maxPlaintextBytes` | 跟随服务端                                | 可选客户端明文字节上限，指定时取客户端和服务端较小值                                                                                                                |

## 生效与核对

通过 `apiClient.config` 检查客户端实际使用的设置。它会遮盖密钥等敏感值。验证登录后的请求是否带有身份、会话过期后能否刷新、退出后是否无法继续使用原会话。原生应用还需在真机上检查安全存储。[地址、期限和恢复](http.md#api客户端地址期限和恢复)
