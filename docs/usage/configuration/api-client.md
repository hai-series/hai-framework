# API Client 配置

[配置手册](README.md)

## 配置入口

调用 `apiClient.init(config)` 配置默认实例，也可以用 `apiClient.create(contract)` 创建独立的类型化实例。地址、认证、网络请求和传输加密由宿主通过 `ApiClientConfig` 注入。静态站或原生应用把公开 API 地址从自己的运行配置读出后交给 `baseUrl`。

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

| 配置项                        | 默认值/必填                               | 说明                                                                                                        |
| ----------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `baseUrl`                     | 必填                                      | 完整 API 基础地址，通常含 `/api/v1`。刷新、密钥交换及业务请求都以此地址为基础                               |
| `timeout`                     | `30000`                                   | 请求到响应头及 JSON 正文读取完毕的期限，单位毫秒。读取流式正文时使用调用方的取消信号                        |
| `clientName`                  | `hai-api-client`                          | 写入 `x-request-client`，便于服务端关联诊断                                                                 |
| `headers`                     | 无附加标头                                | 静态对象或返回请求头的同步/异步函数                                                                         |
| `fetch`                       | 全局 `fetch`                              | 注入桥接或测试实现时，保留标准响应、取消及 Cookie 语义                                                      |
| `auth`                        | 不启用自动认证                            | 传入 `{}` 启用默认的 Token 管理、注入与刷新                                                                 |
| `auth.storage`                | `apiClient.tokenStorage.httpOnlyCookie()` | 浏览器中访问令牌放内存，刷新 Cookie 由服务端管理。SSR 和测试可用各自独立的 `memory()`，原生端可注入安全存储 |
| `auth.refreshPath`            | `/auth/refresh`                           | 相对于 `baseUrl` 的服务端刷新路径                                                                           |
| `auth.refreshTimeoutMs`       | `10000`                                   | 刷新请求超时毫秒数，超时保留已有凭据供后续重试                                                              |
| `auth.terminalType`           | `web`                                     | 会话终端类别，也可用 `app`、`desktop`、`api`。需与 IAM 允许的类别一致                                       |
| `auth.recoverSession`         | 可省略                                    | 刷新明确失效后尝试恢复同一用户会话。返回 `true` 时自动重试原请求一次                                        |
| `auth.onTokenRefreshed`       | 可省略                                    | 成功刷新后通知宿主，例如更新会话状态                                                                        |
| `auth.onRefreshFailed`        | 可省略                                    | 刷新明确失败时通知宿主，例如返回登录页                                                                      |
| `transport`                   | 不启用加密                                | 传入对象启用端到端应用层传输加密                                                                            |
| `transport.crypto`            | 启用时必填                                | 已初始化的 `@h-ai/crypto` 运行实例                                                                          |
| `transport.keyExchangePath`   | `/_hai/key-exchange`                      | 相对于 `baseUrl` 的密钥协商路径，须与宿主暴露的地址一致                                                     |
| `transport.maxPlaintextBytes` | 跟随服务端                                | 可选客户端明文字节上限，指定时取客户端和服务端较小值                                                        |

## 生效与核对

`apiClient.config` 可用于检查脱敏后的运行配置。分别核对业务请求、刷新、主动退出及原生存储，调试日志中只记录追踪编号及可公开的元信息。[地址、期限和恢复](http.md#api客户端地址期限和恢复)
