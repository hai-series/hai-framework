# @h-ai/api-client 数据结构

<a id="api-client-数据结构"></a>

[English](api-client.en.md) · [日本語](api-client.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/api-client.md) · [功能说明](../function/api-client.md)

应用启用 `auth` 后，客户端可用刷新凭据更新过期的访问令牌。应用通过所选的 `TokenStorage` 管理本地凭据，通过接口结果判断业务是否成功。

<a id="browser-storage"></a>

## 凭据存储

客户端没有 SQL 表或 Redis 键。会话的持久状态由 [IAM](iam.md) 管理。调用 `client.close()` 会释放客户端资源，仍由宿主管理注入的存储。退出登录时，服务端退出接口撤销会话，并通过响应清除浏览器的刷新 Cookie。应用再用 `client.auth.clear()` 清除本地凭据。

| 存储方式                                          | 数据                                                                                                                 | 生命周期                                                                                     |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `apiClient.tokenStorage.httpOnlyCookie()`（默认） | 访问令牌在当前客户端的内存里。刷新时浏览器发送由服务端设置的 HttpOnly Cookie，页面 JavaScript 读不到 Cookie 中的令牌 | 访问令牌初始为空，重新加载页面后会丢失。[serv](serv.md) 管理刷新 Cookie                      |
| `apiClient.tokenStorage.memory()`                 | 同一个存储对象在内存中保存访问令牌和刷新令牌                                                                         | 初始为空。清除凭据或销毁该对象后无法继续读取。服务端可按请求或会话创建独立对象               |
| 自定义 `TokenStorage`                             | 应用实现两个令牌的读、写和删除                                                                                       | 原生设备可用 [capacitor](capacitor.md) 的安全存储。默认浏览器模式不会将令牌写入 localStorage |

<a id="example-data"></a>

### 客户端当前持有的登录凭据

客户端发送 access token 访问已登录接口，必要时用 refresh token 取得新凭据。

```json
{
  "accessToken": "<access-token:redacted>",
  "refreshToken": "<refresh-token:redacted>"
}
```

这里是凭据的查看示意，值已脱敏。默认浏览器模式的 refresh token 在 HttpOnly Cookie 中，页面代码不能读取，也不应把它写进 localStorage。

<a id="response-data"></a>

## 接口数据

### 一次接口调用的结果

登录页可在保存访问令牌后调用 `client.iam.auth.currentUser()` 载入当前账号。先检查 `success`，成功时用 `data` 显示身份资料，失败时读取 `error`。

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

示例节选当前用户的资料、角色和权限。客户端校验后保留 ISO 日期字符串，应用可按用户时区显示。重新加载页面后需要重新取得会话资料，服务端仍会逐次校验权限。自定义端点也可直接返回 JSON 值或 SSE，失败时先判断 `HaiResult` 分支。见[自定义响应](../function/api-client.md#custom-response-results)。
