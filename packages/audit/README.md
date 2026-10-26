# @h-ai/audit

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/core](../core/README.md) · [@h-ai/reldb](../reldb/README.md)

## 简介

统一审计日志模块，通过 `audit` 对象提供审计日志的记录、查询、清理与统计功能，基于 `@h-ai/reldb` 实现持久化。

SQLite、PostgreSQL、MySQL 的读取结果保持同一契约：`createdAt` 为 `Date`，`details` 为 JSON 字符串或 `null`，缺失的可空字段返回 `null`。日期筛选与写入使用相同的驱动日期转换；统计数量为安全整数，超出范围返回 `STATS_FAILED`。

## 核心功能清单

- 记录用户操作与安全事件，支持按用户、时间和操作筛选。
- 查询分页日志与操作统计，并按保留天数清理。
- 使用关系数据库持久化，写入前隐藏凭证类字段。

## 使用入门

### 依赖

- `@h-ai/reldb` — 数据库（审计日志持久化），**需在 audit.init() 前初始化**

### 适用场景

- 用户操作审计（登录、登出、注册、密码重置等）
- CRUD 操作审计（创建、读取、更新、删除资源）
- 安全事件追踪与合规审计
- 运营数据统计（操作频次、活跃用户等）

### 快速开始

```ts
import { audit } from '@h-ai/audit'
import { reldb } from '@h-ai/reldb'

// 1. 初始化依赖
await reldb.init({ type: 'sqlite', database: './data.db' })

// 2. 初始化审计模块（自动使用已初始化的 reldb 单例）
const result = await audit.init()
if (!result.success) {
  throw new Error(result.error.message)
}

// 3. 记录审计日志
await audit.log({
  userId: 'user_1',
  action: 'login',
  resource: 'auth',
  ipAddress: '127.0.0.1',
})

// 4. 使用便捷方法
await audit.helper.login('user_1', '127.0.0.1')
await audit.helper.crud({ userId: 'user_1', action: 'create', resource: 'users', resourceId: 'user_2', details: { name: '张三' } })

// 5. 查询日志
const logs = await audit.list({ pageSize: 20, action: 'login' })

// 6. 获取统计
const stats = await audit.getStats(7) // 最近 7 天

// 7. 清理旧日志
await audit.cleanup(90) // 清理 90 天前的日志

// 8. 关闭
const closeResult = await audit.close()
if (!closeResult.success) {
  throw new Error(closeResult.error.message)
}
```

### 初始化配置

```ts
// 默认配置（无需传参）
await audit.init()

// 自定义用户表映射
await audit.init({
  userTable: 'hai_iam_users', // 用户表名（默认 'hai_iam_users'）
  userIdColumn: 'id', // 用户表主键列名（默认 'id'）
  userNameColumn: 'username', // 用户表用户名列名（默认 'username'）
})
```

审计日志固定存储在 `hai_audit_logs` 表中，依赖 `@h-ai/reldb` 已初始化。

### API 概览

- `audit.init(config)` - 初始化审计模块
- `audit.log(input)` - 记录审计日志
- `audit.list(options)` - 返回统一 `PaginatedResult<AuditLogWithUser>`（items/total/page/pageSize，含用户名 JOIN）；页码/条数复用 core 分页规范化，默认 pageSize 为 20，调用方直接使用返回元数据。
- `audit.getUserRecent(userId, limit)` - 获取用户最近活动
- `audit.cleanup(days)` - 清理旧日志
- `audit.getStats(days, filters)` - 获取按分类等条件筛选的操作统计
- `audit.helper.login/logout/register/...` - 便捷记录器
- `audit.close()` - 关闭模块

常见事件通过 `audit.helper` 记录，对应的 `AuditHelper` 类型保持公开；便捷记录器的内部装配工厂不属于包 API。

#### 输入约束

- `audit.log(input)`：`action` / `resource` 必须为非空字符串，且长度不超过 256。
- `audit.log(input)`：`details` 中的凭证类敏感字段（如 `password` / `token` / `secret`）会在持久化前自动脱敏；业务隐私字段（如邮箱、手机号）默认同时隐藏，可通过 privacy 配置调整。
- `audit.list(options)`：若同时传 `startDate` 与 `endDate`，必须满足 `startDate <= endDate`。
- `audit.getUserRecent(userId, limit)`：`userId` 必须为非空字符串；`limit`（如传入）必须为正整数。
- `audit.cleanup(days)`：`days`（如传入）必须为非负整数。
- `audit.getStats(days)`：`days`（如传入）必须为非负整数。

### 错误码

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

`audit.init()` 会等待自动建表和仓库就绪才返回成功；DDL 失败保持 `isInitialized=false`，修正数据库后可重试。自定义 JOIN、统计和清理也使用同一就绪屏障；初始化期间关闭会使迟到结果失效。先检查 init 的 HaiResult，再立即记录或查询；audit 不拥有共享 RelDB 的连接，关闭 audit 后再关闭数据库。

## 事件上下文、隐私与保留

审计 createdAt、告警窗口与归档截止共用数据库时钟，不以各节点系统钟作为共享真值。备份与告警调度任务使用已验证的持久去重保障声明幂等；失败不会被错误地当作非幂等未知任务而阻塞后续调度。

`capture: { enabled: true, includeReads: false }` 控制框架自动采集。IAM 记录关键账号、鉴别、密码、授权、API Key 和会话事件；Serv/Kit 绑定已验证身份与可信地址，记录写请求及失败/拒绝，成功读取默认跳过。协议/输入校验前尚未确认身份时保留匿名事件。HTTP 入口只记录操作、方法、状态或原因码，不复制请求体、令牌和错误详情。业务含义仍由应用在完成/失败边界调用 `audit.log()` 记录；关闭自动采集不影响显式 log。审计应先于 IAM 初始化，并在 IAM 关闭后关闭。可信任务/CLI 应显式提供操作身份和关联上下文。

`audit.log(input, tx)` 与 `audit.capture(input, { tx })` 可使用调用者现有 RelDB 事务；事件与变更一并提交或回滚，不独立提交，也不留下回滚成功的假记录。事务回滚会移除其中的事件，调用入口应在回滚完成后记录失败/拒绝。自动采集写入失败会输出关联诊断，已生效的业务不会被改写成可盲目重试的失败；需要强制审计的业务应在同一事务检查显式 log 的 HaiResult 后再提交。

新记录包含 `category`（system/business）、`outcome`（success/failure/denied）、`severity`（info/warning/error/critical）、请求/链路/范围标识和 `actorSnapshot`。身份快照在事件发生时复制，改名、改角色或删除账号不会改写它。只传 userId 时按配置映射尝试捕获用户名；映射不可读时记录明确缺少名称的身份并输出诊断。可信 HTTP 宿主应通过 `audit.withContext({ actor, requestId, ipAddress, userAgent }, operation)` 提供完整上下文，不能用未验证的请求体充当操作者。该工具保留 operation 的同步/异步结果及异常，业务写入仍返回 HaiResult。

`audit.list({ category, outcome, severity, scopeId, requestId, traceId, sortBy, sortDirection })` 支持分类筛选和受控排序，`getStats(7, { category: 'system' })` 统计指定类别的操作。`privacy.enabled` 默认开启，隐藏邮箱、电话等业务字段；`privacy.fields` 可补充项目字段名。凭据始终脱敏，关闭业务隐私不会泄漏 password/token。自由文本包含隐私时应配置整个对应字段隐藏。

`retention: { enabled: true, minDays: 90 }` 开启最低保留。共享数据库保存策略，清理使用实际最低期限，`cleanup(0)` 不能绕过；数据库触发器拒绝保护期内的 UPDATE、DELETE 和冲突覆盖写。框架首次未配置时不强制保护，清理参数默认90天本身不构成不可变保证。未传 retention 的重初始化沿用既有策略，只有可信启动配置显式关闭才解除。该保护针对正常行级写入；数据库所有者的 DDL/权限、独立归档和更强存储保护需由部署管理。

升级前先停旧写入并备份，`migrateAudit({ dryRun: true })` 只读预检；audit.init 自动执行可重入升级。历史未知分类、结果和身份快照保持 null，不补造历史身份。列表对无快照的历史记录保留旧的用户表关联展示，不能当作事件时身份。写入失败返回失败并输出关联诊断；close 等待已开始写入后再释放模块，随后才能关闭 RelDB。

脱敏匹配整个字段：对象、数组以及自定义 JSON 投影内的敏感值同样隐藏。关闭或尚未初始化 Audit 时，capture 返回未初始化失败；只有已初始化模块的关闭采集配置才跳过自动事件。

## 私有备份与定时归档

`backup.enabled` 默认关闭。开启时向 `audit.init({ storage, backup: { enabled: true } })` 注入已经初始化的 `StorageFunctions`；数据库仍先初始化。`backup.batchSize` 控制扫描批量（默认200），`maxRecordBytes` 限制单条 UTF-8 记录（默认1 MiB），超限返回失败并保留原始审计，不截断证据。

`audit.backup.run({ id?, from?, to?, signal? })` 输出私有 JSONL 文件并返回 ID、key、记录数、SHA-256、开始和截止时间。固定命名空间为 `AUDIT_BACKUP_PREFIX`（hai-private/audit-backups/）。同一执行使用稳定 ID；已有完整归档校验后复用，导出条件冲突、文件不完整或损坏均返回失败，不能覆盖。条件写竞争与写结果未知时核对实际文件。`audit.backup.verify(key, { signal? })` 有界流式核对格式、记录数和校验和；校验和用于完整性，不代表来源真实性。

归档 v1 按行保存 header、`{type:'entry',record}` 和 footer。记录保留原始 ID、ISO 日期、已存详情及可空历史身份；不关联当前用户名。footer 的 SHA-256 覆盖之前所有 UTF-8 行及换行，且 recordCount 等于 entry 数量。可核对后离线读取或恢复至独立查询存储；不覆盖在线受保护记录。在线导出按固定截止时间与主键游标扫描，包含范围以实际扫描为准；需要同一时点的全量恢复时先暂停写入和清理，或采用数据库原生一致性快照。

定时配置位于 `backup.schedule`：`enabled`、五字段 cron（默认 `0 2 * * *`）、IANA timezone（默认 UTC）。开启后 `audit.schedulerPlan` 返回可显式合并进 `scheduler.init()` 的 tasks/hooks 计划；没有自动任务时为 null。回调复用 Scheduler 的共享执行编号和取消信号，并在失败时抛错使任务准确失败；未知执行按 Scheduler 规则核对，不能盲目重跑。示例/fullstack 已装配此计划，其它宿主显式合并已有任务与回调。先关闭 Scheduler，再关闭 IAM、Audit、Storage 和 RelDB；Audit 取消并等待自己的备份，不关闭宿主 Storage。

```ts
const plan = audit.schedulerPlan
if (plan) {
  const initialized = await scheduler.init({ ...schedulerSettings, ...plan })
  if (!initialized.success)
    throw new Error(initialized.error.message)
  const started = scheduler.start()
  if (!started.success)
    throw new Error(started.error.message)
}
```

上例由宿主导入 `audit`、`scheduler` 并提供已校验的 schedulerSettings，Audit/Storage/RelDB 已初始化。归档使用私有存储，开启备份时拒绝配置了公开 publicUrl 的 S3；部署仍须限制桶/CDN访问。公开静态文件入口应仅开放指定资源；管理示例与 fullstack 仅公开规范头像路径，如提供归档下载，须通过审计授权接口处理，关闭备份也不改变已有文件的私有边界。

## 分级异常告警

`alerts.enabled` 默认关闭。开启时注入已初始化的 Reach：`audit.init({ reach, alerts: { enabled: true, rules: [...] } })`。规则通过稳定 id、actions（精确事件名）、可选 resource、outcomes、minimumSeverity 筛选事件，threshold/windowSeconds 指定固定窗口阈值，severity 指定通知等级，targets 中的 id/provider/to 指定人员或目标。默认窗口300秒，范围60–86400秒；默认仅失败/拒绝，空 outcomes 表示所有结果。规则和目标 id 必须各自唯一；provider 须已在 Reach 注册。不将具体业务角色写入框架。

`audit.checkAlerts({signal?})` 检查已提交事件的当前及前一个固定窗口，回滚事件不触发；停机超过两窗不补发历史通知。它不是滑动窗口或完整监控系统。默认单轮最多尝试100次，maxNotificationsPerCheck 可配置，report.more 表示仍有目标待后续检查。已达阈值的规则/目标/窗口在共享数据库原子领取，一次外部尝试前持久化；领取同时核验数据库执行时钟，避免节点偏差或挂起恢复重发。规则语义或通知目标变更形成新策略，可能产生新的通知。

通知只包含规则/目标编号、等级、计数与窗口，不复制审计详情或凭据。submitted 表示 Provider 接受，queued 仅表示 Reach 持久入队，可通过 queueId 查询；都不等于人员已收到或阅读。失败/中断/崩溃留下 unknown、sending 或 claimed 回执，不自动重发不确定外部效果。运维先检查 `audit.alert` 事件与 `hai_audit_alert_claims`，核验通知端后处理；Reach 已入队的消息遵循其自身恢复规则。领取表不保存地址/正文，查询范围外已确认提交/入队的领取定期清理；未决回执保留供运维核验，通知审计遵守审计保留策略。

`alerts.schedule` 可独立启用，默认每分钟、UTC。`audit.schedulerPlan` 合并已启用的备份和告警任务，由宿主显式交给 Scheduler；计划没有自动任务时为 null。调度回调在检查失败或 failed>0 时准确失败。先关闭 Scheduler，再关闭 Audit 和 Reach；关闭 Audit 取消后续领取并等待在途通知完成（受 Reach Provider 超时约束），不关闭宿主 Reach。数据库查询/审计失败返回失败；通知业务失败在成功检查报告的 failed 字段体现，调用方必须检查。

## 开发测试

```bash
pnpm --filter @h-ai/audit test
```

审计源码示例明确先初始化 RelDB、检查审计写入结果，再按依赖反序检查关闭结果；参见[模块 JSDoc 约定](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证)。

## 许可证

Apache-2.0
