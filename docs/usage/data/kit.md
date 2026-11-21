# kit 数据结构

[English](kit.en.md) · [日本語](kit.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/kit.md) · [功能说明](../function/kit.md)

<a id="example-data"></a>

## 这些数据用来做什么

### 某个访问者这一轮来了多少次

对应结构：`rate-limit cache value`。

服务端用这条记录限制同一访问者或业务范围的请求频率，多节点共用计数才不会各放行一份。

```json
{
  "count": 2,
  "resetAt": 1794873660000
}
```

count:2 表示本轮已计两次；resetAt 以 Unix 毫秒记录本轮结束时间。此例窗口60秒，更新计数不会再延长60秒。

### 浏览器请求中携带的访问 Cookie

对应结构：`hai_access_token`。

Kit 在服务端读取它，验证后才把用户身份交给页面或接口。

```json
"<access-token:redacted>"
```

值已脱敏，默认 HttpOnly、SameSite=Lax、Path=/，有效时间取登录返回值；客户端不能自己改角色取得权限。

### 应用选中加密的普通 Cookie

对应结构：`encrypted application cookie`。

需要把普通 Cookie 的值隐藏并防止篡改时，由服务端加密写入、读取时解密验证。

```json
"enc:v2:<encrypted-content>"
```

enc:v2: 是格式前缀，后面只是示意占位，不能用来真实解密；这不是防重放请求编号，也不改变原 Cookie 的期限。

## 字段、存储与清理参考

### 数据库与缓存

模块没有自己的 SQL 表。会话、审计和对象结构由 [IAM](iam.md)、[audit](audit.md) 和 [storage](storage.md) 管理。

### 缓存与 Cookie

| 逻辑键                         | 值                                                                                                                                           | 默认值与有效期                                                                                                               |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `hai:kit:ratelimit:{<digest>}` | `count` 是本段时间内已计数的请求数，`resetAt` 是响应中使用的重置时间（毫秒）。键里的 digest 由应用命名范围、统计时长和被限流对象一起计算得出 | 第一条请求记为 1，记录在 `windowMs` 毫秒后过期。每次递增都沿用已有的过期时间。写入 Redis 时会加上 cache 设置的 `keyPrefix`   |
| `hai_access_token`             | kit 认证 Cookie，值为 access token，可配置键名                                                                                               | Path 为 `/`，带 HttpOnly、SameSite=Lax，生产标记下启用 Secure。Max-Age 取登录返回的有效期，读取优先使用 Authorization Bearer |
| 应用选中加密处理的 Cookie      | 加密后的 Cookie 值带 `enc:v2:` 前缀                                                                                                          | 有效期沿用对应 Cookie，密钥和防重放记录见 [crypto](crypto.md)                                                                |

多个应用实例连接同一个 Redis 时，同一个限流对象共用一份计数。并发修改会核对旧值，避免请求数被覆盖。开发或测试可以显式启用进程内限流，各进程仍分别计数。
