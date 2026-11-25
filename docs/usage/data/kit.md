# @h-ai/kit 数据结构

<a id="kit-数据结构"></a>

[English](kit.en.md) · [日本語](kit.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/kit.md) · [功能说明](../function/kit.md)

应用开启限流后，Kit 保存访问者在当前窗口内的请求计数。处理浏览器请求时，Kit 还读取登录 Cookie 或按宿主配置封装 Cookie 数据。

<a id="cache"></a>

## 缓存

应用选择共享限流存储时，Kit 使用 1 类键。键中的 `digest` 是命名空间、`windowMs` 和被限流对象的 SHA-256 摘要。Redis 会加上 Cache 的 `keyPrefix`。多个实例共用 Redis 时读取同一份计数，进程内模式各进程分别计数。

| 键或类别 | 用途 | 默认有效期与清理 |
| --- | --- | --- |
| [`hai:kit:ratelimit:{<digest>}`](#cache-kit-rate-limit) | 限制同一访问者或业务范围的请求频率。 | 从第一次请求起 `windowMs` 毫秒。递增时保留现有期限，过期后下一次请求重新计数。 |

<a id="cache-kit-rate-limit"></a>

### `hai:kit:ratelimit:{<digest>}`

| 值字段 | 类型 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- |
| `count` | `integer` | — | 本轮请求计数，第一次写入为 `1`。 | `2` |
| `resetAt` | `number` | — | 首次请求时间加窗口时长，以 Unix 毫秒记录。响应头用此值估算剩余时间。 | `1794873660000` |

<a id="example-data"></a>

<a id="某个访问者这一轮来了多少次"></a>

#### 示例 · 某个访问者这一轮来了多少次

服务端用这条记录限制同一访问者或业务范围的请求频率，多节点共用计数才不会各放行一份。

```json
{
  "count": 2,
  "resetAt": 1794873660000
}
```

count:2 表示本轮已计两次；resetAt 以 Unix 毫秒记录本轮结束时间。此例窗口60秒，更新计数不会再延长60秒。

<a id="browser-storage"></a>

## 浏览器存储

浏览器持有的 Cookie 随请求提交。

| Cookie | 值与保留时间 |
| --- | --- |
| `hai_access_token` | `hai_access_token` 默认保存 access token，键名可配置。`Path=/`，启用 `HttpOnly`、`SameSite=Lax`，生产启用 `Secure`。`Max-Age` 使用签发的有效期。请求同时带 Bearer 时优先读取 Bearer。 |
| 应用选中加密的 Cookie | 密文以 `enc:v2:` 开头，有效期沿用原 Cookie。密钥和传输状态见 [Crypto](crypto.md)。 |

### 浏览器请求中携带的访问 Cookie

Kit 在服务端读取它，验证后才把用户身份交给页面或接口。

```json
"<access-token:redacted>"
```

值已脱敏，默认 HttpOnly、SameSite=Lax、Path=/，有效时间取登录返回值；客户端不能自己改角色取得权限。

### 应用选中加密的普通 Cookie

需要把普通 Cookie 的值隐藏并防止篡改时，由服务端加密写入、读取时解密验证。

```json
"enc:v2:<encrypted-content>"
```

enc:v2: 是格式前缀，后面只是示意占位，不能用来真实解密；这不是防重放请求编号，也不改变原 Cookie 的期限。
