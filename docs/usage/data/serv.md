# serv 数据结构

[English](serv.en.md) · [日本語](serv.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/serv.md) · [功能说明](../function/serv.md)

<a id="example-data"></a>

## 这些数据用来做什么

### 请求处理函数收到的用户身份和排查编号

对应结构：`ServContext`。

处理函数用上下文知道当前用户是谁、能做什么，以及发生错误时查哪次请求。

```json
{
  "requestId": "request-42",
  "locale": "zh-CN",
  "ip": "192.0.2.42",
  "terminalType": "web",
  "session": {
    "userId": "user-42",
    "roles": [
      "reader"
    ],
    "permissions": [
      "orders.read"
    ]
  }
}
```

request-42 是排查编号，session 表示已验证的 user-42 有读订单权限。这里只列可展示字段，省略 Request 和 logger 对象；不能把客户端自报角色直接放进 session。

### 浏览器下次刷新登录用的 Cookie

对应结构：`hai_refresh_token`。

浏览器自动携带刷新 Cookie 向刷新接口换新令牌，页面脚本读不到其中凭据。

```json
"<refresh-token:redacted>"
```

值已脱敏；默认30天、HttpOnly、SameSite=Strict，Path 仅覆盖 API 刷新路径。服务端令牌提前失效时，Cookie 仍存在也不能刷新。

## 字段、存储与清理参考

### 数据库与缓存

HTTP 路由、请求校验和错误处理中间件没有自己的数据库表或 Redis 键。用户会话在 [IAM](iam.md) 管理，审计事件、文件和向量分别存到 [audit](audit.md)、[storage](storage.md) 和 [AI](ai.md) 使用的存储。需要对多个 API 服务实例统一限流时，可查 [kit](kit.md) 使用的计数键。

### Cookie 和请求上下文

| 数据                | 默认值与用途                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hai_refresh_token` | 启用刷新 Cookie 后，服务端把刷新令牌编码写入其中。默认 30 天有效，Path 只覆盖当前 API 前缀下的刷新路径。设置 HttpOnly、SameSite=Strict，并按环境或配置决定是否启用 Secure |
| Cookie 清除         | 以相同键和 Path 写空值，设置 Max-Age=0                                                                                                                                    |
| 原生认证响应        | 服务端启用原生令牌模式并通过请求校验后，可以把令牌放入响应数据。设备保存方式见 [capacitor](capacitor.md)                                                                  |
| 请求上下文          | 每次请求记录当前用户、语言、追踪编号和中间件提供的数据，请求结束后释放                                                                                                    |
