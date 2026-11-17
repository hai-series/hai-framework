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
import type { HaiResult } from '@h-ai/core'
import { audit } from '@h-ai/audit'
import { reldb } from '@h-ai/reldb'

function dataOrThrow<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(result.error.message)
  return result.data
}

dataOrThrow(await reldb.init({ type: 'sqlite', database: ':memory:' }))

try {
  dataOrThrow(await audit.init())
  try {
    const saved = dataOrThrow(await audit.log({ userId: 'demo-user', action: 'login', resource: 'auth' }))
    const logs = dataOrThrow(await audit.list({ action: 'login', pageSize: 20 }))
    // 新数据库中，查询到的第一条记录就是刚写入的那条。
    if (logs.items[0]?.id !== saved.id)
      throw new Error('Expected the new login event')
  }
  finally {
    dataOrThrow(await audit.close())
  }
}
finally {
  dataOrThrow(await reldb.close())
}
```

<a id="api-reference"></a>

## 功能说明

下面的场景代码从本页最小接入中导入模块；除连接/关闭场景外，均在初始化成功后、关闭前运行。`value` 先检查 `HaiResult.success`，失败保留原错误，成功返回 data；只用于读取结果。各场景使用独立测试数据，不能把相邻片段当成无需清理的生产脚本。

```ts
import type { HaiResult } from '@h-ai/core'

function value<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(result.error.message, { cause: result.error })
  return result.data
}
```

<a id="lifecycle"></a>

### 准备审计服务：`audit`

先连接保存审计记录的 RelDB，再启动 Audit；关闭时反序释放。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `audit.init` | 等待审计表准备完成。先连接 RelDB | `config?`（省略时使用默认配置） | `Promise<HaiResult<void>>` | `await audit.init()` |
| `audit.close` | 等待已开始的操作完成；RelDB 由应用关闭 | RelDB 由应用关闭；无 | `Promise<HaiResult<void>>` | `await audit.close()` |
| `audit.isInitialized` | 检查审计服务是否就绪 | 只读属性，无参数 | `boolean` | `audit.isInitialized` |

#### 场景：准备审计服务

```ts
value(await audit.init()) // undefined; audit tables are ready
audit.isInitialized // true
value(await audit.close()) // undefined; the borrowed RelDB remains open
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
| `audit.log` | 保存一条明确的审计事件 | input, tx | `AuditLog` | `await audit.log(event)` |
| `audit.capture` | 按自动采集策略记录事件 | input, options | `void` | `await audit.capture(event)` |
| `audit.withContext` | 给操作绑定可信身份与请求信息 | context, operation | `T` | `audit.withContext(trustedAuditContext, () => saveOrder())` |
| `audit.helper.login` | 记录登录事件 | userId, ip, ua | `void` | `await audit.helper.login(userId)` |
| `audit.helper.logout` | 记录退出事件 | userId, ip, ua | `void` | `await audit.helper.logout(userId)` |
| `audit.helper.register` | 记录注册事件 | userId, ip, ua | `void` | `await audit.helper.register(userId)` |
| `audit.helper.passwordResetRequest` | 记录密码重置请求 | email, ip, ua | `void` | `await audit.helper.passwordResetRequest(email)` |
| `audit.helper.passwordResetComplete` | 记录密码重置完成 | userId, ip, ua | `void` | `await audit.helper.passwordResetComplete(userId)` |
| `audit.helper.crud` | 记录资源增删改查 | input | `void` | `await audit.helper.crud(crudEvent)` |

#### 场景：记录操作与关联身份

```ts
const saved = value(await audit.log({ userId: 'demo-user', action: 'login', resource: 'auth' }))
// saved includes its generated id and createdAt
value(await audit.capture({ userId: 'demo-user', action: 'read', resource: 'orders' })) // undefined
const id = await audit.withContext({ actor: { id: 'demo-user' } }, async () => {
  const record = value(await audit.log({ action: 'update', resource: 'orders' }))
  return record.id
}) // id is the callback's returned record id
value(await audit.helper.register('demo-user'))
value(await audit.helper.login('demo-user'))
value(await audit.helper.logout('demo-user'))
value(await audit.helper.passwordResetRequest('demo@example.com'))
value(await audit.helper.passwordResetComplete('demo-user'))
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
value(await audit.helper.crud({
  userId: 'demo-user', action: 'update', resource: 'orders', resourceId: 'order-42',
})) // undefined
```

<a id="queries"></a>

### 查询与清理旧记录：`audit`

排查时按用户、操作和时间查询；保留期限到达后批量删除历史记录。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `audit.list` | 筛选并分页查询事件 | options | `PaginatedResult<AuditLogWithUser>` | `await audit.list({ page: 1, pageSize: 20 })` |
| `audit.getUserRecent` | 查询用户近期活动 | userId, limit | `AuditLog[]` | `await audit.getUserRecent(userId, 20)` |
| `audit.getStats` | 统计指定天数内的操作 | days, filters | `AuditStatItem[]` | `await audit.getStats(7)` |
| `audit.cleanup` | 按保留策略删除旧记录 | olderThanDays | `number` | `await audit.cleanup(90)` |

#### 场景：查询与清理旧记录

```ts
const page = value(await audit.list({ action: 'login', page: 1, pageSize: 20 })) // items, total, pagination
const recent = value(await audit.getUserRecent('demo-user', 20)) // up to 20 AuditLog records
const stats = value(await audit.getStats(7)) // action statistics for the last seven days
const removed = value(await audit.cleanup(90)) // count of records older than 90 days
```

输出取决于真实历史记录；空页、空统计与删除零条都可成功。cleanup 会真正删除过期记录，示例只在测试数据库执行。

<a id="backups"></a>

### 归档与核对备份：`audit.backup`

把历史记录归档到私有对象存储，核对完整性后才按保留策略处理原记录。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `audit.backup.run` | 创建或核对私有归档 | options | `AuditBackupInfo` | `await audit.backup.run()` |
| `audit.backup.verify` | 检查归档格式与校验和 | key, options | `AuditBackupInfo` | `await audit.backup.verify(archiveKey)` |

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
const plan = audit.schedulerPlan
if (plan) {
  const initialized = await scheduler.init({
    ...schedulerSettings,
    ...plan
  })
  if (!initialized.success)
    throw new Error(initialized.error.message)
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
const archive = value(await audit.backup.run({
  id: 'demo-login-archive',
  from: new Date('2026-01-01T00:00:00Z'),
  to: new Date('2026-01-02T00:00:00Z'),
}))
const verifiedArchive = value(await audit.backup.verify(archive.key))
// verifiedArchive identifies the same private archive; its contents passed verification.
```

<a id="alerts"></a>

### 检查异常并通知：`audit.checkAlerts`

主动检查当前达到阈值的规则；周期调度由 Scheduler 管理。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `audit.checkAlerts` | 检查阈值并尝试通知 | options | `AuditAlertReport` | `await audit.checkAlerts()` |

#### 场景：检查异常并通知

```ts
const report = value(await audit.checkAlerts()) // AuditAlertReport for this check
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
