# @h-ai/reach

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/cache](../cache/README.md) · [@h-ai/core](../core/README.md) · [@h-ai/reldb](../reldb/README.md)

## 简介

用户触达模块，支持同时注册多个 Provider（邮件、短信、API 回调等），通过模板绑定 Provider 实现按场景路由发送。内置免打扰（DND）机制，支持通过配置文件定义模板。

模板发送只需 `template`、`to` 和 `vars`，Provider 默认来自模板；显式 `provider` 仍可覆盖。无模板的直接发送必须提供 Provider，缺少时返回失败 HaiResult。

## 核心功能清单

| Provider     | 渠道 | 说明                                        |
| ------------ | ---- | ------------------------------------------- |
| `console`    | 通用 | 控制台输出（开发/测试用）                   |
| `smtp`       | 邮件 | SMTP 协议发送邮件（需安装 nodemailer）      |
| `aliyun-sms` | 短信 | 阿里云短信服务（直接调用 HTTP API，无 SDK） |
| `api`        | 通用 | HTTP API 回调（通用 webhook）               |

## 使用入门

### 依赖

- `@h-ai/reldb` — 数据库（发送日志与模板持久化）；启用 `dnd.enabled: true` 与 `strategy: delay` 时必须先初始化且队列表可用，否则 `reach.init()` 返回 `CONFIG_ERROR`。其他发送场景可选
- `@h-ai/cache` — 缓存（DND delay 策略分布式锁），可选；已初始化时自动启用分布式锁

### 快速开始

#### 安装

```bash
pnpm add @h-ai/reach
```

邮件发送需安装 `nodemailer`。

#### 多 Provider 初始化

```ts
import { reach } from '@h-ai/reach'

const initialized = await reach.init({
  providers: [{ name: 'local', type: 'console' }],
  templates: [{ name: 'welcome', provider: 'local', subject: 'Welcome', body: 'Hello {userName}' }],
})
if (!initialized.success)
  throw new Error(initialized.error.message)
try {
  const result = await reach.send({
    to: 'user@example.com',
    template: 'welcome',
    vars: { userName: 'Alice' },
  })
  if (!result.success)
    throw new Error(result.error.message)
}
finally {
  await reach.close()
}
```

以上示例使用开发 Console Provider，只记录发送元数据，不实际发邮件或短信。需要真实投递时，按下方配置 SMTP、短信或 API Provider；数据库持久化和共享缓存按需初始化。

`reach.config` 返回的是**脱敏后的配置快照**：`api.url` / `endpoint` 的内嵌凭证，以及 `headers.Authorization`、SMTP `pass`、短信密钥等敏感值会自动隐藏。

### 配置

#### Console（开发/测试）

```ts
const config = { name: 'dev', type: 'console' }
```

#### SMTP

| 字段     | 类型      | 必填 | 默认值 | 说明            |
| -------- | --------- | ---- | ------ | --------------- |
| `name`   | `string`  | ✅   | —      | Provider 名称   |
| `type`   | `string`  | ✅   | —      | 固定 `'smtp'`   |
| `host`   | `string`  | ✅   | —      | SMTP 服务器地址 |
| `port`   | `number`  | —    | `465`  | SMTP 端口       |
| `secure` | `boolean` | —    | `true` | 是否使用 TLS    |
| `user`   | `string`  | —    | —      | 认证用户名      |
| `pass`   | `string`  | —    | —      | 认证密码        |
| `from`   | `string`  | ✅   | —      | 发件人地址      |

#### 阿里云短信

| 字段              | 类型     | 必填 | 默认值                  | 说明                |
| ----------------- | -------- | ---- | ----------------------- | ------------------- |
| `name`            | `string` | ✅   | —                       | Provider 名称       |
| `type`            | `string` | ✅   | —                       | 固定 `'aliyun-sms'` |
| `accessKeyId`     | `string` | ✅   | —                       | AccessKey ID        |
| `accessKeySecret` | `string` | ✅   | —                       | AccessKey Secret    |
| `signName`        | `string` | ✅   | —                       | 短信签名            |
| `endpoint`        | `string` | —    | `dysmsapi.aliyuncs.com` | API 端点            |

#### API 回调

| 字段         | 类型                     | 必填 | 默认值  | 说明                                         |
| ------------ | ------------------------ | ---- | ------- | -------------------------------------------- |
| `name`       | `string`                 | ✅   | —       | Provider 名称                                |
| `type`       | `string`                 | ✅   | —       | 固定 `'api'`                                 |
| `url`        | `string`                 | ✅   | —       | HTTP(S) 回调 URL                             |
| `method`     | `'POST' \| 'PUT'`        | —    | `POST`  | HTTP 方法                                    |
| `headers`    | `Record<string, string>` | —    | —       | 自定义请求头                                 |
| `timeout`    | `number`                 | —    | `10000` | 超时毫秒数                                   |
| `idempotent` | `boolean`                | —    | `false` | 接收端具有持久化、原子副作用去重能力时才启用 |

API 回调地址属于服务端可信配置。日志只记录回调 origin，不记录 URL 凭据、查询参数、收件人或第三方失败响应体。若回调地址来自租户/用户输入，应用层必须配置域名 allowlist；企业部署还应通过出口代理或网络策略阻止访问内网元数据地址。

#### DND（免打扰）

| 字段       | 类型                   | 必填 | 默认值    | 说明                                    |
| ---------- | ---------------------- | ---- | --------- | --------------------------------------- |
| `enabled`  | `boolean`              | —    | `false`   | 是否启用                                |
| `strategy` | `'discard' \| 'delay'` | —    | `discard` | discard 丢弃 / delay 延时（DND 后发送） |
| `start`    | `string`               | —    | `00:00`   | 开始时间（HH:mm 格式）                  |
| `end`      | `string`               | —    | `00:00`   | 结束时间（HH:mm 格式）                  |

`delay` 仅在消息写入数据库并确认成功后返回 `HaiResult` 成功，结果为 `{ success: true, deferred: true, queueId }`；这表示已入队、尚未投递。`queueId` 是持久化回执 UUID，对应 `hai_reach_send_log.queue_id`，可查询该记录的 `status`（`pending` / `processing` / `sending` / `unknown` / `sent` / `discarded` / `dead`）。缺少数据库、断连、插入失败均不会返回 deferred 成功，发送时返回 `SEND_FAILED`。节点重启后，只要连接同一数据库、配置同名 Provider，便可在 DND 时段外恢复投递。即时发送成功后的普通日志保存仍为可选，不会因日志失败把已投递的消息报告为失败。

```ts
const result = await reach.send(message)
if (!result.success)
  throw new Error(result.error.message)
if (result.data.deferred) {
  // 保存 queueId 供后台跟踪；此时不能向用户显示“已送达”。
  await savePendingReceipt(result.data.queueId)
}
```

队列的 `created_at`、`updated_at`、`locked_until`、`next_attempt_at` 统一保存 Unix 毫秒，列类型为 `BIGINT`（SQLite 映射为 64 位 `INTEGER`）。Reach 仓库将 PostgreSQL 等驱动返回的整数字符串归一化为安全整数 `number`；负数、非整数及超出 JS 安全整数范围的存储值返回 `SEND_FAILED`，不会静默舍入。模板仓库的 `TIMESTAMP` 创建/更新时间映射为 `Date`。部署时须同步表结构，包括次数、退避策略和失败分类列；旧表升级由模块维护的版本迁移负责，见下文。

#### 可靠队列重试

`queue` 策略在入队时随每条消息持久保存；其它节点及重启后的配置变化不会重置已有消息预算。

| 配置                    | 默认值    | 约束                            |
| ----------------------- | --------- | ------------------------------- |
| `queue.maxAttempts`     | `5`       | 1–100，含首次领取和崩溃恢复     |
| `queue.retryDelayMs`    | `60000`   | 首次退避，1000–86400000 毫秒    |
| `queue.maxRetryDelayMs` | `3600000` | 同上范围，且不小于 retryDelayMs |

每次领取在数据库原子递增 `attemptCount`。暂时失败在 `now + min(maxRetryDelayMs, retryDelayMs × 2^(attemptCount−1))` 之后才有资格再次领取；DND 外每分钟扫描，因此实际发送可能更晚。一轮最多处理 100 条，并固定本轮资格时间；失败的消息在该轮不会重新入选。未连接/缺失 Provider、网络错误、HTTP 408/425/429/5xx 可以有限重试；持久化载荷解析失败、幂等 API 的其他 HTTP 4xx 直接进入 `dead`。超出次数或最后一次领取后崩溃也进入 `dead`。非幂等在途请求仍优先进入 `unknown`，不因剩余预算而重发。

### 错误处理

所有操作返回 `HaiResult<T>`，错误码定义在 `HaiReachError`：

| 错误码                                 | code            | 说明             |
| -------------------------------------- | --------------- | ---------------- |
| `HaiReachError.SEND_FAILED`            | `hai:reach:001` | 发送失败         |
| `HaiReachError.TEMPLATE_NOT_FOUND`     | `hai:reach:002` | 模板不存在       |
| `HaiReachError.TEMPLATE_RENDER_FAILED` | `hai:reach:003` | 模板渲染失败     |
| `HaiReachError.INVALID_RECIPIENT`      | `hai:reach:004` | 无效接收方       |
| `HaiReachError.PROVIDER_NOT_FOUND`     | `hai:reach:005` | Provider 未注册  |
| `HaiReachError.DND_BLOCKED`            | `hai:reach:006` | 免打扰丢弃       |
| `HaiReachError.NOT_INITIALIZED`        | `hai:reach:010` | 未初始化         |
| `HaiReachError.UNSUPPORTED_TYPE`       | `hai:reach:011` | 不支持的类型     |
| `HaiReachError.CONFIG_ERROR`           | `hai:reach:012` | 配置错误         |
| `HaiReachError.DELIVERY_REJECTED`      | `hai:reach:020` | API 明确永久拒绝 |

```ts
const result = await reach.send({ provider: 'email', to: 'user@example.com', body: 'hello' })
if (!result.success) {
  // result.error.code / result.error.message
}
```

### 分布式锁

缓存锁只减少重复扫描，300 秒后可能有多个节点同时扫描；正确性由数据库投递状态保证。每轮最多逐条领取 100 条，实际发送前原子校验有效 owner 并写入 `sending`，在途每隔租约的三分之一续租。过期 owner 不能复活租约、开始新投递或提交结果。DND 时段外每分钟继续恢复遗留队列。

- 状态为 `pending → processing → sending → sent`；`processing` 过期可安全重领。
- API 只有配置 `idempotent: true` 才允许重领在途消息。这是对接收端能力的声明，不会凭空实现幂等。每次请求的 `Idempotency-Key` 请求头和 `idempotencyKey` 正文字段均固定为持久化 `queueId`；接收端必须把去重记录和副作用原子提交。去重记录必须覆盖所有迟到请求，包括暂停后恢复的旧节点；无法界定最长迟到时间时不能过期删除。各节点同名 Provider 必须连接同一目标和幂等存储。
- SMTP、阿里云短信、默认 API 没有外部幂等保证。已经进入 `sending` 后的失败、异常或租约丢失按未知结果处理，过期后转为 `unknown`，新消费者不会自动重发。未连接 Provider 按持久策略退避；发送前解析失败直接进入 dead。Console 仅输出开发元数据，不产生真实投递。
- 续租、数据库 owner 条件和取消信号都不能撤销已发出的邮件、短信或 HTTP 副作用；模块不提供通用 exactly-once 保证。

### 未知结果人工核对

可信服务端管理流程使用 `reach.queue.get(queueId)` 查询 `pending / processing / sending / unknown / sent / discarded / dead`；结果不含正文或收件人。出现 unknown 时先停止或隔离旧 worker，按 queueId、Provider 日志和第三方投递记录核对，再调用以下裁定接口。接口校验 UUID 和状态，只能把 unknown 条件更新为 sent 或 discarded，并发裁定仅一个成功；不会重新发送。discarded 只终止后续处理，不能撤销已经开始的请求。如需补发，须先确认旧请求不可能继续生效，再显式创建新消息。

```ts
const state = await reach.queue.get(queueId)
const resolved = await reach.queue.resolveUnknown(queueId, { status: 'sent', messageId: verifiedMessageId })
if (!resolved.success)
  throw new Error(resolved.error.message)
```

### 死信查询与恢复

可信服务端可用 `reach.queue.list({ status: 'dead', limit: 50, offset: 0 })` 查询死信，也可查询 `unknown`；每页最多 100 条，offset 上限 1000000。get/list 返回状态、attemptCount、maxAttempts、nextAttemptAt、lastFailure 和 updatedAt，不含正文、收件人及 owner。修复 Provider 配置或消息根因后，查询最新 dead 版本再恢复：

```ts
const state = await reach.queue.get(queueId)
if (!state.success)
  throw new Error(state.error.message)
if (state.data?.status === 'dead' && state.data.updatedAt !== undefined) {
  const restored = await reach.queue.requeueDead(queueId, { expectedUpdatedAt: state.data.updatedAt })
  if (!restored.success)
    throw new Error(restored.error.message)
}
```

恢复仅条件更新同一版本的 dead；并发/过时请求失败，unknown 无法恢复。它重置领取次数并保留 queueId、原退避策略及接收端幂等要求。dead 仅表示停止自动处理，不证明外部副作用未发生；曾开始的幂等 API 可能仍有旧请求迟到，恢复前仍须确认接收端持久去重有效。不可修复的坏载荷应保留死信并人工排查，重复恢复不会修复内容。

## 生产共享状态

生产拒绝 console Provider，须配置真实 SMTP/短信/API 服务。console 的日志成功不是外部投递成功；非幂等服务的未知结果必须核对，不能自动重发证明 exactly-once。 NODE_ENV 或 HAI_CORE_ENV 为 production 时在初始化发布成功前校验；仅 HAI_E2E=1/HAI_E2E_MOCK=1 明确测试可豁免。 [状态、并发和恢复边界](../../.agents/instructions/distributed-state.md)。

## 凭据通知与旧库升级

发送密码、OTP 或重置令牌时使用 `reach.send({ ..., sensitive: true, expiresAt, idempotencyKey })`。expiresAt 是 Unix 毫秒，稳定操作键不可包含凭据。必须有共享发送账本：只持久化无载荷回执/状态，接收方脱敏，不存正文、变量或低熵凭据摘要，也不进入延迟队列。发送成功返回 receiptId；DND/过期不投递，异常或不明状态不自动重投。明确启用的开发控制台仍可显示业务允许的通知，持久采集观察器被隔离；生产 Console Provider 限制不变。普通通知可用 deferPolicy: reject 阻止二次排队。

`migrateReach({ dryRun: true })` 预检；仓库初始化自动执行受支持步骤。升级保留发送状态与标识，旧在途转 unknown；旧正文/主题/模板变量/extra 一次性退役，待发旧载荷 discarded。生产需先备份停旧写入，不能恢复旧凭据重新投递。

## API 回执与目标边界

空正文的成功 2xx（含 204/205）表示接收端受理，messageId 可缺省，不代表最终送达。非空正文须为 JSON 对象，messageId 若存在须为不超过 255 字符的字符串；响应最多 64 KiB，非法响应、超时和网络失败不会假装成功或输出第三方正文。

API Provider 的 `redirect` 默认为 `error`；只有普通消息可显式设为 `follow`。`sensitive:true` 始终拒绝跳转，不转发正文和私有头。`requireHttps:true` 强制初始 HTTPS 且与 follow 互斥；省略时生产敏感消息要求 HTTPS，显式 false 仅适用于操作者确认的受信内网。超时或源端已产生的未知副作用仍须核对，敏感消息不自动重投。域名授权、内网地址限制和出口策略由应用及部署环境负责。

PostgreSQL/MySQL 队列的领取、续租和最终确认使用 SQL 执行时的数据库时钟；扫描截止也从数据库读取。节点时差及行锁等待跨过期限后不能续活旧 owner。本地 SQLite 只用于开发/测试，可控制测试时钟，不作为生产共享状态。

## 开发测试

```bash
pnpm --filter @h-ai/reach test
```

跨库时间回归用例 `tests/reach-repository-send-log-databases.test.ts` 通过 Testcontainers 启动隔离 PostgreSQL 16.15 / MySQL 8.4.11，并在结束时清理容器；须提供可用的 Docker API。使用 Podman 时，将 `DOCKER_HOST` 指向其兼容 socket；rootless 环境可按 Testcontainers 要求设置 `TESTCONTAINERS_RYUK_DISABLED=true`。

## 许可证

Apache-2.0
