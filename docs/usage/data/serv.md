# @h-ai/serv 数据结构

[English](serv.en.md) · [日本語](serv.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/serv.md) · [功能说明](../function/serv.md) · [订单运营台教程](../getting-started/serv.md)

订单运营台读取报表时，Serv 把已验证的审计员身份和请求编号交给报表处理函数。登录或刷新成功时，浏览器可保存下次续期所需的 Cookie。

<a id="runtime-data"></a>

## 请求上下文

`ServContext` 随业务请求创建，处理结束后释放。处理函数用以下字段确认当前用户及权限，并关联响应和日志。

| 字段 | 何时读取及含义 |
| --- | --- |
| `requestId` | 请求排查编号，可与响应的 `X-Request-Id` 对照。匿名请求也有编号。 |
| `session` | 使用共享 `HttpSession`，必填 `userId`、`roles`、`permissions`，可选 `username`、`displayName`、`avatarUrl` 和应用自定义的 `data`。未认证时省略。 |
| `ip` | 按可信代理规则解析的客户端地址。无法取得可信地址时省略。 |
| `locale` | 框架为本次请求选择的语言。 |
| `terminalType`、`userAgent` | 终端类别和可选的 User-Agent。默认上下文将未知终端视为 `web`；这两个字段仅作业务和日志参考。 |
| `scopeId` | 可选的业务范围，由宿主的可信上下文工厂提供，例如审计员所在的组织。Serv 的默认上下文不从请求头读取它。 |
| `request`、`logger` | 当前请求和日志对象。应用可在服务端读取，用于处理请求和排查。 |
| `accessToken` | 从 Bearer 头提取的访问令牌，仅在服务端使用。认证结果以 `session` 为准。 |

Serv 的 `ServSession` 与 Kit 的 `SessionData` 均使用 `@h-ai/core` 的 `HttpSession`。认证成功后，宿主把这些字段交给本次请求，过滤 `data._tokenPair`。已有会话的存储、续期和撤销继续由 IAM 管理。 [IAM 会话数据](iam.md)

<a id="example-data"></a>

### 请求处理函数收到的用户身份和排查编号

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
      "auditor"
    ],
    "permissions": [
      "reports:read"
    ]
  }
}
```

request-42 是排查编号，session 表示已验证的 user-42 可以读取报表。这里只列可展示字段，省略 Request 和 logger 对象；不能把客户端自报角色直接放进 session。

## 数据库

Serv 自身创建 0 张数据库表。订单、报表等业务数据由应用保存，启用 IAM 后由 [IAM](iam.md) 管理会话。

启用 A2A 后，这两个宿主只处理 HTTP，任务事件与消息由 AI 模块保存。 [A2A 任务和消息数据](ai.md#table-hai-ai-a2a-journal)

<a id="cache"></a>

## 缓存

启用 Redis 限流时，Serv 和 Kit 都使用下表的一类键。设限流主体 `key` 为可信客户端 IP（默认）或应用生成的分组键。框架用 `SHA-256(JSON.stringify([namespace, windowMs, key]))` 生成十六进制 `digest`，Cache 在 Redis 键前添加 `keyPrefix`。多个实例连接同一 Redis 数据库，且前缀、命名空间、窗口和主体相同时，会更新同一条记录。进程内存储按进程计数；它不会写入 Redis。密钥登记和防重放记录由 [Crypto](crypto.md) 管理。 [限流接入](../getting-started/serv.md#orders-console-access)

| 键或类别 | 用途 | 默认有效期与清理 |
| --- | --- | --- |
| [`hai:kit:ratelimit:{<digest>}`](#cache-http-rate-limit) | 限制同一访问者或业务范围的请求频率。 | 从第一次成功写入计数起 `windowMs` 毫秒。递增时保留现有期限，过期后下一次请求重新计数。 |

<a id="cache-http-rate-limit"></a>

### `hai:kit:ratelimit:{<digest>}`

| 值字段 | 类型 | 默认值 | 说明 | 示例 |
| --- | --- | --- | --- | --- |
| `count` | `integer` | — | 本轮累计计数，首次写入为 `1`。默认限流器的超额请求也计入。 | `2` |
| `resetAt` | `integer` | — | 第一次写入时估算的窗口结束时间，单位为 Unix 毫秒。共享存储实际以 Redis 键到期为准。 | `1794873660000` |

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

| 键 | 何时写入及生命周期 |
| --- | --- |
| `hai_refresh_token` | 启用刷新 Cookie 后，服务端把刷新令牌编码写入其中。默认 30 天有效，Path 只覆盖当前 API 前缀下的刷新路径。设置 HttpOnly、SameSite=Strict，并按环境或配置决定是否启用 Secure |
| Cookie 清除         | 显式登出成功时，以相同键和 Path 写空值并设置 `Max-Age=0`。刷新失败保留现有 Cookie。 |

### 浏览器下次刷新登录用的 Cookie

启用浏览器刷新 Cookie 后，服务端在登录、注册或刷新成功时写入新的刷新令牌，并从相应成功响应体移除该令牌。后续请求匹配刷新路径时，浏览器按 Cookie 属性发送它；何时发起刷新由客户端决定。

```http
Set-Cookie: hai_refresh_token=<redacted>; Path=/api/v1/auth/refresh; Max-Age=2592000; HttpOnly; SameSite=Strict; Secure
```

以上是生产 HTTPS 中默认 API 前缀的脱敏响应头。前缀调整后，`Path` 随刷新路由变化。Cookie 的保留时间和服务端令牌有效期分别检查。

受信原生终端可以通过认证响应接收令牌，设备端保存方式见 [Capacitor](capacitor.md)。

<a id="report-audio-data"></a>

## 报表语音数据

普通 HTTP 语音接口把输入交给配置的模型，并在当前请求返回结果。Serv 的媒体路由不会把录音、合成文件或转写结果写入应用数据库。运营台需要保留审计备注时，由应用在用户确认后保存文字。

| 操作 | 输入 | 返回 |
| --- | --- | --- |
| 合成报表朗读 | JSON 中的 `text` 和可选 `format` | 成功时是 WAV 或 MP3 文件，例如 `speech.mp3`（`audio/mpeg`）。 |
| 转写审计备注 | multipart 的 `audio` 文件，WAV 或 MP3，最大 8 MiB | JSON 的 `data.text`，模型还可能返回 `language` 和毫秒单位的 `durationMs`。 |

```json
{
  "success": true,
  "data": { "text": "Quarterly summary", "language": "en", "durationMs": 1250 }
}
```

这是一次转写响应。页面可以将 `data.text` 放入备注输入框。若应用改用实时 WebSocket，短期一次性票据由 IAM 管理，票据只用于建连授权。 [语音 HTTP 教程](../getting-started/serv.md#orders-console-audio) · [IAM 票据记录](iam.md#cache-iam-ticket)

实时票据响应包含 `ticket` 与 Unix 毫秒值 `expiresAt`，默认有效 30 秒。票据绑定用户与操作，建连时原子消费。启用 `serv.createIamAudio()` 时会重新检查 IAM 权限；连接仅在本次会话期间保存授权。
