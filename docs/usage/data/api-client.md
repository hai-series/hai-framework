# @h-ai/api-client 数据结构

<a id="api-client-数据结构"></a>

[English](api-client.en.md) · [日本語](api-client.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/api-client.md) · [功能说明](../function/api-client.md)

客户端把登录凭据交给应用选定的 `TokenStorage`，将接口响应交给调用方，并向订阅者提供请求摘要。它不创建数据库表、缓存键或数据文件。[IAM](iam.md) 保存服务端会话，各业务模块保存各自记录，应用决定是否留存接口数据和请求摘要。

<a id="browser-storage"></a>

## 凭据存储

应用传入 `auth: {}` 即启用默认 Cookie 存储。应用也可通过 `auth.storage` 选择其他适配器。通过 `apiClient.createAuthActions(client)` 登录成功，或客户端自动刷新成功后，服务端签发的令牌会写入所选存储。直接调用登录操作时，由应用调用 `client.auth.setTokens(tokens)` 写入成功结果中的令牌。通过 `client.auth` 更新和清理已绑定客户端的凭据。见[认证操作](../function/api-client.md#auth-actions)。

| 存储 | 保存的数据 | 保留与清理 |
| --- | --- | --- |
| `apiClient.tokenStorage.httpOnlyCookie()` | 访问令牌保存在适配器内存中。浏览器保管服务端通过 `Set-Cookie` 设置的 HttpOnly 刷新 Cookie，页面 JavaScript 无法读取其中的令牌。 | 页面重新加载后内存令牌随旧运行环境消失。浏览器按 Cookie 属性保留、发送或清除刷新 Cookie。适配器的 `clear()` 仅清理其内存状态。 |
| `apiClient.tokenStorage.memory()` | 每个适配器在内存中保存可用的访问令牌与刷新令牌。 | 新对象为空。数据保留到显式清理或适配器随运行环境销毁。SSR 为每次请求创建独立客户端和存储。 |
| 应用注入的 `TokenStorage` | 适配器实现两种令牌的异步读取、写入和清理。原生应用可使用 [Capacitor 安全存储](capacitor.md)。 | 数据的保留范围由适配器决定。持久化适配器可在应用重启后读回凭据。浏览器应使用 HttpOnly 模式保存刷新凭据。 |

退出登录时，调用应用的服务端退出接口，例如 `client.iam.auth.logout({})`。确认返回成功后，才能确认服务端会话已撤销。Cookie 模式由服务端通过响应清除刷新 Cookie。无论服务端结果如何，都调用 `client.auth.clear()` 清理本地凭据。`client.close()` 等待当前的存储操作结束，并释放运行状态和观察订阅。应用仍负责注入存储中的数据。见[凭据刷新](../function/api-client.md#credentials)、[客户端生命周期](../function/api-client.md#client-lifecycle)和 [Serv 会话与 Cookie](serv.md)。

TokenStorage 的读写方法与只用内存的验证示例见[适配器方法](../function/api-client.md#token-storage-methods)。

<a id="example-data"></a>

### 客户端当前持有的登录凭据

以下是可信客户端从服务端响应体收到的 `TokenPair`，令牌已脱敏。`accessToken` 是发送在 `Authorization: Bearer ...` 请求头中的访问凭据，`expiresIn` 是它的有效期（秒）。`tokenType` 固定为 `"Bearer"`。`refreshToken` 可缺省，服务端使用 HttpOnly 刷新 Cookie 时从响应体省略该字段。

```json
{
  "accessToken": "<access-token:redacted>",
  "refreshToken": "<refresh-token:redacted>",
  "expiresIn": 3600,
  "tokenType": "Bearer"
}
```

<a id="response-data"></a>

## 接口数据

契约决定调用所需的路径参数、查询参数、请求体和响应结构。客户端按操作定义发送数据，服务端保存业务记录。框架业务操作通常返回 `HaiResult<T>`。先读 `success`，成功时用 `data`，失败时用 `error.code` 对应处理，`error.message` 提供诊断，`error.traceId` 可供关联请求。

自定义操作可以声明裸 JSON 值或 SSE 流。成功时直接取得对应值或可遍历的流。请求失败仍可能返回 `HaiResult` 失败分支，因此先按契约区分失败，再使用裸值或读取流。见[自定义响应](../function/api-client.md#custom-response-results)。

### 一次接口调用的结果

登录后，`client.iam.auth.currentUser()` 成功时返回账号资料、角色和权限。日期以 ISO 字符串表示。应用可按当前时区显示。

```json
{
  "success": true,
  "data": {
    "id": "u-42",
    "username": "alice",
    "accountStatus": "active",
    "createdAt": "2026-05-20T10:00:00.000Z",
    "updatedAt": "2026-05-20T10:15:00.000Z",
    "roles": ["member"],
    "permissions": []
  }
}
```

如果调用时客户端尚未初始化，则返回失败分支。判断 `success` 后，应用可根据 `error.code` 检查初始化流程。消息文字随客户端语言设置变化。

```json
{
  "success": false,
  "error": {
    "code": "hai:api-client:010",
    "message": "内部错误 (traceId: request-42)",
    "traceId": "request-42",
    "httpStatus": 500,
    "system": "hai",
    "module": "api-client"
  }
}
```

<a id="request-records"></a>

## 请求观察记录

`client.observeRequests(observer)` 为每次逻辑调用提供一份只读的 `ApiRequestRecord`。刷新及重试合并在原调用内，SSE 只在返回流时产生一份摘要。诊断系统和保留期限由订阅方决定。见[请求观察接口](../function/api-client.md#transport-observation)。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `requestId` | `string` | 调用关联 ID。沿用当前请求上下文中的 ID 或在客户端生成。收到有效的服务端关联 ID 后可以更新。 |
| `procedure` | `string` | 契约中的操作路径，例如 `reports.get`。 |
| `timestamp`、`duration` | `number` | 开始时间为 Unix 毫秒，调用耗时单位为毫秒。 |
| `success`、`errorCode` | `boolean`、可选 `string` | 分别表示调用结果和可用的错误码。HTTP 200 的业务失败同样记为 `success: false`。 |
| `attempts` | `number` | 原请求的发送次数，包含重试。请求未发出时为 0，刷新和密钥协商不计入。 |
| `method`、`url` | 可选 `string` | HTTP 方法和脱敏 URL。URL 保留实际路径及填入的路径参数，移除查询字符串和片段。 |
| `status` | 可选 `number` | 收到的 HTTP 响应状态码。 |

例如，`reports.get` 首次请求成功时可以得到下面的摘要。记录不包含请求或响应的正文与头部。转发摘要前，可按应用的日志规则进一步处理 URL 中的业务标识。

```json
{
  "requestId": "request-42",
  "procedure": "reports.get",
  "timestamp": 1779271200000,
  "duration": 18,
  "success": true,
  "attempts": 1,
  "method": "GET",
  "url": "https://app.example.com/api/v1/reports/r-42",
  "status": 200
}
```
