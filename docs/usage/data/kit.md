# @h-ai/kit 数据结构

[English](kit.en.md) · [日本語](kit.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/kit.md) · [功能说明](../function/kit.md) · [订单运营台教程](../getting-started/kit.md)

订单运营台读取报表时，Kit 把已验证的审计员身份和请求编号交给 SvelteKit 的服务端页面和接口。合作方调用外部报表时，启用的限流存储会记录访问次数。

<a id="runtime-data"></a>

## 请求上下文

`kit.createHandle()` 将请求上下文写入 SvelteKit 的 `event.locals`。服务端 load、action 和 API 守卫在处理期间读取这些字段。

| 字段 | 何时读取及含义 |
| --- | --- |
| `event.locals.requestId` | 请求排查编号，可与响应的 `X-Request-Id` 对照。匿名请求也有编号。 |
| `event.locals.session` | 使用共享 `HttpSession`，必填 `userId`、`roles`、`permissions`，可选 `username`、`displayName`、`avatarUrl` 和应用自定义的 `data`。未认证时省略。 |
| `event.getClientAddress()` | 读取 Kit 按可信代理规则解析的地址。静态预渲染或无法确认客户端地址时，调用可能抛错。 |
| `event.locals.accessToken` | 成功验证的当前访问令牌，只在服务端读取。 |

Serv 的 `ServSession` 与 Kit 的 `SessionData` 均使用 `@h-ai/core` 的 `HttpSession`。认证成功后，宿主把这些字段交给本次请求，过滤 `data._tokenPair`。已有会话的存储、续期和撤销继续由 IAM 管理。 [IAM 会话数据](iam.md)

以下是服务端收到的节选。

```json
{
  "requestId": "request-42",
  "session": {
    "userId": "user-42",
    "roles": ["auditor"],
    "permissions": ["reports:read"]
  }
}
```

`request-42` 可关联本次响应的 `X-Request-Id`。匿名请求也有追踪编号。浏览器页面只接收所需的展示字段，`locals.accessToken` 留在服务端。 [请求管道](../function/kit.md#hooks)

## 数据库

Kit 自身创建 0 张数据库表。订单、报表等业务数据由应用保存，启用 IAM 后由 [IAM](iam.md) 管理会话。

启用 A2A 后，这两个宿主只处理 HTTP，任务事件与消息由 AI 模块保存。 [A2A 任务和消息数据](ai.md#table-hai-ai-a2a-journal)

<a id="cache"></a>

## 缓存

启用 Redis 限流时，Serv 和 Kit 都使用下表的一类键。设限流主体 `key` 为可信客户端 IP（默认）或应用生成的分组键。框架用 `SHA-256(JSON.stringify([namespace, windowMs, key]))` 生成十六进制 `digest`，Cache 在 Redis 键前添加 `keyPrefix`。多个实例连接同一 Redis 数据库，且前缀、命名空间、窗口和主体相同时，会更新同一条记录。进程内存储按进程计数；它不会写入 Redis。密钥登记和防重放记录由 [Crypto](crypto.md) 管理。 [限流接入](../getting-started/kit.md#orders-console-access)

| 键或类别 | 用途 | 默认有效期与清理 |
| --- | --- | --- |
| [`hai:kit:ratelimit:{<digest>}`](#cache-kit-rate-limit) | 限制同一访问者或业务范围的请求频率。 | 从第一次成功写入计数起 `windowMs` 毫秒。递增时保留现有期限，过期后下一次请求重新计数。 |

<a id="cache-kit-rate-limit"></a>

### `hai:kit:ratelimit:{<digest>}`

| 值字段 | 类型 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- |
| `count` | `integer` | — | 本轮累计计数，首次写入为 `1`。默认限流器的超额请求也计入。 | `2` |
| `resetAt` | `integer` | — | 第一次写入时估算的窗口结束时间，单位为 Unix 毫秒。共享存储实际以 Redis 键到期为准。 | `1794873660000` |

<a id="example-data"></a>

#### 示例 · 某个访问者这一轮来了多少次

设某客户端在 2026 年 11 月 17 日 00:00:00 UTC 触发第一次计数，窗口为 60 秒，额度为 2 次。下列记录出现在同一客户端的第二次请求之后。

```json
{
  "count": 2,
  "resetAt": 1794873660000
}
```

`count: 2` 表示额度已用完。该客户端在窗口内的第三次请求会把计数加到 `3`，并收到默认的 HTTP 429。`resetAt` 仍是 00:01:00 UTC 的估算值。Redis 键到期后，下一次请求从 `1` 开始。

缓存的 `resetAt` 用毫秒。响应头 `X-RateLimit-Reset` 把它向上取整为 Unix 秒；超限时的 `Retry-After` 是还需等待的秒数。

<a id="browser-storage"></a>

## 浏览器存储

浏览器持有的 Cookie 随请求提交。

| Cookie | 值与保留时间 |
| --- | --- |
| `hai_access_token` | `hai_access_token` 默认保存 access token，键名可配置。`Path=/`，启用 `HttpOnly`、`SameSite=Lax`，生产启用 `Secure`。`Max-Age` 使用签发的有效期。请求同时带 Bearer 时优先读取 Bearer。 |
| 应用选中加密的 Cookie | 密文以 `enc:v2:` 开头，有效期沿用原 Cookie。密钥和传输状态见 [Crypto](crypto.md)。 |

### 浏览器请求中携带的访问 Cookie

登录写入已签发的访问令牌，后续请求由认证 Hook 验证。登出时使用相同的名称和路径删除 Cookie，即使服务端撤销会话失败也会清除浏览器凭据。调用方可通过登出结果识别撤销失败。

```http
Set-Cookie: hai_access_token=<redacted>; Path=/; Max-Age=900; HttpOnly; SameSite=Lax; Secure
```

以上是生产 HTTPS 中的脱敏响应头。`Max-Age` 的示例值为 900 秒，实际值取登录返回的 `tokens.expiresIn`。

### 应用选中加密的普通 Cookie

需要把普通 Cookie 的值隐藏并防止篡改时，由服务端加密写入、读取时解密验证。

```json
"enc:v2:<iv>:<ciphertext>:<mac>"
```

`enc:v2:` 标明格式。后续三段是随机 IV、密文和认证码的占位符。Kit 用认证码校验 Cookie 的名称及封装。读取被篡改或无法解密的值会得到 `undefined`。应用通过 `event.cookies.get("order_preferences")` 获取已验证的明文。
