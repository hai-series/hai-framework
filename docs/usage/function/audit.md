# @h-ai/audit 功能说明

[English](audit.en.md) · [日本語](audit.ja.md)

通过 `audit` 在服务端记录谁做了什么、操作是否成功，以及能用于排查的请求编号。可以查询和统计记录、定期清理旧记录、归档到私有存储或按异常数量告警。先连接保存审计记录的关系数据库。

[模块 README](../../../packages/audit/README.md) · [配置清单](../configuration/audit.md) · [数据结构](../data/audit.md) · [服务集成](../development/integrations.md)

<a id="quick-start"></a>

## 最小接入示例

### 依赖

- `@h-ai/reldb` — 数据库（审计日志持久化），**需在 audit.init() 前初始化**

本例使用内存 SQLite，不会写入业务数据库。先初始化 RelDB，再初始化 Audit。记录一次登录后用相同的动作名查询，`logs.items` 包含刚写入的记录；退出时先关闭 Audit，再关闭数据库。请在开发环境运行（例如 `NODE_ENV=development`）；生产模式需要跨节点共享的数据库。

```ts
// 独立的启动/关闭脚本：此边界抛出原错误；返回 HaiResult 的业务函数仍应返回失败结果。
import { audit } from '@h-ai/audit'
import { reldb } from '@h-ai/reldb'

// 用 SQLite 内存库承载本例审计表，成功无 data，连接失败时在脚本边界抛出原错误。
const initResult = await reldb.init({ type: 'sqlite', database: ':memory:' })
if (!initResult.success)
  throw new Error(initResult.error.message, { cause: initResult.error })

try {
  // 借用已打开的数据库，采用默认审计配置。成功后可写日志，失败时在脚本边界抛出原错误。
  const initResult2 = await audit.init()
  if (!initResult2.success)
    throw new Error(initResult2.error.message, { cause: initResult2.error })
  try {
    // 为 demo-user 写入 auth 登录事件，成功返回有 ID 的记录，写入失败时在脚本边界抛出原错误。
    const logResult = await audit.log({ userId: 'demo-user', action: 'login', resource: 'auth' })
    if (!logResult.success)
      throw new Error(logResult.error.message, { cause: logResult.error })
    const saved = logResult.data
    // 查询 login 事件，每页最多 20 条。结果是分页对象，新库只包含刚写入的记录，查询失败时在脚本边界抛出原错误。
    const listResult = await audit.list({ action: 'login', pageSize: 20 })
    if (!listResult.success)
      throw new Error(listResult.error.message, { cause: listResult.error })
    const logs = listResult.data
    // 新数据库中，查询到的第一条记录就是刚写入的那条。
    if (logs.items[0]?.id !== saved.id)
      throw new Error('Expected the new login event')
  }
  finally {
    // 无参数释放审计状态，成功无 data，失败时在脚本边界抛出原错误。
    const closeResult = await audit.close()
    if (!closeResult.success)
      throw new Error(closeResult.error.message, { cause: closeResult.error })
  }
}
finally {
  // 在审计关闭后释放 SQLite 连接，成功无 data，关闭失败时在脚本边界抛出原错误。
  const closeResult2 = await reldb.close()
  if (!closeResult2.success)
    throw new Error(closeResult2.error.message, { cause: closeResult2.error })
}
```

<a id="api-reference"></a>

## 功能说明

下面的场景代码从本页最小接入中导入模块；除连接/关闭场景外，均在初始化成功后、关闭前运行。每次调用后先检查 `HaiResult.success`；失败分支返回原结果，成功分支再读取 `data`。未给出函数声明的场景是应用异步业务函数内的片段。各场景使用独立测试数据，不能把相邻片段当成无需清理的生产脚本。

<a id="lifecycle"></a>

### 准备审计服务：`audit`

先连接保存审计记录的 RelDB，再启动 Audit；关闭时反序释放。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `audit.init(config?)` | 等待审计表准备完成。先连接 RelDB | `config?`（省略时使用默认配置） | `Promise<HaiResult<void>>` | `await audit.init()` |
| `audit.close()` | 等待已开始的操作完成；RelDB 由应用关闭 | RelDB 由应用关闭；无 | `Promise<HaiResult<void>>` | `await audit.close()` |
| `audit.isInitialized` | 检查审计服务是否就绪 | 只读属性，无参数 | `boolean` | `audit.isInitialized` |

#### 场景：准备审计服务

```ts
// 以下为应用异步业务函数体片段；失败时返回原结果。
// 采用默认配置并借用已初始化的 RelDB，成功准备审计表，失败时返回原失败结果。
const initResult = await audit.init()
if (!initResult.success)
  return initResult
// 审计表已准备好，没有业务数据
// 读取就绪属性，审计表准备好后本例为 true。
audit.isInitialized // true
// 无参数停止审计，成功无 data 且借用的 RelDB 保持打开，失败时返回原失败结果。
const closeResult = await audit.close()
if (!closeResult.success)
  return closeResult
// 借用的 RelDB 仍保持打开，没有业务数据
```

输入省略时使用当前默认审计选项。重新初始化后再执行其他示例；close 不关闭借入的数据库。

SQLite、PostgreSQL、MySQL 的读取结果保持同一契约：`createdAt` 为 `Date`，`details` 为 JSON 字符串或 `null`，缺失的可空字段返回 `null`。日期筛选与写入使用相同的驱动日期转换；统计数量为安全整数，超出范围返回 `STATS_FAILED`。

初始化成功后才能调用业务方法。应用代码在调用前准备实际的业务参数，校验输入和权限。收到 `HaiResult` 时先检查 `success`，成功时读 `data`，失败时读 `error`。成功结果为 `void` 时没有业务数据。返回 `null` 时表示没有找到值。

<a id="events"></a>

### 记录操作与关联身份：`audit.log`、`audit.helper`

在可信服务端取得用户与请求编号后记录事件；常见登录、注册和密码事件可用 helper。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `audit.log(input, tx?)` | 保存一条明确的审计事件 | `input: CreateAuditLogInput` 必填事件，见[事件字段](#audit-event-fields)。`tx?: DmlWithTxOperations` 可选已有事务，让日志与业务同提交 | `AuditLog` | `await audit.log(event)` |
| `audit.capture(input, options?)` | 按自动采集策略记录事件 | `input: CreateAuditLogInput` 必填事件，见[事件字段](#audit-event-fields)。`options?` 自动采集的 read 标记和事务，见[采集字段](#audit-event-fields) | `void` | `await audit.capture(event)` |
| `audit.withContext(context, operation)` | 给操作绑定可信身份与请求信息 | `context: AuditContext` 可信异步上下文，见[身份字段](#audit-event-fields)。`operation: () => T` 在上下文中执行并透传其返回值 | `T` | `audit.withContext(trustedAuditContext, () => saveOrder())` |
| `audit.helper.login(userId, ip?, ua?)` | 记录登录事件 | `userId: string` 会话中的可信用户 ID。`ip?: string, ua?: string` 可选的客户端 IP 和 User-Agent | `void` | `await audit.helper.login(userId)` |
| `audit.helper.logout(userId, ip?, ua?)` | 记录退出事件 | `userId: string` 会话中的可信用户 ID。`ip?: string, ua?: string` 可选的客户端 IP 和 User-Agent | `void` | `await audit.helper.logout(userId)` |
| `audit.helper.register(userId, ip?, ua?)` | 记录注册事件 | `userId: string` 会话中的可信用户 ID。`ip?: string, ua?: string` 可选的客户端 IP 和 User-Agent | `void` | `await audit.helper.register(userId)` |
| `audit.helper.passwordResetRequest(email, ip?, ua?)` | 记录密码重置请求 | `email: string` 申请重置的邮箱。`ip?: string, ua?: string` 可选的客户端 IP 和 User-Agent | `void` | `await audit.helper.passwordResetRequest(email)` |
| `audit.helper.passwordResetComplete(userId, ip?, ua?)` | 记录密码重置完成 | `userId: string` 会话中的可信用户 ID。`ip?: string, ua?: string` 可选的客户端 IP 和 User-Agent | `void` | `await audit.helper.passwordResetComplete(userId)` |
| `audit.helper.crud(input)` | 记录资源增删改查 | `input: CrudAuditInput` 必填 action（create、read、update、delete）和 resource。可带 resourceId、details、userId、ip、ua 及[事件字段](#audit-event-fields) | `void` | `await audit.helper.crud(crudEvent)` |

<a id="audit-event-fields"></a>

**事件、上下文和自动采集选项**

| 字段 | 类型 | 必填与默认 | 用途及生效条件 |
| --- | --- | --- | --- |
| `CreateAuditLogInput.action / resource` | `string` | 必填 | 操作名与资源类别，例如 update 与 orders。 |
| `CreateAuditLogInput.userId / resourceId` | `string \| null` | 可省略 | 操作者与受影响资源的 ID。系统操作可无用户。 |
| `CreateAuditLogInput.details` | `Record<string, unknown> \| null` | 可省略 | 持久化的 JSON 详情，写入前脱敏。 |
| `category` | `'system' \| 'business' \| null` | 可省略 | 事件类别。AuditContext 也可为当前操作提供默认分类。 |
| `outcome` | `'success' \| 'failure' \| 'denied' \| null` | 可省略 | 记录业务操作的结果。 |
| `severity` | `'info' \| 'warning' \| 'error' \| 'critical' \| null` | 可省略 | 标记事件等级。 |
| `requestId / traceId / scopeId` | `string` | 可省略 | 在事件或上下文提供可信请求、链路和业务范围标识。事件输入也接受 null。 |
| `ipAddress / userAgent` | `string` | 可省略 | 可信客户端地址与 User-Agent。事件输入也接受 null。 |
| `actorSnapshot / AuditContext.actor` | `AuditActorSnapshot \| null` | 可省略 | 记录当时身份。对象必须包含 id，可附 username、displayName、roles。 |
| `capture.options.read` | `boolean` | `false` | 标记读取操作。配置不采集读取时，成功读取会跳过，而失败和拒绝可继续记录。 |
| `capture.options.tx` | `DmlWithTxOperations` | 可省略 | 提供当前业务事务，同一事务记录可与业务一起回滚。 |

例如自动采集已启用但不记录读取时，同一读取事件传 `{ read: true }`，`outcome: "success"` 成功返回且不写日志，`outcome: "denied"` 会保存拒绝事件。

#### 场景：记录操作与关联身份

```ts
// 以下为应用异步业务函数体片段；失败时返回原结果。
// 按用户、动作和资源保存显式登录事件，返回有 ID 和创建时间的记录，失败时返回原失败结果。
const savedResult = await audit.log({ userId: 'demo-user', action: 'login', resource: 'auth' })
if (!savedResult.success)
  return savedResult
const saved = savedResult.data
// saved includes its generated id and createdAt
// 将 demo-user 读取 orders 的安全字段交给自动采集，写入或按配置跳过时无 data，失败时返回原失败结果。
const captureResult = await audit.capture({ userId: 'demo-user', action: 'read', resource: 'orders' })
if (!captureResult.success)
  return captureResult
// 将可信用户 ID 绑定到下面的异步操作，返回回调产出的事件 ID，回调抛错原样传播。
const id = await audit.withContext({ actor: { id: 'demo-user' } }, async () => {
  // 在上下文中写 orders 更新事件，用户 ID 从外层补齐，成功返回记录；写入失败由下方异常分支终止回调。
  const recordResult = await audit.log({ action: 'update', resource: 'orders' })
  // withContext 保留普通回调返回值；这里显式抛出写入失败，避免把失败对象当成已保存记录。
  if (!recordResult.success)
    throw new Error(recordResult.error.message, { cause: recordResult.error })
  const record = recordResult.data
  return record.id
}) // id is the callback's returned record id
// 以 demo-user 为用户 ID 记录注册。成功无 data，写入失败时返回原失败结果。
const registerResult = await audit.helper.register('demo-user')
if (!registerResult.success)
  return registerResult
// 记录 demo-user 的登录。成功无 data，失败时返回原失败结果。
const loginResult = await audit.helper.login('demo-user')
if (!loginResult.success)
  return loginResult
// 记录 demo-user 的退出。成功无 data，失败时返回原失败结果。
const logoutResult = await audit.helper.logout('demo-user')
if (!logoutResult.success)
  return logoutResult
// 用示例邮箱记录已请求重置。成功无 data，记录失败时返回原失败结果。
const passwordResetRequestResult = await audit.helper.passwordResetRequest('demo@example.com')
if (!passwordResetRequestResult.success)
  return passwordResetRequestResult
// 用 demo-user 记录重置完成。成功无 data，记录失败时返回原失败结果。
const passwordResetCompleteResult = await audit.helper.passwordResetComplete('demo-user')
if (!passwordResetCompleteResult.success)
  return passwordResetCompleteResult
// helper calls succeed with undefined; query their saved events using audit.list
```

输入中的用户 ID 由应用鉴权取得，示例标识为虚构。log 返回已保存记录；capture 和 helper 成功无业务数据，withContext 直接保留回调的返回值。CRUD 事件结构见后续示例。

#### 事件输入约束

- `audit.log(input)`：`action` / `resource` 必须为非空字符串，且长度不超过 256。
- `audit.log(input)`：`details` 中的凭证类敏感字段（如 `password` / `token` / `secret`）会在持久化前自动脱敏；业务隐私字段（如邮箱、手机号）默认同时隐藏，可通过 privacy 配置调整。
- `audit.list(options)`：若同时传 `startDate` 与 `endDate`，必须满足 `startDate <= endDate`。
- `audit.getUserRecent(userId, limit)`：`userId` 必须为非空字符串；`limit`（如传入）必须为正整数。
- `audit.cleanup(days)`：`days`（如传入）必须为非负整数。
- `audit.getStats(days)`：`days`（如传入）必须为非负整数。

#### 场景：把业务变更与审计记录放进同一事务

如果业务要求“没有审计就不能生效”，必须显式使用同一个 RelDB 事务，并检查 audit.log 的结果。

![强制审计：业务和事件一起提交](../images/function-audit-transaction.svg)

图中的业务写入和 audit.log(input, tx) 都使用 tx；任一步失败都由调用方中止并回滚。普通 HTTP 自动采集失败会报告诊断，不会撤销已经完成的业务。要记录回滚后的失败事件，应在原事务回滚完成后另行记录，不能把它写进随后会被回滚的事务。

审计 createdAt、告警窗口与归档截止共用数据库时钟，不以各节点系统钟作为共享真值。备份与告警调度任务使用已验证的持久去重保障声明幂等；失败不会被错误地当作非幂等未知任务而阻塞后续调度。

`capture: { enabled: true, includeReads: false }` 控制框架自动采集。IAM 记录关键账号、鉴别、密码、授权、API Key 和会话事件；Serv/Kit 绑定已验证身份与可信地址，记录写请求及失败/拒绝，成功读取默认跳过。协议/输入校验前尚未确认身份时保留匿名事件。HTTP 入口只记录操作、方法、状态或原因码，不复制请求体、令牌和错误详情。业务含义仍由应用在完成/失败边界调用 `audit.log()` 记录；关闭自动采集不影响显式 log。审计应先于 IAM 初始化，并在 IAM 关闭后关闭。可信任务/CLI 应显式提供操作身份和关联上下文。

`audit.log(input, tx)` 与 `audit.capture(input, { tx })` 可使用调用者现有 RelDB 事务；事件与变更一并提交或回滚，不独立提交，也不留下回滚成功的假记录。事务回滚会移除其中的事件，调用入口应在回滚完成后记录失败/拒绝。自动采集写入失败会输出关联诊断，已生效的业务不会被改写成可盲目重试的失败；需要强制审计的业务应在同一事务检查显式 log 的 HaiResult 后再提交。

新记录包含 `category`（system/business）、`outcome`（success/failure/denied）、`severity`（info/warning/error/critical）、请求/链路/范围标识和 `actorSnapshot`。身份快照在事件发生时复制，改名、改角色或删除账号不会改写它。只传 userId 时按配置映射尝试捕获用户名；映射不可读时记录明确缺少名称的身份并输出诊断。HTTP 处理函数应从已认证会话获取操作者，并通过 `audit.withContext({ actor, requestId, ipAddress, userAgent }, operation)` 提供完整上下文，不能用未验证的请求体充当操作者。该工具保留 operation 的同步/异步结果及异常，业务写入仍返回 HaiResult。

`audit.list({ category, outcome, severity, scopeId, requestId, traceId, sortBy, sortDirection })` 支持分类筛选和受控排序，`getStats(7, { category: 'system' })` 统计指定类别的操作。`privacy.enabled` 默认开启，隐藏邮箱、电话等业务字段；`privacy.fields` 可补充项目字段名。凭据始终脱敏，关闭业务隐私不会泄漏 password/token。自由文本包含隐私时应配置整个对应字段隐藏。

`retention: { enabled: true, minDays: 90 }` 开启最低保留。共享数据库保存策略，清理使用实际最低期限，`cleanup(0)` 不能绕过；数据库触发器拒绝保护期内的 UPDATE、DELETE 和冲突覆盖写。框架首次未配置时不强制保护，清理参数默认90天本身不构成不可变保证。未传 retention 的重初始化沿用既有策略，只有可信启动配置显式关闭才解除。该保护针对正常行级写入；数据库所有者的 DDL/权限、独立归档和更强存储保护需由部署管理。

`audit.init()` 准备当前表结构和留存策略，结构不符时返回初始化失败。列表中的用户名来自事件时的身份快照，缺失时为 `null`。写入失败返回失败并输出关联诊断。`audit.close()` 等待已开始的写入，随后可关闭 RelDB。

脱敏匹配整个字段：对象、数组以及按应用要求选出的 JSON 字段中的敏感值同样隐藏。关闭或尚未初始化 Audit 时，capture 返回未初始化失败；只有已初始化模块的关闭采集配置才跳过自动事件。

#### 场景：记录订单更新

输入是可信操作者、资源名和订单 ID；成功结果没有业务数据，持久记录可通过 audit.list 查询。

```ts
// 以下为应用异步业务函数体片段；失败时返回原结果。
// 记录 demo-user 对 orders 中 order-42 的更新。成功无 data，失败时返回原失败结果。
const crudResult = await audit.helper.crud({
  userId: 'demo-user', action: 'update', resource: 'orders', resourceId: 'order-42',
})
if (!crudResult.success)
  return crudResult
```

<a id="queries"></a>

### 查询与清理旧记录：`audit`

排查时按用户、操作和时间查询；保留期限到达后批量删除历史记录。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `audit.list(options?)` | 筛选并分页查询事件 | 可选 `options: ListAuditLogsOptions`。见[筛选与分页字段](#audit-list-options)。 | `PaginatedResult<AuditLogWithUser>` | `await audit.list({ page: 1, pageSize: 20 })` |
| `audit.getUserRecent(userId, limit?)` | 查询用户近期活动 | 必填 `userId: string` 指定用户。`limit: number` 可省略，默认最多返回 10 条。 | `AuditLog[]` | `await audit.getUserRecent(userId, 20)` |
| `audit.getStats(days?, filters?)` | 统计指定天数内的操作 | 可选 `days: number` 默认 7 天。`filters` 可传 [列表字段](#audit-list-options)中的 category、outcome、severity、scopeId、userId、resource。 | `AuditStatItem[]` | `await audit.getStats(7)` |
| `audit.cleanup(olderThanDays?)` | 按保留策略删除旧记录 | `olderThanDays?: number` 默认 90 天，删除早于截止时间的事件 | `number` | `await audit.cleanup(90)` |

<a id="audit-list-options"></a>

**ListAuditLogsOptions**

| 字段 | 类型 | 必填与默认 | 用途及生效条件 |
| --- | --- | --- | --- |
| `requestId / traceId / scopeId` | `string` | 可省略 | 按请求、链路或业务范围精确匹配。 |
| `userId / action / resource` | `string` | 可省略 | 按事件用户、操作或资源类型精确匹配。 |
| `category` | `'system' \| 'business'` | 可省略 | 筛选系统或业务事件。 |
| `outcome` | `'success' \| 'failure' \| 'denied'` | 可省略 | 仅保留指定结果。 |
| `severity` | `'info' \| 'warning' \| 'error' \| 'critical'` | 可省略 | 仅保留指定等级。 |
| `startDate / endDate` | `Date` | 可省略 | 事件创建时间的含端点范围。两值同时传入时起点不能晚于终点。 |
| `sortBy` | `'createdAt' \| 'action' \| 'resource' \| 'category' \| 'outcome' \| 'severity'` | `createdAt` | 选择排序字段。 |
| `sortDirection` | `'asc' \| 'desc'` | `desc` | 指定排序方向。 |
| `page / pageSize` | `number` | 第 1 页，每页 20 条 | 设置查询页码和每页数量。 |

例如 `{ resource: "orders", outcome: "denied", sortDirection: "asc", pageSize: 5 }` 只查被拒绝的订单事件，按创建时间从旧到新返回，首页最多 5 条。

#### 场景：查询与清理旧记录

```ts
// 以下为应用异步业务函数体片段；失败时返回原结果。
// 筛选 login 并读取第一页的最多 20 条，返回记录和总数等分页信息，查询失败时返回原失败结果。
const pageResult = await audit.list({ action: 'login', page: 1, pageSize: 20 })
if (!pageResult.success)
  return pageResult
const page = pageResult.data // 记录列表、总数与分页信息
// 按用户 ID 读取最近最多 20 条，返回记录数组，查询失败时返回原失败结果。
const recentResult = await audit.getUserRecent('demo-user', 20)
if (!recentResult.success)
  return recentResult
const recent = recentResult.data // 最多 20 条审计记录
// 传 7 天统计窗口，返回按操作分组的计数，统计失败时返回原失败结果。
const statsResult = await audit.getStats(7)
if (!statsResult.success)
  return statsResult
const stats = statsResult.data // 最近七天按操作分组的统计
// 保留 90 天，返回删除的旧记录数，清理失败时返回原失败结果。
const removedResult = await audit.cleanup(90)
if (!removedResult.success)
  return removedResult
const removed = removedResult.data // 超过 90 天并已删除的记录数
```

输出取决于真实历史记录；空页、空统计与删除零条都可成功。cleanup 会真正删除过期记录，示例只在测试数据库执行。

<a id="backups"></a>

### 归档与核对备份：`audit.backup`

把历史记录归档到私有对象存储，核对完整性后才按保留策略处理原记录。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `audit.backup.run(options?)` | 创建或核对私有归档 | 可选 `options: AuditBackupOptions` 控制 ID 与扫描范围。见[归档字段](#audit-backup-options)。 | `AuditBackupInfo` | `await audit.backup.run()` |
| `audit.backup.verify(key, options?)` | 检查归档格式与校验和 | 必填 `key: string` 来自私有归档回执。可选 `options.signal: AbortSignal` 用于取消。 | `AuditBackupInfo` | `await audit.backup.verify(archiveKey)` |

<a id="audit-backup-options"></a>

**归档与校验选项**

| 字段 | 类型 | 必填与默认 | 用途及生效条件 |
| --- | --- | --- | --- |
| `AuditBackupOptions.id` | `string` | 随机 UUID | 同一归档任务传稳定 ID。已有同 ID 归档输入相符时核对并复用，冲突时返回失败。 |
| `AuditBackupOptions.from` | `Date` | 无下限 | 归档事件的开始时间。 |
| `AuditBackupOptions.to` | `Date` | 开始归档时的数据库时间 | 上界不能晚于归档开始，也不能早于 from。 |
| `signal` | `AbortSignal` | 可省略 | run 与 verify 都可接收取消信号。 |

需要重试同一归档时，保留 `{ id: "daily-audit", from, to }`。已有完整归档时，成功返回同一对象键的回执。

#### 场景：归档与核对备份

下文输入为归档筛选条件；run 返回 AuditBackupInfo，其中对象键用于 verify。verify 返回核对后的归档信息，不能把归档地址当公开下载链接。

#### 场景：启用私有归档与定时计划

`backup.enabled` 默认关闭。开启时向 `audit.init({ storage, backup: { enabled: true } })` 注入已经初始化的 `StorageFunctions`；数据库仍先初始化。`backup.batchSize` 控制扫描批量（默认200），`maxRecordBytes` 限制单条 UTF-8 记录（默认1 MiB），超限返回失败并保留原始审计，不截断证据。

`audit.backup.run({ id?, from?, to?, signal? })` 输出私有 JSONL 文件并返回 ID、key、记录数、SHA-256、开始和截止时间。固定命名空间为 `AUDIT_BACKUP_PREFIX`（hai-private/audit-backups/）。同一执行使用稳定 ID；已有完整归档校验后复用，导出条件冲突、文件不完整或损坏均返回失败，不能覆盖。条件写竞争与写结果未知时核对实际文件。`audit.backup.verify(key, { signal? })` 有界流式核对格式、记录数和校验和；校验和用于完整性，不代表来源真实性。

归档 v1 按行保存 header、`{type:'entry',record}` 和 footer。记录保留原始 ID、ISO 日期、已存详情及可空历史身份；不关联当前用户名。footer 的 SHA-256 覆盖之前所有 UTF-8 行及换行，且 recordCount 等于 entry 数量。可核对后离线读取或恢复至独立查询存储；不覆盖在线受保护记录。在线导出按固定截止时间与主键游标扫描，包含范围以实际扫描为准；需要同一时点的全量恢复时先暂停写入和清理，或采用数据库原生一致性快照。

定时配置位于 `backup.schedule`：`enabled`、五字段 cron（默认 `0 2 * * *`）、IANA timezone（默认 UTC）。开启后 `audit.schedulerPlan` 返回可显式合并进 `scheduler.init()` 的 tasks/hooks 计划；没有自动任务时为 null。回调复用 Scheduler 的共享执行编号和取消信号，并在失败时抛错使任务准确失败；未知执行按 Scheduler 规则核对，不能盲目重跑。示例应用和 fullstack 模板已经把计划传给 Scheduler。手工接入的应用需要把计划并入已有任务和回调。先关闭 Scheduler，再关闭 IAM、Audit、Storage 和 RelDB；Audit 取消并等待自己的备份，不关闭宿主 Storage。

```ts
import { scheduler } from '@h-ai/scheduler'

async function startAuditSchedule(schedulerSettings: Parameters<typeof scheduler.init>[0]) {
// 读取审计配置派生的任务与钩子，没有启用时为 null。
const plan = audit.schedulerPlan
if (plan) {
  // 将宿主调度配置和审计计划合并传入，成功无 data，失败读取 error。
  const initialized = await scheduler.init({
    ...schedulerSettings,
    ...plan
  })
  if (!initialized.success)
    throw new Error(initialized.error.message)
  // 无参数启动已初始化的调度器。成功后开始触发任务，失败读取 error。
  const started = scheduler.start()
  if (!started.success)
    throw new Error(started.error.message)
}
}
```

把上例放入服务端启动代码。先初始化 Audit、Storage 和 RelDB，再提供已校验的 `schedulerSettings`。归档使用私有存储，开启备份时拒绝配置了公开 publicUrl 的 S3；部署仍须限制桶/CDN访问。公开静态文件入口应仅开放指定资源；管理示例与 fullstack 仅公开规范头像路径，如提供归档下载，须通过审计授权接口处理，关闭备份也不改变已有文件的私有边界。

#### 场景：手工归档后验证完整性

前提：初始化时注入私有 Storage 并开启 backup。输入是本次归档 ID 和时间范围；run 返回的 key 交给 verify，后者返回同一归档的核对结果。

```ts
// 以下为应用异步业务函数体片段；失败时返回原结果。
// 传归档 ID 和 UTC 时间范围，成功返回私有归档键及清单，归档失败时返回原失败结果。
const archiveResult = await audit.backup.run({
  id: 'demo-login-archive',
  from: new Date('2026-01-01T00:00:00Z'),
  to: new Date('2026-01-02T00:00:00Z'),
})
if (!archiveResult.success)
  return archiveResult
const archive = archiveResult.data
// 用上一步签发的 archive.key 核对归档，数据是验证后的归档信息，损坏或读取失败时返回原失败结果。
const verifiedArchiveResult = await audit.backup.verify(archive.key)
if (!verifiedArchiveResult.success)
  return verifiedArchiveResult
const verifiedArchive = verifiedArchiveResult.data
// verifiedArchive identifies the same private archive; its contents passed verification.
```

<a id="alerts"></a>

### 检查异常并通知：`audit.checkAlerts`

主动检查当前达到阈值的规则；周期调度由 Scheduler 管理。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `audit.checkAlerts(options?)` | 检查阈值并尝试通知 | `options?: { signal?: AbortSignal }` 可取消异常检查或通知过程，省略时按配置执行 | `AuditAlertReport` | `await audit.checkAlerts()` |

#### 场景：检查异常并通知

```ts
// 以下为应用异步业务函数体片段；失败时返回原结果。
// 无参数按已配置规则检查窗口，返回通知的提交、入队和失败计数，检查失败时返回原失败结果。
const reportResult = await audit.checkAlerts()
if (!reportResult.success)
  return reportResult
const report = reportResult.data // 本轮告警检查报告
```

无参数时按当前规则检查。返回的是本轮检查及通知报告，不意味着每条通知都已送达；看报告中的实际结果。

#### 场景：按异常规则发送通知

`alerts.enabled` 默认关闭。开启时注入已初始化的 Reach：`audit.init({ reach, alerts: { enabled: true, rules: [...] } })`。规则通过稳定 id、actions（精确事件名）、可选 resource、outcomes、minimumSeverity 筛选事件，threshold/windowSeconds 指定固定窗口阈值，severity 指定通知等级，targets 中的 id/provider/to 指定人员或目标。默认窗口300秒，范围60–86400秒；默认仅失败/拒绝，空 outcomes 表示所有结果。规则和目标 id 必须各自唯一；provider 须已在 Reach 注册。不将具体业务角色写入框架。

调用 `audit.checkAlerts({ signal })` 会统计当前和上一个固定时间段内已经提交的事件。如果停机超过两个时间段，不会补发更早的通知。默认每次最多尝试发送 100 条，可配置 `maxNotificationsPerCheck`。报告中的 `more: true` 表示下次调用还要继续检查。共享数据库为同一规则、收件人和时间段登记一次通知，并在发送前核对执行期限。这样多个节点看到同一批事件时不会分别发送。更改规则条件或收件人后，系统视为一条新通知规则。

通知只包含规则/目标编号、等级、计数与窗口，不复制审计详情或凭据。submitted 表示 Provider 接受，queued 仅表示 Reach 持久入队，可通过 queueId 查询；都不等于人员已收到或阅读。失败/中断/崩溃留下 unknown、sending 或 claimed 回执，不自动重发不确定外部效果。运维先检查 `audit.alert` 事件与 `hai_audit_alert_claims`，核验通知端后处理；Reach 已入队的消息遵循其自身恢复规则。领取表不保存地址/正文，查询范围外已确认提交/入队的领取定期清理；未决回执保留供运维核验，通知审计遵守审计保留策略。

`alerts.schedule` 可独立启用，默认每分钟、UTC。`audit.schedulerPlan` 合并已启用的备份和告警任务，由应用启动代码传给 `scheduler.init()`；计划没有自动任务时为 null。调度回调在检查失败或 failed>0 时准确失败。先关闭 Scheduler，再关闭 Audit 和 Reach；关闭 Audit 取消后续领取并等待在途通知完成（受 Reach Provider 超时约束），Reach 仍由应用在 Audit 关闭后关闭。数据库查询/审计失败返回失败；通知业务失败在成功检查报告的 failed 字段体现，调用方必须检查。

## 错误处理

收到 `HaiResult<T>` 时先检查 `result.success`。成功时读取 `result.data`，失败时查看 `result.error`。记录故障时保留错误码和追踪编号，便于从日志找到对应请求。

业务数据操作返回 `HaiResult<T>`，常用错误码如下：

| 错误码                           | code            | 说明                   |
| -------------------------------- | --------------- | ---------------------- |
| `HaiAuditError.LOG_FAILED`       | `hai:audit:001` | 记录失败               |
| `HaiAuditError.QUERY_FAILED`     | `hai:audit:002` | 查询失败               |
| `HaiAuditError.CLEANUP_FAILED`   | `hai:audit:003` | 清理失败               |
| `HaiAuditError.STATS_FAILED`     | `hai:audit:004` | 统计失败               |
| `HaiAuditError.INIT_IN_PROGRESS` | `hai:audit:005` | 初始化进行中           |
| `HaiAuditError.NOT_INITIALIZED`  | `hai:audit:010` | 模块未初始化           |
| `HaiAuditError.CONFIG_ERROR`     | `hai:audit:012` | 配置错误               |
| `HaiAuditError.BACKUP_DISABLED`  | `hai:audit:020` | 备份未启用             |
| `HaiAuditError.BACKUP_FAILED`    | `hai:audit:021` | 备份或校验失败         |
| `HaiAuditError.BACKUP_INVALID`   | `hai:audit:022` | 备份输入无效           |
| `HaiAuditError.BACKUP_CONFLICT`  | `hai:audit:023` | 备份编号与导出条件冲突 |
| `HaiAuditError.ALERTS_DISABLED`  | `hai:audit:024` | 告警未启用             |
| `HaiAuditError.ALERTS_FAILED`    | `hai:audit:025` | 告警检查或通知失败     |

> 说明：`audit.close()` 也返回 `HaiResult<void>`；`audit.helper.passwordResetRequest()` 的邮箱详情默认经过业务隐私脱敏。

`audit.init()` 会等待自动建表和仓库就绪才返回成功；DDL 失败保持 `isInitialized=false`，修正数据库后可重试。列表、统计和清理也使用同一就绪屏障；初始化期间关闭会使迟到结果失效。先检查 init 的 HaiResult，再立即记录或查询；audit 不拥有共享 RelDB 的连接，关闭 audit 后再关闭数据库。
