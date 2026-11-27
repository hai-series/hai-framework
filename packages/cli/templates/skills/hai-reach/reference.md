# hai-reach — 详细用法

从 [SKILL.md](SKILL.md) 选择主题后读取对应小节。代码片段展示 API 用法；省略的业务变量、schema、依赖与 return 上下文需由应用补齐。

> `@h-ai/reach` 提供统一的用户触达接口，支持同时注册多个 Provider（SMTP 邮件、短信、API 回调），内置模板引擎与免打扰（DND）机制。

## 运行环境

Provider 名称必须唯一，重名在连接前返回 CONFIG_ERROR。`reach.close()` 停止本机领取新消息，等待已开始的队列投递记录结果，再释放 Provider。

> ⚠️ **服务端模块（Node.js only）。** 浏览器端不直接发送邮件/短信，而是通过 API 端点触发服务端 `reach.send()`。

## 依赖

| 依赖 | 用途 | 何时需要 | 接入顺序 |
| --- | --- | --- | --- |
| `@h-ai/core` | 提供日志、配置支持和统一结果 | 随 Reach 安装 | 应用使用 Core 配置中心时先初始化 Core |
| `@h-ai/reldb` | 持久化模板、发送历史和延迟队列 | 使用持久化模板、发送历史或免打扰策略 `delay` 时 | 先初始化 RelDB，再调用 `reach.init()`。配置模板或 `delay` 所需表不可用时，初始化返回 `CONFIG_ERROR` |
| `@h-ai/cache` | 为延迟队列的扫描提供分布式锁 | 多节点需要减少重复扫描时可选 | 使用共享缓存时，在 `reach.init()` 前初始化 Cache |
| 通知服务（SMTP、短信或 HTTP） | 将消息送到外部渠道 | 使用对应渠道时。SMTP 需要可选驱动 `nodemailer` | 准备服务端点、所需凭据及所选渠道的驱动，再调用 `reach.init()` |

## 适用场景

- 同时使用邮件、短信、API 回调发送通知
- 发送邮件通知（注册欢迎、密码重置、告警等）
- 发送短信验证码或通知
- 通过 HTTP API 回调触发第三方通知
- 定义和管理消息模板（模板绑定到具体 Provider，支持配置文件定义）
- 免打扰时段控制
- 基于 `HaiReachError` 做错误分支处理

## 使用步骤

### 1. 配置

```yaml
# config/_reach.yml
providers:
  - name: email
    type: smtp
    host: ${HAI_REACH_PROVIDERS_0_HOST:smtp.example.com}
    port: ${HAI_REACH_PROVIDERS_0_PORT:465}
    secure: true
    user: ${HAI_REACH_PROVIDERS_0_USER:}
    pass: ${HAI_REACH_PROVIDERS_0_PASS:}
    from: ${HAI_REACH_PROVIDERS_0_FROM:noreply@example.com}
  - name: sms
    type: aliyun-sms
    accessKeyId: ${HAI_REACH_PROVIDERS_1_ACCESSKEYID}
    accessKeySecret: ${HAI_REACH_PROVIDERS_1_ACCESSKEYSECRET}
    signName: ${HAI_REACH_PROVIDERS_1_SIGNNAME}
    templateCodes:
      sms_code: SMS_100000001
    # 按需启用隔离网关
    # gateway:
    #   url: https://sms-gateway.example.com/dx
    #   body: {}
  - name: webhook
    type: api
    url: ${HAI_REACH_WEBHOOK_URL:}
    idempotent: false # 只有接收端按 Idempotency-Key 原子、持久化去重时才能设 true

# 模板（可选，也可通过代码注册）
templates:
  - name: email_code
    provider: email
    subject: '验证码: {code}'
    body: '您的验证码是 {code}，有效期 {minutes} 分钟。'
  - name: sms_code
    provider: sms
    body: '验证码: {code}，{minutes} 分钟内有效。'

# 免打扰（可选）
dnd:
  enabled: true
  strategy: delay # 必须先初始化 reldb；确认持久化成功后才返回 deferred 与 queueId
  start: '22:00'
  end: '08:00'
```

`providers` 是数组，因此示例保留稳定、可读的显式厂商变量名；若同时设置
按索引生成的约定变量（如 `HAI_REACH_PROVIDERS_0_HOST`），约定变量优先。

API Provider 只接受 HTTP(S) URL。回调地址若来自不可信输入，业务层必须先做域名 allowlist，并由企业网络出口策略限制内网访问；不要在日志中记录完整 URL、收件人或第三方响应体。

### 2. 初始化与关闭

```typescript
import { CacheConfigSchema, cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { ReachConfigSchema, reach } from '@h-ai/reach'
import { ReldbConfigSchema, reldb } from '@h-ai/reldb'

// 当前配置启用了 delay：数据库和队列表为必需依赖。
// 从配置中心校验 db。成功 data 是延迟发送所需的数据库配置。
const databaseConfig = core.config.validate('db', ReldbConfigSchema)
if (!databaseConfig.success) throw new Error(databaseConfig.error.message)
// 用校验后的配置初始化数据库。成功 data 为 undefined，连库失败从 error 诊断。
const database = await reldb.init(databaseConfig.data)
if (!database.success)
  throw new Error(database.error.message)
// 从配置中心校验 cache。成功 data 用来初始化 flush 分布式锁所需的缓存。
const cacheConfig = core.config.validate('cache', CacheConfigSchema)
if (!cacheConfig.success) throw new Error(cacheConfig.error.message)
// 用已校验的配置初始化缓存。成功 data 为 undefined，失败时停止示例启动。
const cached = await cache.init(cacheConfig.data) // 可选，启用 flush 分布式锁
if (!cached.success)
  throw new Error(cached.error.message)

// 再初始化触达模块（自动检测已初始化的 reldb/cache 单例）
// 校验 reach 配置，成功 data 含 Provider、模板及免打扰选项。
const reachConfig = core.config.validate('reach', ReachConfigSchema)
if (!reachConfig.success) throw new Error(reachConfig.error.message)
// 初始化 Reach 并接入已启动的依赖。成功 data 为 undefined，配置或依赖错误返回失败。
const initialized = await reach.init(reachConfig.data)
if (!initialized.success)
  throw new Error(initialized.error.message)
// ... 使用触达服务
// 无参关闭 Reach 并等待它释放拥有的资源，返回 Promise<void>。
await reach.close()
```

`reach.config` 返回的是脱敏后的配置快照；`api.url` / `endpoint`、授权头、SMTP `pass`、短信密钥等敏感值会自动隐藏。

### 3. 保存模板（模板绑定 Provider）

```typescript
// 通过代码保存（配置文件中的模板在 init 时自动注册）
// 为 email 渠道保存 email_code 模板。发送时由 code 和 minutes 替换占位符；保存失败则停止。
const saved = await reach.template.save({
  name: 'email_code',
  provider: 'email',
  subject: '验证码: {code}',
  body: '您的验证码是 {code}，有效期 {minutes} 分钟。',
})
if (!saved.success)
  throw new Error(saved.error.message)

// 用下方两份模板批量注册邮件欢迎语与短信验证码。成功 data 为 undefined。
const savedBatch = await reach.template.saveBatch([
  { name: 'welcome', provider: 'email', subject: '欢迎 {userName}', body: '亲爱的 {userName}，欢迎使用 {appName}！' },
  { name: 'sms_code', provider: 'sms', body: '验证码: {code}，{minutes} 分钟内有效。' },
])
if (!savedBatch.success)
  throw new Error(savedBatch.error.message)
```

### 4. 发送消息

```typescript
// 使用模板发送邮件（指定 provider）
// 用上一节已保存的 welcome 模板向该邮箱发送欢迎邮件。结果区分渠道受理和延迟入队。
const result = await reach.send({
  provider: 'email',
  to: 'user@example.com',
  template: 'welcome',
  vars: { userName: 'Ada', appName: 'Example' },
})
if (!result.success)
  throw new Error(result.error.message)
if (result.data.deferred) {
  // queueId 是 hai_reach_send_log.queue_id 中的回执 UUID；此时尚未投递。
  // 把延期回执的 queueId 交给应用持久化，以便查询后续状态。
  await savePendingReceipt(result.data.queueId)
}

// 直接发送邮件（无模板）
// 通过 email 渠道向示例邮箱直接发送主题「通知」及 HTML 正文。 成功 data 表示投递结果或延期回执，渠道错误返回失败。
await reach.send({
  provider: 'email',
  to: 'user@example.com',
  subject: '通知',
  body: '<h1>Hello</h1>',
})

// 发送短信（通过 extra 传递 Provider 特有参数）
// 用 sms 渠道向测试手机号发送订单通知。orderTemplateCode 来自应用配置的已审核阿里云模板。
await reach.send({
  provider: 'sms',
  to: '13800138000',
  extra: { templateCode: orderTemplateCode },
  vars: { orderId: 'demo-42' },
})

// API 回调
// 把 signup 的 JSON 正文交给已配置的 webhook 渠道。 成功 data 表示投递结果或延期回执，渠道错误返回失败。
await reach.send({
  provider: 'webhook',
  to: 'user@example.com',
  body: '{"event":"signup"}',
})
```

### 隔离网关与动态字段

阿里云直连需要审核通过的短信模板编码。`providers[].templateCodes` 将本地模板名映射到阿里云编码，例如 `sms_code: SMS_100000001`，部署时换成实际获批的编码。`reach.send()` 显式传 `extra.templateCode` 时优先使用该编码。模板变量会提交给阿里云，键与数量应符合相应的已审核模板。

在 `aliyun-sms` 下配置 `gateway.url`，使用包含路径的完整 HTTPS 地址。受信内网确需明文时设置 `gateway.allowInsecureHttp: true`。请求使用 POST，阿里云签名仍基于 RPC 路径 `/` 和查询参数，网关路径、头和正文仅供网关使用。`gateway.headers` 取字符串键值，`gateway.body` 可设 JSON 对象、数组或原始文本，`body: {}` 表示空 JSON 对象。

从服务端 `reach.init(config, { gatewayHooks: { sms: hook } })` 注入同步或异步函数。`sms` 对应已配置网关的 Provider 名称，`hook` 接收 `{ method, url, body, signal }`，其中 `body` 已序列化，`url` 含签名和敏感查询。返回 `{ headers, body }` 时，头按名称忽略大小写覆盖，正文整段替换，省略字段时沿用静态配置。`Host` 和 `Content-Length` 等由 HTTP 客户端管理。函数和请求共用 10 秒期限，拒绝重定向。`reach.config` 仅展示网关的地址和 HTTP 开关。

直连 GET 和网关 POST 都拒绝重定向，最多等待 10 秒（含接收回执），回执最多 64 KiB。验证网关转发时确认上游路径、方法和查询参数，HTTP 2xx 且阿里云 `Code: OK` 表示已受理，送达状态通过 `BizId` 查询。明文连接的访问日志应脱敏查询串，配置及测试均使用占位数据或受控的私有注入。

## 核心 API

### reach 对象

| 方法 / 属性           | 签名                                                     | 说明                               |
| --------------------- | -------------------------------------------------------- | ---------------------------------- |
| `reach.init`          | `(config: ReachConfigInput, options?: ReachInitOptions) => Promise<HaiResult<void>>` | 初始化 Provider，可注入网关函数 |
| `reach.send`          | `(message: ReachMessage) => Promise<HaiResult<SendResult>>` | 发送消息（通过 provider 字段路由） |
| `reach.queue.get` | `(queueId: string) => Promise<HaiResult<ReachQueueEntry \| null>>` | 不含正文/收件人的队列状态 |
| `reach.queue.list` | `(options: ReachQueueListOptions) => Promise<HaiResult<ReachQueueEntry[]>>` | 可信服务端分页查询 dead/unknown，每页至多 100 条 |
| `reach.queue.requeueDead` | `(queueId: string, options: ReachDeadRequeue) => Promise<HaiResult<void>>` | 按 expectedUpdatedAt 条件恢复 dead；unknown 禁止重排 |
| `reach.queue.resolveUnknown` | `(queueId: string, resolution: ReachUnknownResolution) => Promise<HaiResult<void>>` | 人工核对后将 unknown 裁定为 sent/discarded，不发送 |
| `reach.template`      | `ReachTemplateRegistry`                                  | 模板注册表                         |
| `reach.config`        | `ReachConfig \| null`                                    | 当前脱敏配置快照                   |
| `reach.isInitialized` | `boolean`                                                | 是否已初始化                       |
| `reach.close`         | `() => Promise<void>`                                    | 关闭所有连接                       |

### ReachConfigInput

从 `@h-ai/reach` 导入 `ReachConfigInput` 获取输入类型，或使用 `ReachConfigSchema.safeParse()` 校验文件配置。`providers` 必填，`templates`、`dnd` 和 `queue` 可省略。配置示例与重试默认值见本页的使用步骤和有限重试章节。

### ReachMessage

| 字段       | 类型                      | 必填 | 说明                                |
| ---------- | ------------------------- | ---- | ----------------------------------- |
| `provider` | `string`                  | 条件 | 模板发送省略时由模板推导；直接发送必填；显式值优先 |
| `to`       | `string`                  | ✅   | 接收方（邮箱或手机号）              |
| `subject`  | `string`                  | —    | 邮件主题（直接发送时）              |
| `body`     | `string`                  | —    | 消息正文（直接发送时）              |
| `template` | `string`                  | —    | 模板名称（模板发送时）              |
| `vars`     | `Record<string, string>`  | —    | 模板变量                            |
| `extra`    | `Record<string, unknown>` | —    | Provider 扩展参数（如短信模板编码） |
| `ignoreDnd` | `boolean` | — | 默认为 `false`。设为 `true` 时跳过本次免打扰并尝试立即发送 |
| `sensitive` | `boolean` | — | 默认为 `false`。设为 `true` 时只保存投递元数据，免打扰拦截时返回 `DND_BLOCKED` |
| `deferPolicy` | `'queue' \| 'reject'` | — | 普通通知默认 `queue`。已有业务队列时用 `reject` 接收 `DND_BLOCKED`，由应用等待 |

### ReachTemplate（模板绑定 Provider）

| 字段       | 类型     | 必填 | 说明                 |
| ---------- | -------- | ---- | -------------------- |
| `name`     | `string` | ✅   | 模板名称             |
| `provider` | `string` | ✅   | 绑定的 Provider 名称 |
| `subject`  | `string` | —    | 邮件主题模板         |
| `body`     | `string` | ✅   | 正文模板             |

## 错误码

| 错误码 | code | 说明 |
|--------|------|------|
| `HaiReachError.SEND_FAILED`            | `hai:reach:001`   | 发送失败        |
| `HaiReachError.DELIVERY_REJECTED`      | `hai:reach:020`   | API 明确永久拒绝 |
| `HaiReachError.TEMPLATE_NOT_FOUND`     | `hai:reach:002`   | 模板未找到      |
| `HaiReachError.TEMPLATE_RENDER_FAILED` | `hai:reach:003`   | 模板渲染失败    |
| `HaiReachError.INVALID_RECIPIENT`      | `hai:reach:004`   | 无效接收方      |
| `HaiReachError.PROVIDER_NOT_FOUND`     | `hai:reach:005`   | Provider 未找到 |
| `HaiReachError.DND_BLOCKED`            | `hai:reach:006`   | 免打扰丢弃      |
| `HaiReachError.NOT_INITIALIZED`        | `hai:reach:010`   | 模块未初始化    |
| `HaiReachError.UNSUPPORTED_TYPE`       | `hai:reach:011`   | 不支持的类型    |
| `HaiReachError.CONFIG_ERROR`           | `hai:reach:012`   | 配置错误        |

## 常见模式

### 可靠延迟入队

启用 delay 后，只有数据库确认插入一条 pending 记录才返回 `deferred: true` 和 `queueId`。缺库、断连、插入失败返回失败 HaiResult，不能向用户报告已入队。`queueId` 对应 `hai_reach_send_log.queue_id`，同一行的 `status` 为 pending / processing / sending / unknown / sent / discarded / dead。节点重启后连接同一数据库、配置同名 Provider，可在 DND 时段外恢复投递。即时发送后的普通日志仍为可选，日志失败不会使已发送消息返回失败。

验证码、重置链接等需要即时送出的消息传 `ignoreDnd: true` 和 `sensitive: true`。数据库已连接时，渠道受理后只保存投递元数据，不保留接收地址、内容和模板变量。

队列 `created_at` / `updated_at` / `locked_until` / `next_attempt_at` 均为 Unix 毫秒 `BIGINT`（SQLite 为 64 位 INTEGER）；仓库把 driver 的字符串/数字归一化为安全整数 number，并拒绝负数、小数和不安全整数。模板仓库的 TIMESTAMP 时间返回 Date。配置数据库后，初始化会准备发送日志表和队列索引。现有表缺少必要字段或未对 `queue_id` 建立唯一约束时，初始化失败。验收 PostgreSQL 或 MySQL 时，用目标数据库验证 Unix 毫秒字段和队列投递。

### 租约、接收端幂等与未知结果

每轮最多 100 条，逐条领取，发送前原子写入 `sending` 并续租。领取权到期后，旧节点不能开始、续租或登记结果。DND 时段外每分钟恢复普通队列遗留任务。关闭时停止领取，等待本机已经发起的队列投递记录结果。缓存锁只减少扫描。

API 直发只尝试一次，每次调用有自己的请求编号。排队投递和后台重试复用该条记录的 `queueId`。接收方用 `Idempotency-Key` 请求头或 JSON 中同值的 `idempotencyKey` 识别同一条请求。应用可能多次提交同一个业务动作，例如同一订单创建事件，此时接收端用 `extra.event` 和 `extra.orderId` 识别同一个拣货任务。

设置 `idempotent: true` 前，接收方须对请求编号设唯一约束，将保存编号和执行业务操作放在同一事务。请求可能已执行而响应丢失，Reach 可以用同一个 `queueId` 重试，接收方读出原结果即可。只要重试或旧请求还可能到达，就要保留该记录。同名 Provider 继续使用同一目标和去重存储。

SMTP、短信和默认 API 一旦开始投递，失败或过期转 unknown，不自动重发。未连接按持久策略退避；发送前解析失败直接进入 dead。unknown 必须在可信服务端管理流程里，先停止/隔离旧 worker 并核对第三方投递记录，再执行以下二选一裁定；discarded 不撤销已开始请求。需要补发时，先确保旧请求不可能继续生效，再创建新消息。

```ts
// 按发送回执的 queueId 查询队列记录，只处理仍为 unknown 的记录。
const state = await reach.queue.get(queueId)
if (!state.success)
  throw new Error(state.error.message)
if (state.data?.status !== 'unknown')
  throw new Error('Expected an unknown delivery')
// 在外部投递已核对成功后，用消息 ID 将该未知结果记录确认为 sent。成功 data 为 undefined，状态冲突返回失败。
const resolved = await reach.queue.resolveUnknown(queueId, { status: 'sent', messageId: verifiedMessageId })
if (!resolved.success)
  throw new Error(resolved.error.message)
```

管理入口校验回执 UUID、status 与 messageId 长度，只能从 unknown 条件更新为 sent/discarded；不提供重排队选项，并发裁定仅一个成功。

### 有限重试与死信运维

`queue.maxAttempts` 默认 5（1–100），`retryDelayMs` 默认 60000，`maxRetryDelayMs` 默认 3600000；两项毫秒配置范围 1000–86400000，最大退避不得小于首次退避。策略随入队记录保存，不随新节点配置重置；领取（含崩溃恢复）原子累加 attemptCount。暂时故障保存 nextAttemptAt，按 `min(maxRetryDelayMs, retryDelayMs × 2^(attemptCount−1))` 退避。DND 外每分钟扫描，一轮最多 100 条且固定资格时间，失败行不会在同一轮反复领取。缺失/未连接 Provider、网络错误、HTTP 408/425/429/5xx 允许有限重试；坏 JSON、幂等 API 其它 4xx 直接 dead；超限（含最后一次领取后崩溃）停止自动处理。非幂等在途仍隔离 unknown，不能借重试预算重发。

queue.get/list 返回 attemptCount、maxAttempts、nextAttemptAt、lastFailure、updatedAt 等安全元数据。lastFailure 为 provider_unavailable、invalid_message、permanent_rejection、transient_failure 或 attempts_exhausted，不保存响应正文。可信服务端以 `list({ status: 'dead', limit: 50, offset: 0 })` 分页查询，status 也可选 unknown；limit 1–100，offset 0–1000000。

```ts
// 应用先校验运维权限并修复根因；不向浏览器直接暴露队列管理。
// 按发送回执的 queueId 查询队列记录。成功 data 是当前记录或 null。
const state = await reach.queue.get(queueId)
if (!state.success)
  throw new Error(state.error.message)
if (state.data?.status === 'dead' && state.data.updatedAt !== undefined) {
  // 以刚读到的 updatedAt 为版本条件恢复此 dead 回执。成功后回到待处理，版本不再匹配时失败。
  const restored = await reach.queue.requeueDead(queueId, { expectedUpdatedAt: state.data.updatedAt })
  if (!restored.success)
    throw new Error(restored.error.message)
}
```

把查询结果的 `updatedAt` 原样传给 `expectedUpdatedAt`。Reach 只在记录仍为 `dead` 且更新时间一致时重新排队。另一位操作员已处理时，重新查询并显示当前状态，由操作员决定下一步。成功会把次数归零并保留 `queueId`、原等待策略。旧 API 请求仍可能到达，重排前确认接收方可按原编号去重。`unknown` 走人工核对流程。

### 多渠道验证码发送

先按「保存模板」一节准备 `email_code` 和 `sms_code`。应用签发并校验验证码。下面的 `target`、`code` 和 `minutes` 来自应用。使用邮件时将模板改为 `email_code`。

```typescript
// 发送本次签发的代码并跳过免打扰。先检查结果，渠道给出编号时从 messageId 读取。
const result = await reach.send({
  to: target,
  template: 'sms_code',
  vars: { code, minutes },
  ignoreDnd: true,
  sensitive: true,
})
if (!result.success)
  return result
const messageId = result.data.messageId
```

接入数据库后，Reach 会在渠道受理后尝试保存发送历史。`hai_reach_send_log` 的 `to_addr`、`body`、`vars_json` 保存发送内容，`message_id` 保存渠道编号（如果渠道提供）。

### 与 IAM 集成（密码重置 / OTP 验证码）

```typescript
import { iam } from '@h-ai/iam'
import { reach } from '@h-ai/reach'

// 初始化 reach（注册 email 和 sms Provider）
// 注册下方邮件、短信渠道和 IAM 用到的三份模板，成功 data 为 undefined。
const initializedReach = await reach.init({
  providers: [
    { name: 'email', type: 'smtp', host: 'smtp.example.com', from: 'noreply@example.com' },
    {
      name: 'sms',
      type: 'aliyun-sms',
      accessKeyId: '...',
      accessKeySecret: '...',
      signName: '...',
      templateCodes: { otp_sms: approvedOtpTemplateCode },
    },
  ],
  templates: [
    { name: 'password_reset', provider: 'email', subject: 'Password Reset', body: 'Token: {token}, expires: {expiresAt}' },
    { name: 'otp_email', provider: 'email', subject: 'Code: {code}', body: 'Your code is {code}' },
    { name: 'otp_sms', provider: 'sms', body: 'Your code is {code}' },
  ],
})
if (!initializedReach.success)
  throw new Error(initializedReach.error.message)

// 先确认 reldb/cache/Reach 已初始化成功，再注入 Reach；内置适配器传播发送失败。
// 把已启动的 Reach 作为通知依赖传入 IAM。成功 data 为 undefined，启动失败停止应用初始化。
const initializedIam = await iam.init({ ...iamSettings, reach })
if (!initializedIam.success)
  throw new Error(initializedIam.error.message)
```

`approvedOtpTemplateCode` 对应阿里云审核通过的模板，其变量为 `code`。手机重置需配置 `password_reset_sms` 模板和审核编码。IAM 通过这套内置模板发验证码、密码重置或初始设密邀请时传 `ignoreDnd: true` 和 `sensitive: true`。显式发送回调可覆盖内置行为。

### 错误处理

```typescript
import { HaiReachError } from '@h-ai/reach'

// 发送应用准备的 message。成功 data 是发送结果，下方按失败码处理未初始化、配置和渠道问题。
const result = await reach.send(message)
if (!result.success) {
  switch (result.error.code) {
    case HaiReachError.NOT_INITIALIZED.code:
      break
    case HaiReachError.PROVIDER_NOT_FOUND.code:
      break
    case HaiReachError.DND_BLOCKED.code:
      // 免打扰时段（discard 策略），消息已丢弃
      break
    case HaiReachError.TEMPLATE_NOT_FOUND.code:
      break
    case HaiReachError.SEND_FAILED.code:
      break
  }
}
```

## 相关 Skills

- `hai-core` — 配置加载、日志、HaiResult 模式
- `hai-reldb` — 数据库操作（存储发送记录等）
- `hai-cache` — 缓存操作、分布式锁（DND flush 互斥）

## 生产共享状态

生产拒绝 console Provider，须配置真实 SMTP/短信/API 服务。console 的日志成功不是外部投递成功；非幂等服务的未知结果必须核对，不能自动重发证明 exactly-once。 NODE_ENV 或 HAI_CORE_ENV 为 production 时在初始化成功前检查，只有 HAI_E2E=1/HAI_E2E_MOCK=1 明确测试豁免。不要将租约当作最终写入条件，外部未知效果须按稳定业务键核对。
