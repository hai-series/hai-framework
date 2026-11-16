# @h-ai/reach 功能说明

在服务端用 `reach` 发送邮件、短信或 HTTP 通知。发送前配置相应渠道的服务商，按需要使用模板、避免重复投递或排队重试。超过重试次数的通知可在失败队列中检查和处理。

[模块 README](../../../packages/reach/README.md) · [配置清单](../configuration/reach.md) · [数据结构](../data/reach.md) · [业务集成](../development/integrations.md)

## 最小接入示例

### 依赖

- `@h-ai/reldb` — 数据库（发送日志与模板持久化）；配置非空 `templates` 或启用 DND delay 时必须先初始化，模板保存或必需表准备失败时 `reach.init()` 返回 `CONFIG_ERROR` 并关闭候选 Provider。不使用模板/延迟队列的即时发送可选
- `@h-ai/cache` — 缓存（DND delay 策略分布式锁），可选；已初始化时自动启用分布式锁

#### 安装

```bash
pnpm add @h-ai/reach
```

邮件发送需安装 `nodemailer`。

#### 多 Provider 初始化

```ts
import { core } from '@h-ai/core'
import { reach } from '@h-ai/reach'
import { reldb } from '@h-ai/reldb'

const runtime = core.module.createRuntime([
  {
    name: 'reldb',
    start: () => reldb.init({ type: 'sqlite', database: ':memory:' }),
    close: () => reldb.close()
  },
  {
    name: 'reach',
    start: () => reach.init({
      providers: [
        { name: 'local', type: 'console' }
      ],
      templates: [
        {
          name: 'welcome',
          provider: 'local',
          subject: 'Welcome',
          body: 'Hello {userName}'
        }
      ],
    }),
    close: () => reach.close()
  },
])
const initialized = await runtime.start()
if (!initialized.success)
  throw new Error(initialized.error.message)

let result: Awaited<ReturnType<typeof reach.send>>
try {
  result = await reach.send({
    to: 'user@example.com',
    template: 'welcome',
    vars: { userName: 'Alice' }
  })
}
catch (error) {
  const closed = await runtime.close()
  throw new AggregateError(closed.success
    ? [error]
    : [error, closed.error], 'Reach operation failed')
}
const closed = await runtime.close()
if (!closed.success) {
  throw new AggregateError(result.success
    ? [closed.error]
    : [result.error, closed.error], 'Reach cleanup failed')
}
if (!result.success)
  throw new Error(result.error.message)
```

以上示例使用开发 Console Provider，只记录发送元数据，不实际发邮件或短信。需要真实投递时，按下方配置 SMTP、短信或 API Provider；数据库持久化和共享缓存按需初始化。

`reach.config` 返回的是**脱敏后的配置快照**：`api.url` / `endpoint` 的内嵌凭证、所有自定义请求头值、SMTP `pass` 和短信密钥都会隐藏。网关正文不进入快照；部署向导把 API 请求头整体保存到私有环境文件，不依赖头名猜测认证信息。

```ts
const ready = reach.isInitialized // 无需参数，至少一个通知 Provider 已发布时为 true。
const activeConfig = reach.config // 无需参数，读取脱敏快照；关闭后为 null。
```

Provider 就绪后仍需检查每次发送的 `HaiResult`。

Provider 失败保留完整模块错误定义（含 HTTP 状态），SMTP/短信原始响应不进入返回消息或 cause；前端使用本地化提示，服务端日志保留诊断上下文。

一次模板发送使用同一个模板快照渲染主题、正文并选择默认 Provider，避免并发编辑时混用不同版本。显式 `provider` 仍可覆盖模板渠道。

## 功能说明

模板发送只需 `template`、`to` 和 `vars`，Provider 默认来自模板；显式 `provider` 仍可覆盖。无模板的直接发送必须提供 Provider，缺少时返回失败 HaiResult。

### 功能输入输出

下表中的调用假定模块已经初始化成功。应用代码提供实际的业务参数，并在调用前校验输入和权限。收到 `HaiResult` 时先检查 `success`，成功时读 `data`，失败时读 `error`。成功结果为 `void` 时没有业务数据。返回 `null` 时表示没有找到值。

模板用 `name` 标识，`vars` 是替换正文或标题的变量，模板定义包含发送渠道 `provider` 和正文 `body`，还可以包含标题 `subject`。队列用持久化的 `queueId`（UUID）查找。恢复失败消息或确认发送结果之前，先读取当前版本并人工核对实际投递记录。

#### reach

使用 `reach.send()` 时传接收地址，并选择模板或发送渠道。结果为 `queued` 表示已排队。结果为 `sent` 表示渠道接受了发送请求。若无法确认送达或没有回执，先核对记录再决定是否补发。

| 入口         | 输入参数 | 成功结果     | 调用示例                                                                                     |
| ------------ | -------- | ------------ | -------------------------------------------------------------------------------------------- |
| `reach.send` | message  | `SendResult` | `await reach.send({ template: 'welcome', to: 'user@example.com', vars: { name: 'Alice' } })` |

#### reach.template

模板管理：name 得到模板，模板对象/数组保存或名称删除返回 void，list 返回模板数组，render 输入 name/vars 返回 body、subject 和 provider。

| 入口                       | 输入参数   | 成功结果           | 调用示例                                                                                                       |
| -------------------------- | ---------- | ------------------ | -------------------------------------------------------------------------------------------------------------- |
| `reach.template.resolve`   | name       | `ReachTemplate`    | `await reach.template.resolve('welcome')`                                                                      |
| `reach.template.save`      | template   | `void`             | `await reach.template.save({ name: 'welcome', provider: 'mail', body: 'Hello {{name}}', subject: 'Welcome' })` |
| `reach.template.saveBatch` | templates  | `void`             | `await reach.template.saveBatch([{ name: 'welcome', provider: 'mail', body: 'Hello {{name}}' }])`              |
| `reach.template.remove`    | name       | `void`             | `await reach.template.remove('welcome')`                                                                       |
| `reach.template.list`      | 无参数     | `ReachTemplate[]`  | `await reach.template.list()`                                                                                  |
| `reach.template.render`    | name, vars | `RenderedTemplate` | `await reach.template.render('welcome', { name: 'Alice' })`                                                    |

#### reach.queue

用 `reach.queue.get(queueId)` 查询一条记录，用 `reach.queue.list()` 按状态查询多条。恢复 `dead` 记录需要最新版本和恢复决定。处理 `unknown` 时先查明实际发送结果，再提交人工决定。

| 入口                         | 输入参数            | 成功结果                  | 调用示例                                                      |
| ---------------------------- | ------------------- | ------------------------- | ------------------------------------------------------------- |
| `reach.queue.get`            | queueId             | `ReachQueueEntry \| null` | `await reach.queue.get(queueId)`                              |
| `reach.queue.list`           | options             | `ReachQueueEntry[]`       | `await reach.queue.list({ status: 'dead', limit: 20 })`       |
| `reach.queue.requeueDead`    | queueId, options    | `void`                    | `await reach.queue.requeueDead(queueId, requeueDecision)`     |
| `reach.queue.resolveUnknown` | queueId, resolution | `void`                    | `await reach.queue.resolveUnknown(queueId, verifiedDecision)` |

### 分布式锁

缓存锁让多个节点尽量分开扫描队列。锁在 300 秒后失效，多个节点仍可能同时扫描，所以数据库还会为每一条消息单独核对领取者身份及执行期限。每轮最多领取 100 条消息。准备实际发送时，数据库确认领取仍有效，并将状态改为 `sending`。发送期间每隔期限的三分之一续期。超时的领取者不能继续续期、开始发送或登记结果。免打扰时段结束后，每分钟继续检查剩余消息。

- 状态为 `pending → processing → sending → sent`；`processing` 过期可安全重领。
- API 只有配置 `idempotent: true` 才允许重领在途消息。这是对接收端能力的声明，不会凭空实现幂等。每次请求的 `Idempotency-Key` 请求头和 `idempotencyKey` 正文字段均固定为持久化 `queueId`；接收端必须把去重记录和副作用原子提交。去重记录必须覆盖所有迟到请求，包括暂停后恢复的旧节点；无法界定最长迟到时间时不能过期删除。各节点同名 Provider 必须连接同一目标和幂等存储。
- SMTP、阿里云短信、默认 API 没有外部幂等保证。已经进入 `sending` 后的失败、异常或租约丢失按未知结果处理，过期后转为 `unknown`，新消费者不会自动重发。未连接 Provider 按持久策略退避；发送前解析失败直接进入 dead。Console 仅输出开发元数据，不产生真实投递。
- 续租、数据库 owner 条件和取消信号都不能撤销已发出的邮件、短信或 HTTP 副作用；模块不提供通用 exactly-once 保证。

### 未知结果人工核对

在服务端管理代码中，用 `reach.queue.get(queueId)` 查看发送状态。结果不会包含收件地址或消息正文。看到 `unknown` 时，先停止旧的发送进程，再用 `queueId` 对照发送渠道日志和第三方投递记录。

确认后调用 `reach.queue.resolveUnknown()` 把记录改为 `sent` 或 `discarded`。只有状态仍为 `unknown` 的记录可以修改，多位操作员同时提交时只接受一次。这个操作只更新记录，已经开始的外部发送仍可能生效。确认旧请求不会继续生效后，才可创建一条新消息补发。

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

调用 `reach.queue.requeueDead()` 只会恢复版本匹配且仍为 `dead` 的记录，重置尝试次数并保留原来的 `queueId` 和重试等待策略。过时请求、并发更新和 `unknown` 状态都会失败。如果此前有送往外部 API 的请求正在执行，复发前要确认对方仍会按原 `queueId` 去重。发送内容本身有误时，应先排查和更正内容，重复恢复不会修复消息。

### 生产共享状态

生产拒绝 console Provider，须配置真实 SMTP/短信/API 服务。console 的日志成功不是外部投递成功；非幂等服务的未知结果必须核对，不能自动重发证明 exactly-once。 NODE_ENV 或 HAI_CORE_ENV 为 production 时在初始化发布成功前校验；仅 HAI_E2E=1/HAI_E2E_MOCK=1 明确测试可豁免。 [状态、并发和恢复边界](../../../.agents/instructions/distributed-state.md).

### 凭据通知与持久化准备

发送密码、OTP 或重置令牌时使用 `reach.send({ ..., sensitive: true, expiresAt, idempotencyKey })`。expiresAt 是 Unix 毫秒，稳定操作键不可包含凭据。必须有共享发送账本：只持久化无载荷回执/状态，接收方脱敏，不存正文、变量或低熵凭据摘要，也不进入延迟队列。发送成功返回 receiptId；DND/过期不投递，异常或不明状态不自动重投。明确启用的开发控制台仍可显示业务允许的通知，持久采集观察器被隔离；生产 Console Provider 限制不变。普通通知可用 deferPolicy: reject 阻止二次排队。

`reach.init()` 创建并校验发送日志表及队列标识约束，结构不符时返回初始化失败。保留发送账本，按持久回执核对状态，避免重发结果不明的凭据通知。

### API 回执与目标边界

空正文的成功 2xx（含 204/205）表示接收端受理，messageId 可缺省，不代表最终送达。非空正文须为 JSON 对象，messageId 若存在须为不超过 255 字符的字符串；响应最多 64 KiB，非法响应、超时和网络失败不会假装成功或输出第三方正文。

API Provider 的 `redirect` 默认为 `error`；只有普通消息可显式设为 `follow`。`sensitive:true` 始终拒绝跳转，不转发正文和私有头。`requireHttps:true` 强制初始 HTTPS 且与 follow 互斥；省略时生产敏感消息要求 HTTPS，显式 false 仅适用于操作者确认的受信内网。超时或源端已产生的未知副作用仍须核对，敏感消息不自动重投。域名授权、内网地址限制和出口策略由应用及部署环境负责。

PostgreSQL/MySQL 队列的领取、续租和最终确认使用 SQL 执行时的数据库时钟；扫描截止也从数据库读取。节点时差及行锁等待跨过期限后不能续活旧 owner。本地 SQLite 只用于开发/测试，可控制测试时钟，不作为生产共享状态。

## 错误处理

收到 `HaiResult<T>` 时先检查 `result.success`。成功时读取 `result.data`，失败时查看 `result.error`。记录故障时保留错误码和追踪编号，便于从日志找到对应请求。

发送、模板查询和队列处理返回 `HaiResult<T>`。错误码定义在 `HaiReachError`。

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
