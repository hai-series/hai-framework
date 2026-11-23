# @h-ai/reach 功能说明

[English](reach.en.md) · [日本語](reach.ja.md)

在服务端用 `reach` 发送邮件、短信或 HTTP 通知。发送前配置相应渠道的服务商，按需要使用模板、避免重复投递或排队重试。超过重试次数的通知可在失败队列中检查和处理。

[模块 README](../../../packages/reach/README.md) · [配置清单](../configuration/reach.md) · [数据结构](../data/reach.md) · [业务集成](../development/integrations.md)

<a id="quick-start"></a>

## 最小接入示例

### 依赖

- `@h-ai/reldb` — 数据库（发送日志与模板持久化）；配置非空 `templates` 或启用 quiet hours delay 时必须先初始化，模板保存或必需表准备失败时 `reach.init()` 返回 `CONFIG_ERROR` 并关闭候选 Provider。不使用模板/延迟队列的即时发送可选
- `@h-ai/cache` — 缓存（quiet hours delay 策略分布式锁），可选；已初始化时自动启用分布式锁

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

// 把 RelDB 和 Reach 两个步骤交给宿主运行时。后者依赖前者；这里仅创建 start/close 编排器。
const runtime = core.module.createRuntime([
  {
    name: 'reldb',
    // 启动进程内 SQLite，为模板和通知状态提供存储；成功无数据，数据库失败会阻止 Reach 启动。
    start: () => reldb.init({ type: 'sqlite', database: ':memory:' }),
    // 不传参数释放数据库连接，成功 data 为 undefined；运行时会在 Reach 之后执行此步。
    close: () => reldb.close()
  },
  {
    name: 'reach',
    // 启动 local 控制台渠道并注册 welcome 模板。成功后可调用发送接口，配置或模板存储失败会终止启动。
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
    // 不传参数关闭通知模块，成功后不再接收发送；解放失败由运行时继续报告。
    close: () => reach.close()
  },
])
// 按依赖顺序启动已登记步骤；全部成功时 data 为 undefined，失败时回收已启动部分并保留错误。
const initialized = await runtime.start()
if (!initialized.success)
  throw new Error(initialized.error.message)

let result: Awaited<ReturnType<typeof reach.send>>
try {
  // 用 welcome 模板给 user@example.com 渲染 Hello Alice，并交给 local 控制台渠道。即发成功时 deferred 为 false 或省略；渲染或发送失败则报告错误。
  result = await reach.send({
    to: 'user@example.com',
    template: 'welcome',
    vars: { userName: 'Alice' }
  })
}
catch (error) {
  // 逆序解放 Reach 和 SQLite，成功无数据；失败单独报告清理错误。
  const closed = await runtime.close()
  throw new AggregateError(closed.success
    ? [error]
    : [error, closed.error], 'Reach operation failed')
}
// 逆序解放 Reach 和 SQLite，成功无数据；失败单独报告清理错误。
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

<a id="api-reference"></a>

## 功能说明

下面的场景代码从本页最小接入中导入模块；除连接/关闭场景外，均在初始化成功后、关闭前运行。每次调用后先检查 `HaiResult.success`；失败分支返回原结果，成功分支再读取 `data`。未给出函数声明的场景是应用异步业务函数内的片段。各场景使用独立测试数据，不能把相邻片段当成无需清理的生产脚本。

<a id="sending"></a>

### 启动渠道并发送通知：`reach`

先按配置准备邮件或短信渠道，再用模板和收件人发送；持久化模板与队列依赖 RelDB。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `reach.init(config, options?)` | 准备配置中的通知渠道。存储模板或使用延迟队列时先连接 RelDB | `config: ReachConfigInput`, `options?: ReachInitOptions` · [初始化选项](#reach-init-options) | `Promise<HaiResult<void>>` | `await reach.init(config)` |
| `reach.close()` | 关闭当前通知渠道；持久化记录仍可由后续实例读取 | 无参数 | `Promise<void>` | `await reach.close()` |
| `reach.send(message)` | 发送消息或交给持久队列 | 必填 `message: ReachMessage` 包含收件人和内容，见[消息字段](#reach-message-fields)。 | `SendResult` | `await reach.send({ template: 'welcome', to: 'user@example.com', vars: { name: 'Alice' } })` |

<a id="reach-message-fields"></a>

**ReachMessage**

| 字段 | 类型 | 必填与默认 | 用途及生效条件 |
| --- | --- | --- | --- |
| `to` | `string` | 必填 | 渠道收件人，例如邮箱或手机号。 |
| `template` | `string` | 可省略 | 按名称读取并渲染已保存模板。省略时使用直接发送字段。 |
| `provider` | `string` | 直接发送必填 | 覆盖渠道选择。模板发送省略时沿用模板的渠道。 |
| `vars` | `Record<string, string>` | 可省略 | 按键替换模板中的变量。 |
| `subject / body` | `string` | 可省略 | 直接发送时的标题和正文。标题用于需要主题的渠道，例如邮件。 |
| `extra` | `Record<string, unknown>` | 可省略 | 传渠道专有字段，例如短信模板编码或签名。 |
| `idempotencyKey` | `string` | 可省略 | API 直接发送时可传给接收端作为稳定键。队列固定使用其 queueId。 |
| `sensitive` | `boolean` | `false` | 凭据类消息用 true，仅在内存发送，不进入延迟或重投队列。 |
| `expiresAt` | `number` | sensitive 为 true 时必填 | 业务凭据截止时间，Unix 毫秒。 |
| `deferPolicy` | `'queue' \| 'reject'` | `queue` | 普通通知遇免打扰时，queue 使用已有延迟配置，reject 返回 DND_BLOCKED 以便宿主自行延后。 |

#### 场景：启动渠道并发送通知

reach.send 可能联系渠道，也可能为普通通知返回排队回执。敏感凭据通知使用单独的发送账本，不把正文放入延迟队列。

![通知：直接发送、排队和未知结果](../images/function-reach-delivery.svg)

普通消息允许延迟时，由持久队列稍后领取发送；显式 reject 则拒绝排队。敏感消息遇到免打扰、过期或结果不明时不自动重投。渠道受理成功不代表用户已读或最终送达；超时后的未知结果先核对渠道记录，再决定人工恢复。

```ts
// 以下为应用异步业务函数体片段；失败时返回原结果。
// 用已保存的 demo-welcome 模板将 Ada 渲染到正文并通知 demo@example.com。收到 deferred 回执只表示入队；模板或渠道失败时返回原失败结果。
const sentResult = await reach.send({ template: 'demo-welcome', to: 'demo@example.com', vars: { name: 'Ada' } })
if (!sentResult.success)
  return sentResult
const sent = sentResult.data
// sent: SendResult for this provider attempt, not proof that a person read the message
```

输入使用已配置的渠道和模板；真实发送会联系外部服务，仅在测试渠道执行示例。init 成功无数据，close 返回 Promise<void>；队列受理也不等于最终送达。

模板发送只需 `template`、`to` 和 `vars`，Provider 默认来自模板；显式 `provider` 仍可覆盖。无模板的直接发送必须提供 Provider，缺少时返回失败 HaiResult。

初始化成功后才能调用业务方法。应用代码在调用前准备实际的业务参数，校验输入和权限。收到 `HaiResult` 时先检查 `success`，成功时读 `data`，失败时读 `error`。成功结果为 `void` 时没有业务数据。返回 `null` 时表示没有找到值。

模板用 `name` 标识，`vars` 是替换正文或标题的变量，模板定义包含发送渠道 `provider` 和正文 `body`，还可以包含标题 `subject`。队列用持久化的 `queueId`（UUID）查找。恢复失败消息或确认发送结果之前，先读取当前版本并人工核对实际投递记录。

<a id="reach-init-options"></a>

#### 初始化选项

启动时从[通知配置](../configuration/reach.md)取得 `config: ReachConfigInput`。可省略 `options: ReachInitOptions`，默认沿用配置中的网关请求头和请求体。

`gatewayHooks` 是按 Provider 名称索引的回调对象，只能绑定配置了 `gateway` 的 `aliyun-sms` Provider。回调获知 `method: POST`、网关 `url`、当前请求体 `body: string | undefined` 和请求期限内有效的 `signal: AbortSignal`。它可同步或异步返回 `{ headers?, body? }`，仅设置需要覆盖的字段，或返回 `undefined` 沿用静态配置。回调在服务端执行，避免将带签名的 URL 写入日志。

```ts

import { type ReachConfigInput, reach } from '@h-ai/reach'

function startReach(config: ReachConfigInput) {
  // 传入已配置 sms 网关的启动配置。成功时注册的回调会在下一次网关请求中加入 X-Client 请求头。
  return reach.init(config, {
    gatewayHooks: {
      sms: ({ signal }) => {
        signal.throwIfAborted()
        return { headers: { 'X-Client': 'delivery' } }
      },
    },
  })
}
```

#### 生产共享状态

生产拒绝 console Provider，须配置真实 SMTP/短信/API 服务。console 的日志成功不是外部投递成功；非幂等服务的未知结果必须核对，不能自动重发证明 exactly-once。 NODE_ENV 或 HAI_CORE_ENV 为 production 时在初始化发布成功前校验；仅 HAI_E2E=1/HAI_E2E_MOCK=1 明确测试可豁免。 [状态、并发和恢复边界](../../../.agents/instructions/distributed-state.md).

#### 凭据通知与持久化准备

发送密码、OTP 或重置令牌时使用 `reach.send({ ..., sensitive: true, expiresAt, idempotencyKey })`。expiresAt 是 Unix 毫秒，稳定操作键不可包含凭据。必须有共享发送账本：只持久化无载荷回执/状态，接收方脱敏，不存正文、变量或低熵凭据摘要，也不进入延迟队列。发送成功返回 receiptId；quiet hours/过期不投递，异常或不明状态不自动重投。明确启用的开发控制台仍可显示业务允许的通知，持久采集观察器被隔离；生产 Console Provider 限制不变。普通通知可用 deferPolicy: reject 阻止二次排队。

`reach.init()` 创建并校验发送日志表及队列标识约束，结构不符时返回初始化失败。保留发送账本，按持久回执核对状态，避免重发结果不明的凭据通知。

#### API 回执与目标边界

空正文的成功 2xx（含 204/205）表示接收端受理，messageId 可缺省，不代表最终送达。非空正文须为 JSON 对象，messageId 若存在须为不超过 255 字符的字符串；响应最多 64 KiB，非法响应、超时和网络失败不会假装成功或输出第三方正文。

API Provider 的 `redirect` 默认为 `error`；只有普通消息可显式设为 `follow`。`sensitive:true` 始终拒绝跳转，不转发正文和私有头。`requireHttps:true` 强制初始 HTTPS 且与 follow 互斥；省略时生产敏感消息要求 HTTPS，显式 false 仅适用于操作者确认的受信内网。超时或源端已产生的未知副作用仍须核对，敏感消息不自动重投。域名授权、内网地址限制和出口策略由应用及部署环境负责。

PostgreSQL/MySQL 队列的领取、续租和最终确认使用 SQL 执行时的数据库时钟；扫描截止也从数据库读取。节点时差及行锁等待跨过期限后不能续活旧 owner。本地 SQLite 只用于开发/测试，可控制测试时钟，不作为生产共享状态。

<a id="templates"></a>

### 维护与预览通知模板：`reach.template`

模板决定使用哪个渠道、正文和标题；render 可先检查变量替换结果而不发送。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `reach.template.resolve(name)` | 读取一个生效模板 | `name: string` 用于查找模板的唯一名称 | `ReachTemplate` | `await reach.template.resolve('welcome')` |
| `reach.template.save(template)` | 保存一个模板 | `template: ReachTemplate` 必填 name、provider 和 body，可选邮件 subject。正文与标题可写 {var} 占位符 | `void` | `await reach.template.save({ name: 'welcome', provider: 'local', body: 'Hello {name}', subject: 'Welcome' })` |
| `reach.template.saveBatch(templates)` | 批量保存模板 | `templates: ReachTemplate[]` 批量保存的模板数组，每项与 save 的字段相同 | `void` | `await reach.template.saveBatch([{ name: 'welcome', provider: 'local', body: 'Hello {name}' }])` |
| `reach.template.remove(name)` | 删除自定义模板 | `name: string` 用于查找模板的唯一名称 | `void` | `await reach.template.remove('welcome')` |
| `reach.template.list()` | 列出当前模板 | 无参数 | `ReachTemplate[]` | `await reach.template.list()` |
| `reach.template.render(name, vars)` | 替换模板变量并预览 | `name: string` 用于查找模板的唯一名称。`vars: Record<string, string>` 占位符名称到替换值的映射 | `RenderedTemplate` | `await reach.template.render('welcome', { name: 'Alice' })` |

#### 场景：维护与预览通知模板

```ts
// 以下为应用异步业务函数体片段；失败时返回原结果。
// 将主题 Welcome、正文 Hello {name} 与 local 渠道关联并保存为 demo-welcome；成功无数据，持久化错误时返回原失败结果。
const saveResult = await reach.template.save({ name: 'demo-welcome', provider: 'local', body: 'Hello {name}', subject: 'Welcome' })
if (!saveResult.success)
  return saveResult
// 批量保存使用 local 渠道的 demo-goodbye，正文为 Bye {name}。成功无数据，部分失败时已写入项不保证回滚。
const saveBatchResult = await reach.template.saveBatch([{ name: 'demo-goodbye', provider: 'local', body: 'Bye {name}' }])
if (!saveBatchResult.success)
  return saveBatchResult
// 按 demo-welcome 名称读取上面保存的模板；未找到时时返回原失败结果。
const templateResult = await reach.template.resolve('demo-welcome')
if (!templateResult.success)
  return templateResult
const template = templateResult.data // 已保存的模板
// 传入 demo-welcome 和变量 Ada 预览，返回正文 Hello Ada 及主题，不发送通知；模板缺失会失败。
const previewResult = await reach.template.render('demo-welcome', { name: 'Ada' })
if (!previewResult.success)
  return previewResult
const preview = previewResult.data // 正文为 Hello Ada
// 无参读取已保存的模板列表，包含上面两项；查询失败时返回原失败结果。
const templatesResult = await reach.template.list()
if (!templatesResult.success)
  return templatesResult
const templates = templatesResult.data // 包含刚保存的两个模板
// 删除 demo-goodbye 模板，成功无数据；存储错误时返回原失败结果。
const removeResult = await reach.template.remove('demo-goodbye')
if (!removeResult.success)
  return removeResult
```

先配置名为 mail 的测试 Provider。输出中的正文由 name= Ada 得到，remove 只删除模板，不撤回已发送内容。

<a id="queue"></a>

### 查询延迟与失败发送：`reach.queue`

发送被排队后保存返回的队列编号；排查时按编号读取状态，或列出死信。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `reach.queue.get(queueId)` | 按 ID 查询发送记录 | `queueId: string` 从发送回执或队列记录取得的 UUID | `ReachQueueEntry \| null` | `await reach.queue.get(queueId)` |
| `reach.queue.list(options)` | 筛选并分页查询发送记录 | `options: ReachQueueListOptions` · [查询参数](#reach-queue-options) | `Promise<HaiResult<ReachQueueEntry[]>>` | `await reach.queue.list({ status: 'dead', limit: 20 })` |

<a id="reach-queue-options"></a>

查询选项 `ReachQueueListOptions` 必填。`status` 必填，取 `dead` 或 `unknown`。`limit` 取 1–100，默认 50。`offset` 取 0–1,000,000，默认 0，表示跳过多少条。

#### 场景：查询延迟与失败发送

```ts
// 以下为应用异步业务函数体片段；失败时返回原结果。
// 从队列读取最多 20 条 dead 状态摘要，没有匹配返回空数组；读取错误时返回原失败结果。
const entriesResult = await reach.queue.list({ status: 'dead', limit: 20 })
if (!entriesResult.success)
  return entriesResult
const entries = entriesResult.data
if (entries.length > 0) {
  // 按第一条摘要的 queueId 重读当前状态；记录已不存在则成功返回 null，读取错误单独失败。
  const entryResult = await reach.queue.get(entries[0].queueId)
  if (!entryResult.success)
    return entryResult
  const entry = entryResult.data // 当前发送记录；已不存在时为 null
}
```

输出依赖实际队列；空数组表示没有符合条件的记录，get 的 null 表示该编号不存在。队列 ID 来自受理结果或列表。

<a id="recovery"></a>

### 人工核对后恢复发送：`reach.queue`

外部服务可能已发送但回执丢失；先核对渠道记录，再决定补发或记录已完成。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `reach.queue.requeueDead(queueId, options)` | 核对后重新排队死信 | `queueId: string` 来自队列记录。`options.expectedUpdatedAt: number` 必填，传最近一次读取记录的 `updatedAt`。 | `Promise<HaiResult<void>>` | `await reach.queue.requeueDead(queueId, requeueDecision)` |
| `reach.queue.resolveUnknown(queueId, resolution)` | 人工确认未知的发送结果 | `queueId: string` 从发送回执或队列记录取得的 UUID。`resolution: ReachUnknownResolution` 必填人工核对结果，见[裁定字段](#reach-resolution-fields) | `void` | `await reach.queue.resolveUnknown(queueId, verifiedDecision)` |

<a id="reach-resolution-fields"></a>

**恢复与裁定输入**

| 字段 | 类型 | 必填与默认 | 用途及生效条件 |
| --- | --- | --- | --- |
| `options.expectedUpdatedAt` | `number` | 必填 | 重排 dead 时用最近读取回执的 updatedAt，并发写入后重新读取。 |
| `resolution.status` | `'sent' \| 'discarded'` | 必填 | 只在外部核对后记录已发送或终止处理。 |
| `resolution.messageId` | `string` | 可省略 | 确认已发送时可记渠道回执编号，最多 255 字符。 |

#### 场景：人工核对后恢复发送

输入为已授权操作员在渠道核实后的决定；此函数不会自动替你作出决定。旧发送进程须先隔离。返回成功时没有业务数据，只表示数据库接受裁定。

```ts
import type { ReachUnknownResolution } from '@h-ai/reach'

async function recordVerifiedDelivery(queueId: string, decision: ReachUnknownResolution) {
  // 按调用方提供的队列回执读取当前记录。缺项是 null，只有仍为 unknown 才继续人工处置。
  const currentResult = await reach.queue.get(queueId)
  if (!currentResult.success)
    return currentResult
  const current = currentResult.data
  if (current?.status !== 'unknown')
    throw new Error('Expected an unknown delivery')
  // 把可信核验结论写到指定的 unknown 记录，成功无数据且不重发；状态已变化或结论无效则失败。
  const resolveUnknownResult = await reach.queue.resolveUnknown(queueId, decision)
  if (!resolveUnknownResult.success)
    return resolveUnknownResult
  // 用同一 queueId 读取已处理记录，检查当前状态是 sent 或 discarded；仍需处理独立的读取失败。
  const getResult = await reach.queue.get(queueId)
  if (!getResult.success)
    return getResult
  return getResult.data // 当前状态为 sent 或 discarded
}
```

#### 分布式锁

缓存锁让多个节点尽量分开扫描队列。锁在 300 秒后失效，多个节点仍可能同时扫描，所以数据库还会为每一条消息单独核对领取者身份及执行期限。每轮最多领取 100 条消息。准备实际发送时，数据库确认领取仍有效，并将状态改为 `sending`。发送期间每隔期限的三分之一续期。超时的领取者不能继续续期、开始发送或登记结果。免打扰时段结束后，每分钟继续检查剩余消息。

- 状态为 `pending → processing → sending → sent`；`processing` 过期可安全重领。
- API 只有配置 `idempotent: true` 才允许重领在途消息。这是对接收端能力的声明，不会凭空实现幂等。每次请求的 `Idempotency-Key` 请求头和 `idempotencyKey` 正文字段均固定为持久化 `queueId`；接收端必须把去重记录和副作用原子提交。去重记录必须覆盖所有迟到请求，包括暂停后恢复的旧节点；无法界定最长迟到时间时不能过期删除。各节点同名 Provider 必须连接同一目标和幂等存储。
- SMTP、阿里云短信、默认 API 没有外部幂等保证。已经进入 `sending` 后的失败、异常或租约丢失按未知结果处理，过期后转为 `unknown`，新消费者不会自动重发。未连接 Provider 按持久策略退避；发送前解析失败直接进入 dead。Console 仅输出开发元数据，不产生真实投递。
- 续租、数据库 owner 条件和取消信号都不能撤销已发出的邮件、短信或 HTTP 副作用；模块不提供通用 exactly-once 保证。

<a id="detailed-workflow"></a>

#### 场景：核对后重排死信

可信服务端可用 `reach.queue.list({ status: 'dead', limit: 50, offset: 0 })` 查询死信，也可查询 `unknown`；每页最多 100 条，offset 上限 1000000。get/list 返回状态、attemptCount、maxAttempts、nextAttemptAt、lastFailure 和 updatedAt，不含正文、收件人及 owner。修复 Provider 配置或消息根因后，查询最新 dead 版本再恢复：

```ts
async function restoreDead(queueId: string) {
// 用运维人员提供的回执读取最新记录和更新时间；不存在为 null，读取失败由下方处理。
const state = await reach.queue.get(queueId)
if (!state.success)
  throw new Error(state.error.message)
if (state.data?.status === 'dead' && state.data.updatedAt !== undefined) {
  // 按刚读取的更新时间条件恢复死信。成功无数据，只改为待处理；状态或更新时间不匹配时失败。
  const restored = await reach.queue.requeueDead(queueId, { expectedUpdatedAt: state.data.updatedAt })
  if (!restored.success)
    throw new Error(restored.error.message)
}
}
```

调用 `reach.queue.requeueDead()` 只会恢复版本匹配且仍为 `dead` 的记录，重置尝试次数并保留原来的 `queueId` 和重试等待策略。过时请求、并发更新和 `unknown` 状态都会失败。如果此前有送往外部 API 的请求正在执行，复发前要确认对方仍会按原 `queueId` 去重。发送内容本身有误时，应先排查和更正内容，重复恢复不会修复消息。

#### 未知结果人工核对

在服务端管理代码中，用 `reach.queue.get(queueId)` 查看发送状态。结果不会包含收件地址或消息正文。看到 `unknown` 时，先停止旧的发送进程，再用 `queueId` 对照发送渠道日志和第三方投递记录。

确认后调用 `reach.queue.resolveUnknown()` 把记录改为 `sent` 或 `discarded`。只有状态仍为 `unknown` 的记录可以修改，多位操作员同时提交时只接受一次。这个操作只更新记录，已经开始的外部发送仍可能生效。确认旧请求不会继续生效后，才可创建一条新消息补发。

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
| `HaiReachError.quiet hours_BLOCKED`            | `hai:reach:006` | 免打扰丢弃       |
| `HaiReachError.NOT_INITIALIZED`        | `hai:reach:010` | 未初始化         |
| `HaiReachError.UNSUPPORTED_TYPE`       | `hai:reach:011` | 不支持的类型     |
| `HaiReachError.CONFIG_ERROR`           | `hai:reach:012` | 配置错误         |
| `HaiReachError.DELIVERY_REJECTED`      | `hai:reach:020` | API 明确永久拒绝 |

```ts
// 使用已配置的 email 渠道向 user@example.com 发送正文 hello。读取回执区分已发送与延迟入队，失败由下方处理。
const result = await reach.send({ provider: 'email', to: 'user@example.com', body: 'hello' })
if (!result.success) {
  // result.error.code / result.error.message
}
```
