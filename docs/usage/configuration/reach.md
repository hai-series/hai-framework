# Reach 配置

[English](reach.en.md) · [日本語](reach.ja.md)

[配置手册](README.md) · [数据结构](../data/reach.md) · [功能说明](../function/reach.md)

## 配置入口

生成的项目把发送渠道、模板和免打扰规则放在 `config/_reach.yml`。应用启动时读取这份配置并传给 `reach.init()`。修改配置后重启应用。若使用模板、延迟发送或凭据通知，要先初始化数据库。

给每个渠道取一个不同的 `name`，例如 `email` 或 `warehouse-webhook`。应用按这个名字选渠道。示例中的 `${HAI_REACH_...}` 从服务端私有环境读取。环境覆盖与文件优先级见[配置从哪里来](runtime.md#配置从哪里来)。

<a id="configuration-fields"></a>

## 配置清单

### 通道共用字段

| 字段 | 类型 | 必填或默认值 | 用途 |
| --- | --- | --- | --- |
| `providers` | 列表 | 必填，至少一项 | 这个服务可使用的发送渠道 |
| `providers[].name` | 非空字符串 | 必填，每项唯一 | 应用或模板用这个名字选渠道 |
| `providers[].type` | 字符串 | 必填 | `console`（本地日志）、`smtp`、`aliyun-sms` 或 `api` |

### SMTP

以下字段位于 `providers[]` 中，适用于 `type: smtp`。

| 字段 | 类型 | 必填或默认值 | 用途 |
| --- | --- | --- | --- |
| `host` | 非空字符串 | 必填 | SMTP 服务器主机名 |
| `port` | 整数，1–65535 | `465` | 服务器端口 |
| `secure` | 布尔值 | `true` | 建立连接时是否直接使用 TLS |
| `user` | 字符串 | 可省略 | 启用 SMTP 认证时使用的用户名 |
| `pass` | 字符串 | 可省略 | SMTP 认证密码，由服务端私有环境提供 |
| `from` | 非空字符串 | 必填 | 邮件服务允许使用的发件地址 |

### 阿里云短信

以下字段位于 `providers[]` 中，适用于 `type: aliyun-sms`。

| 字段 | 类型 | 必填或默认值 | 用途 |
| --- | --- | --- | --- |
| `accessKeyId` | 非空字符串 | 必填 | 用于签名的阿里云 AccessKey ID |
| `accessKeySecret` | 非空字符串 | 必填 | 用于签名的 AccessKey Secret，由服务端私有环境提供 |
| `signName` | 非空字符串 | 必填 | 已审核的短信签名 |
| `endpoint` | 字符串 | `dysmsapi.aliyuncs.com` | 直连时的主机名 |
| `templateCodes` | 键和值均为非空字符串的映射 | 可省略 | 从 Reach 模板名找到已审核编码。直连发送时要能在此找到编码，或由消息指定 `extra.templateCode` |
| `gateway` | 对象 | 可省略 | 配置后将签名请求转发给网关 |
| `gateway.url` | HTTP(S) URL | 配置 `gateway` 时必填 | 写完整路径。地址中不能有凭据、查询串或片段 |
| `gateway.allowInsecureHttp` | 布尔值 | `false` | 允许受信内网使用明文 HTTP |
| `gateway.headers` | 字符串到字符串的映射 | 可省略 | 网关附加请求头。`Host` 和 `Content-Length` 等由 HTTP 客户端管理 |
| `gateway.body` | 字符串、数组或对象 | 可省略 | 字符串原样发送。数组和对象会转成 JSON |

### HTTP API

以下字段位于 `providers[]` 中，适用于 `type: api`。

| 字段 | 类型 | 必填或默认值 | 用途 |
| --- | --- | --- | --- |
| `url` | HTTP(S) URL | 必填 | 接收通知的地址 |
| `method` | `POST` 或 `PUT` | `POST` | 发送通知所用的 HTTP 方法 |
| `headers` | 字符串到字符串的映射 | 可省略 | 附加请求头，例如 `X-Api-Key`。`Idempotency-Key` 由 Reach 填写 |
| `timeout` | 非负整数，毫秒 | `10000` | 单次请求等待时间。`0` 会在计时器触发时取消请求 |
| `redirect` | `error` 或 `follow` | `error` | 默认拒绝重定向。设为 `follow` 可跟随重定向，须满足 `requireHttps` 未开启 |
| `requireHttps` | 布尔值 | 可省略 | `true` 只允许 HTTPS 地址，且要求 `redirect` 为 `error` |
| `idempotent` | 布尔值 | `false` | 告诉 Reach，接收方会保存请求编号并按编号去重。Reach 据此判断结果不明的排队请求能否重试，见[仓库通知示例](#reach-example-warehouse) |

### 模板

| 字段 | 类型 | 必填或默认值 | 用途 |
| --- | --- | --- | --- |
| `templates` | 列表 | 可省略 | 初始化时按名称保存到数据库的模板 |
| `templates[].name` | 非空字符串 | 必填 | 应用发送时选择的模板名 |
| `templates[].provider` | 非空字符串 | 必填 | 这个模板默认走的渠道名 |
| `templates[].subject` | 字符串 | 可省略 | 邮件主题模板，可写 `{变量名}` |
| `templates[].body` | 非空字符串 | 必填 | 正文模板，可写 `{变量名}` |

### 免打扰和重试

| 字段 | 类型 | 必填或默认值 | 用途 |
| --- | --- | --- | --- |
| `dnd` | 对象 | 可省略 | 全部渠道共用的免打扰设置 |
| `dnd.enabled` | 布尔值 | `false` | 打开后按下面的时段和策略处理 |
| `dnd.strategy` | `discard` 或 `delay` | `discard` | `discard` 拒绝发送。`delay` 将普通消息保存到数据库，稍后发送 |
| `dnd.start` | `HH:mm` 字符串 | `'00:00'` | 免打扰起点，包含这个时刻 |
| `dnd.end` | `HH:mm` 字符串 | `'00:00'` | 免打扰终点，从这个时刻起允许发送 |
| `queue` | 对象 | 省略时使用下列默认值 | 排队消息的尝试次数和失败后等待规则 |
| `queue.maxAttempts` | 整数，1–100 | `5` | 含首次尝试的总次数 |
| `queue.retryDelayMs` | 整数，1000–86400000 毫秒 | `60000` | 第一次可重试失败后等多久 |
| `queue.maxRetryDelayMs` | 整数，1000–86400000 毫秒 | `3600000` | 等待时长翻倍时的上限，须不小于 `retryDelayMs` |

验证码等需要立即尝试发送的消息可传 `ignoreDnd: true`。这项选择只作用于本次发送。IAM 通过 Reach 发送内置验证码、密码重置和初始设密邀请时会自动开启。见[夜间通知示例](../function/reach.md#reach-quiet-hours)。

## 配置示例

每个示例都是一份独立的 `_reach.yml`。选一个场景复制，将示例地址、短信模板编码和凭据换成你实际使用的值。

<a id="reach-example-local"></a>

### 在本地检查发送路径

先用控制台渠道。应用选择 `local` 发送时，可在本机日志确认调用走到了 Reach。此配置只适用于开发和测试，生产环境会拒绝 `console` 渠道。

```yaml schema=@h-ai/reach:ReachConfigSchema
providers:
  - name: local
    type: console
```

<a id="reach-example-email-code"></a>

### 用 SMTP 发送验证码和订单邮件

使用 SMTP 服务的 `465` 端口和 TLS，`from` 填服务允许的发件地址。在服务端私有环境提供用户名和密码。应用发送时选择 `order-received` 模板，传入 `orderId: order-42`。邮件主题会是 `Order order-42 received`，默认走 `email` 渠道。

```yaml schema=@h-ai/reach:ReachConfigSchema
providers:
  - name: email
    type: smtp
    host: smtp.example.com
    port: 465
    secure: true
    user: ${HAI_REACH_PROVIDERS_0_USER}
    pass: ${HAI_REACH_PROVIDERS_0_PASS}
    from: orders@example.com
templates:
  - name: otp_email
    provider: email
    subject: Your sign-in code
    body: '<p>Your sign-in code is {code}.</p>'
  - name: order-received
    provider: email
    subject: 'Order {orderId} received'
    body: 'Order {orderId} was received.'
```

登录验证码使用模板 `otp_email`。传入测试值 `vars: { code: '123456' }` 后，邮件主题是 `Your sign-in code`，正文里的 `{code}` 会变成 `123456`。实际发送使用应用签发的验证码。调用见 [邮件验证码](../function/reach.md#reach-email-code)。

### 把通知发送到公司的 HTTP 网关

应用选 `company-notify` 发送时，Reach 会把收件目标和正文等数据放进 JSON，向 `url` 发 POST。这里每次最多等 5 秒，要求 HTTPS 并拒绝重定向。接收服务若返回空正文的 HTTP `204`，本次调用就视为渠道已受理。此示例显式保留 `idempotent: false`，适合还没有按请求编号去重的服务。

```yaml schema=@h-ai/reach:ReachConfigSchema
providers:
  - name: company-notify
    type: api
    url: https://notify.example.com/messages
    method: POST
    timeout: 5000
    requireHttps: true
    redirect: error
    idempotent: false
    headers:
      X-Api-Key: ${HAI_REACH_PROVIDERS_0_HEADERS_X_API_KEY}
```

<a id="reach-example-sms-code"></a>

### 用阿里云发送验证码短信

在 Reach 里把模板命名为 `otp_sms`，通过模板的 `provider: sms` 选短信渠道。在该渠道的 `templateCodes` 中，将 `otp_sms` 对应到阿里云审核通过的模板编码。阿里云模板里的变量名也要是 `code`。

```yaml schema=@h-ai/reach:ReachConfigSchema
providers:
  - name: sms
    type: aliyun-sms
    accessKeyId: ${HAI_REACH_PROVIDERS_0_ACCESSKEYID}
    accessKeySecret: ${HAI_REACH_PROVIDERS_0_ACCESSKEYSECRET}
    signName: ${HAI_REACH_PROVIDERS_0_SIGNNAME}
    endpoint: dysmsapi.aliyuncs.com
    templateCodes:
      otp_sms: SMS_100000001
      password_reset_sms: SMS_100000002
templates:
  - name: otp_sms
    provider: sms
    body: 'Your verification code is {code}.'
  - name: password_reset_sms
    provider: sms
    body: 'Reset your password: {resetUrl}. Expires at {expiresAt}.'
```

应用传 `template: 'otp_sms'` 和 `vars: { code: '123456' }` 时，Reach 会替换本地模板正文中的 `{code}`，并向阿里云发送 `TemplateCode=SMS_100000001` 和 `TemplateParam={"code":"123456"}`。用户收到的是阿里云审核过并填入 `code` 的短信。`123456` 是测试值，真实发送使用本次签发的验证码。调用见 [短信验证码](../function/reach.md#reach-sms-code)。

`endpoint` 填直连主机名，省略时使用 `dysmsapi.aliyuncs.com`。Reach 会加上 `https://`、路径 `/` 和签名参数。单次发送可通过 `extra.templateCode` 覆盖模板编码。

手机找回密码用 `password_reset_sms`，阿里云模板接收 `token`、`expiresAt` 和 `resetUrl`。请把两个示例编码换成各自审核通过的编码。

<a id="reach-example-sms-gateway"></a>

### 通过自有网关转发阿里云短信

给 `aliyun-sms` 加上 `gateway` 后，Reach 会向 `gateway.url` 发 POST。`endpoint` 只用于直连。`gateway.url` 要包含完整路径，签名参数由 Reach 加到查询串。下例把网关凭据放进 `Authorization` 请求头，把 `body` 对象作为 JSON 发送。网关把签名参数转发给阿里云，并返回 HTTP `2xx` 和 `{"Code":"OK","BizId":"<消息编号>"}` 这样的受理结果。运维日志应对查询串脱敏，因为其中有手机号和模板变量。

```yaml schema=@h-ai/reach:ReachConfigSchema
providers:
  - name: sms
    type: aliyun-sms
    accessKeyId: ${HAI_REACH_PROVIDERS_0_ACCESSKEYID}
    accessKeySecret: ${HAI_REACH_PROVIDERS_0_ACCESSKEYSECRET}
    signName: ${HAI_REACH_PROVIDERS_0_SIGNNAME}
    templateCodes:
      otp_sms: SMS_100000001
    gateway:
      url: https://sms-gateway.example.com/dx
      allowInsecureHttp: false
      headers:
        Authorization: ${HAI_REACH_PROVIDERS_0_GATEWAY_HEADERS_AUTHORIZATION}
      body:
        app: orders
templates:
  - name: otp_sms
    provider: sms
    body: 'Your verification code is {code}.'
```

`body: {}` 会发送空 JSON 对象。省略 `body` 时没有请求体。受信内网确实需要明文 HTTP 时，可在同一个 `gateway` 中设置 `url: http://sms-gateway.internal/dx` 和 `allowInsecureHttp: true`。每次请求需要不同的头或正文时，应用可给这条渠道传入[网关函数](../function/reach.md#reach-init-options)。

### 夜间跳过不必补发的通知

用 `dnd.strategy: discard` 跳过不必补发的提醒。以下配置中，若在 `23:10` 发送普通消息，`reach.send()` 会返回 `DND_BLOCKED`，本次消息不会排队。到次日 `08:00` 就可以正常发新消息。

```yaml schema=@h-ai/reach:ReachConfigSchema
providers:
  - name: status-hook
    type: api
    url: https://notify.example.com/status
dnd:
  enabled: true
  strategy: discard
  start: '22:00'
  end: '08:00'
```

时段用服务进程的本地时区，以 24 小时制填写。`22:00` 包含在时段内，`08:00` 已在时段外。多节点部署时使用相同的时区。起止相同表示没有免打扰时段。

<a id="reach-example-warehouse"></a>

### 夜间先保存订单通知，白天发送并重试

白天用 `order-received` 模板发送时，Reach 将 `vars: { orderId: 'order-42' }` 填入正文的 `{orderId}`，再用 `warehouse-webhook` 渠道把这段正文和订单资料发给仓库。调用见 [通过 HTTP API 通知仓库](../function/reach.md#reach-api-notification)。

用 `dnd.strategy: delay` 保存需要稍后送出的普通消息。先初始化数据库。应用在 `23:10` 用 `order-received` 模板提交 `orderId: order-42` 时，只有数据库写入成功才会拿到 `deferred: true` 和 `queueId`。次日 `08:00` 之后 Reach 会在扫描等待消息时尝试发送。

```yaml schema=@h-ai/reach:ReachConfigSchema
providers:
  - name: warehouse-webhook
    type: api
    url: https://warehouse.example.com/orders
    timeout: 5000
    requireHttps: true
    idempotent: true
templates:
  - name: order-received
    provider: warehouse-webhook
    subject: Order received
    body: 'Order {orderId} was received.'
dnd:
  enabled: true
  strategy: delay
  start: '22:00'
  end: '08:00'
queue:
  maxAttempts: 5
  retryDelayMs: 60000
  maxRetryDelayMs: 120000
```

假设 `order-42` 的 `queueId` 是 `00000000-0000-4000-8000-000000000042`。08:00 后首次发给仓库时，Reach 把这个编号填进 `Idempotency-Key` 请求头和 JSON 的 `idempotencyKey`。如果仓库已创建拣货单，回复却在路上丢了，Reach 只会看到请求超时。后台重试同一条记录时，会再次发出相同的编号。

仓库从 `Idempotency-Key` 请求头读取编号，给编号设唯一约束，在同一个数据库事务里写入编号和拣货单。这样两笔写入要么一起成功，要么一起撤销。第二次收到同一编号时，仓库读取已保存的拣货单并返回原结果，例如 `{"messageId":"warehouse-42"}`。只要后台还可能重试，或者旧请求还可能晚到，仓库就要保留该编号。

实现了上述处理才设置 `idempotent: true`。它允许 Reach 在结果不明时用同一个编号重试。设为 `false` 时，接收方同样会拿到编号。遇到上述超时，Reach 把记录标为 `unknown`，由运维向仓库核对结果。见[直发和排队的 HTTP 请求编号](../function/reach.md#reach-idempotency-key)。

第一次可重试失败后，最早 1 分钟后能再试。第二次失败后等 2 分钟，之后的重试等待上限也是 2 分钟。`maxAttempts: 5` 包含首次尝试。Reach 为每条入队记录保存这一组参数，修改 `queue` 影响后续入队的消息。字段和回执见[发送记录](../data/reach.md#send-log)。

### 生效与核对

用一条普通测试通知核对所选渠道是否受理。启用了 `delay` 时，再在免打扰时段试一次，用返回的 `queueId` 查询是否进入 `pending`，并在时段结束后查看投递结果。具体查询和恢复步骤见[队列操作](../function/reach.md#queue)。部署时可参照[通知通道、免打扰与失败队列](operations.md#reach通道免打扰与失败队列)。
