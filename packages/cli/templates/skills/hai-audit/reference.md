# hai-audit 参考

统一审计日志模块，基于 `@h-ai/reldb` 实现持久化，提供审计日志的记录、分页查询、清理与统计。

SQLite 的 `INTEGER` 与 PostgreSQL/MySQL 的 `BIGINT` 时间列均使用 Unix 毫秒，API 返回 `createdAt: Date`、`details: string | null`（JSON 字符串），缺失的可空字段为 `null`。日期筛选使用毫秒。清理和相对统计使用数据库执行时钟，每天按 24 小时计算。基本字符串筛选精确匹配，包括大小写、重音和末尾空格。`getStats()` 在数量超出安全整数范围时返回 `STATS_FAILED`。


`audit.init()` 等待当前表结构、索引和配置对应的触发器就绪。`audit.close()` 等待已开始的工作，取消的初始化不会发布仓库。关闭成功后再关闭共享 RelDB。

## 运行环境

> ⚠️ **服务端模块（Node.js only）。** 审计日志由服务端自动记录，浏览器端通过 API 端点查询审计数据。

## 依赖

| 依赖 | 用途 | 何时需要 | 接入顺序 |
| --- | --- | --- | --- |
| Node.js | 运行审计服务。 | 所有 Audit 功能。 | 在服务端启动 Audit。 |
| `@h-ai/reldb` | 保存和查询事件，保存告警状态。 | 必需。 | 先启动 RelDB，再启动 Audit。关闭按相反顺序。 |
| `@h-ai/core`、`zod` | 提供配置、日志和上下文，校验配置和输入。 | 随 Audit 安装。 | 应用集中读取配置或设置日志时先配置 Core。 |
| `@h-ai/storage` | 保存私有备份。 | 启用备份时安装。 | 先初始化私有 Storage，再传给 `audit.init({ ...config, storage })`。 |
| `@h-ai/reach` | 发送异常告警。 | 启用告警时安装。 | 先初始化 Reach 并配置渠道，再传给 `audit.init({ ...config, reach })`。 |
| `@h-ai/scheduler` | 定期执行备份和告警检查。 | 配置自动备份或自动告警检查时安装。 | Audit 就绪后装配 `audit.schedulerPlan` 的任务和钩子。关闭时先停 Scheduler。 |

## 使用步骤

### 1. 配置

审计模块依赖已初始化的 `@h-ai/reldb` 单例，审计日志固定写入 `hai_audit_logs`。生成的项目在 `config/_audit.yml` 设置 Audit，启动时将配置对象传给 `audit.init()`。留存按本次配置生效，省略时保护关闭，启用后的默认期限为 90 天。

### 2. 初始化

```ts
import { audit } from '@h-ai/audit'
import { reldb } from '@h-ai/reldb'

// 以 ./data.db 打开 SQLite 连接。成功后可准备审计表，失败时应停止启动并读取 error。
const dbReady = await reldb.init({ type: 'sqlite', database: './data.db' })
if (!dbReady.success)
  throw new Error(dbReady.error.message, { cause: dbReady.error })

// 再初始化审计模块（自动使用已初始化的 reldb 单例）
// 借用已连接的 RelDB 和默认配置准备审计表。成功无 data，失败读取 error。
const result = await audit.init()
if (!result.success)
  throw new Error(result.error.message, { cause: result.error })
```

自定义用户表映射：

```ts
// 使用下方 IAM 表、ID 列和用户名列配置审计。表准备成功时无 data，配置或建表失败读取 error。
const configured = await audit.init({
  userTable: 'hai_iam_users',
  userIdColumn: 'id',
  userNameColumn: 'username',
})
if (!configured.success)
  throw new Error(configured.error.message, { cause: configured.error })
```

### 3. 关闭

```ts
// 无参数停止审计并释放自有资源。成功 data 为 undefined，失败由下方抛出。
const closeResult = await audit.close()
if (!closeResult.success) {
  throw new Error(closeResult.error.message)
}
```

### 事件身份与保留保护

`category`、`outcome`、`severity` 表示事件类别、结果和等级。`requestId`、`traceId`、`scopeId` 用于关联。`actorSnapshot` 保留事件时的身份。`audit.withContext(context, operation)` 由可信入口提供已验证的身份及客户端地址。只传 `userId` 时尝试查找用户名。可选查询失败会记录诊断并仅保存 ID，PostgreSQL 在调用者事务内隔离该查询错误。历史名称不符合约束时可以只返回 ID 并记录诊断，保留数据库原行。MySQL 的字段容量覆盖事件输入，例如 `action` 和 `resource` 最多 256，User-Agent 最多 4096。

`capture:{enabled:true,includeReads:false}` 控制框架自动事件：IAM 关键变更及鉴别失败、Serv/Kit 写请求与失败/拒绝。可信入口自动绑定身份、地址和请求关联；业务语义仍须显式 audit.log。成功读取可选，关闭 capture 不影响显式 log。先初始化 audit 再初始化 IAM，关闭反序。任务/CLI 应通过 withContext 提供可信操作身份。

`audit.log(input,tx)`、`audit.capture(input,{tx})` 可使用调用者现有 RelDB 事务，事件和变更一并提交或回滚；失败尝试须在回滚后由入口记录。自动记录失败输出诊断并保留已生效业务结果；强制审计的业务检查同事务显式 log 的 HaiResult 后再提交。list 支持 requestId/traceId 关联筛选。

`retention: { enabled: true, minDays: 90 }` 启用共享最低保留。触发器拒绝保护期内更新、删除及冲突覆盖。将配置改为 `retention: { enabled: true, minDays: 120 }` 并重启后，`audit.cleanup(0)` 和触发器都遵守 120 天的下限。省略 `retention` 或设为 `enabled: false` 会在重新初始化后关闭保护。同库实例使用相同配置，并统一重启。数据库所有者的 DDL、权限与独立归档由部署方管理。

`backup.enabled` 默认关闭；开启后注入已初始化的私有 StorageFunctions。`backup.run({ id?, from?, to?, signal? })` 在调用时复制 `from` 和 `to`，之后的修改不会改变本次扫描和同 ID 输入比对。流式条件创建 JSONL，返回记录数、SHA-256 和截止时间，稳定 ID 只复用完整且条件相同的归档。`backup.verify(key)` 有界核对，`batchSize` 和 `maxRecordBytes` 控制内存。`AUDIT_BACKUP_PREFIX` 是 `hai-private/audit-backups/`，由宿主限制对象的读取权限。已配置公开 `publicUrl` 的 S3 不能启用备份。

backup.schedule 配置开关、五字段 cron、IANA timezone；audit.schedulerPlan 返回供宿主显式合并到 scheduler.init 的 tasks/hooks，没有自动任务时为 null。回调复用共享 occurrenceId/取消信号，失败抛错让 Scheduler 正确失败。关闭 Scheduler 后再关闭 IAM/Audit/Storage/RelDB，audit 只取消/排空自己的备份。配置计划不隐式启动模块，也不劫持已有全局 hooks。

归档 v1 为 header、entry.record、footer；日期 ISO、保留历史 nullable 身份，SHA-256 覆盖 footer 前全部 UTF-8 行和换行。它是固定截止/主键游标的在线归档，严格同一时点恢复需停写/停清理或数据库快照。核对后离线读取或恢复至独立查询存储，不覆盖受保护在线记录；checksum 不等于来源真实性。

## 分级告警

审计 createdAt、归档截止与窗口以数据库时钟为准；Scheduler 计划中的任务依赖稳定归档 ID/共享通知领取声明幂等，失败不能误锁后续检查。

`alerts` 默认关闭。启用时注入已初始化的 Reach，并配置规则 `id`、`actions`、`resource`、`outcomes`、`minimumSeverity`、`threshold`、`windowSeconds`、`severity` 及 `targets`（`id`、`provider`、`to`）。`audit.checkAlerts({ signal? })` 统计当前和前一固定窗口内已提交的事件。窗口默认 300 秒，范围 60–86400 秒。`maxNotificationsPerCheck` 默认 100，`more` 提示后续继续。规则或通知目标发生语义变化时可产生新的通知。

发送前先锁定领取，再用数据库执行时钟校验期限。`sending` 持久化后检查是否已取消，确认后才调用 Reach。`submitted` 表示通道受理，`queued` 表示 Reach 持久入队，由 `queueId` 关联后续记录。告警检查只清理窗口开始时间超过 72 小时的 `submitted` 和 `queued`，此期限对所有窗口配置一致。`unknown`、`sending`、`claimed` 保留供核验，先将 `audit.alert` 和 `hai_audit_alert_claims` 与通知端记录对照，再决定如何处理外部效果。

alerts.schedule 控制定时开关/cron/timezone；audit.schedulerPlan 统一备份和告警计划，没有自动任务时才为 null。宿主显式装配 Scheduler，失败或 report.failed>0 必须失败；先关闭 Scheduler，再关闭 Audit/Reach，Audit 排空自有操作但不关闭 Reach。业务返回 HaiResult 失败须检查；成功检查报告仍须查看 failed。规则无需引入通用策略引擎。

## 核心 API

### 生命周期

| 方法                  | 签名                                                             | 说明       |
| --------------------- | ---------------------------------------------------------------- | ---------- |
| `audit.init`          | `(config?: AuditInitConfigInput) => Promise<HaiResult<void>>` | 初始化模块 |
| `audit.close`         | `() => Promise<HaiResult<void>>`                                 | 关闭模块   |
| `audit.isInitialized` | `boolean`                                                        | 初始化状态 |

### 日志操作

| 方法                  | 签名                                                                                | 说明                 |
| --------------------- | ----------------------------------------------------------------------------------- | -------------------- |
| `audit.log`           | `(input: CreateAuditLogInput, tx?: DmlWithTxOperations) => Promise<HaiResult<AuditLog>>`             | 记录审计日志         |
| `audit.capture` | `(input: CreateAuditLogInput, options?: { read?: boolean; tx?: DmlWithTxOperations }) => Promise<HaiResult<void>>` | 自动采集 |
| `audit.backup.run` | `(options?: AuditBackupOptions) => Promise<HaiResult<AuditBackupInfo>>` | 私有归档/稳定ID复用 |
| `audit.backup.verify` | `(key: string, options?: { signal?: AbortSignal }) => Promise<HaiResult<AuditBackupInfo>>` | 有界核对 |
| `audit.schedulerPlan` | `Required<Pick<SchedulerInitInput, 'tasks' \| 'hooks'>>` 或 null | 宿主显式装配的计划 |
| `audit.checkAlerts` | `(options?: { signal?: AbortSignal }) => Promise<HaiResult<AuditAlertReport>>` | 固定窗口阈值告警；检查 failed/more |
| `audit.list`          | `(options?: ListAuditLogsOptions) => Promise<HaiResult<PaginatedResult<AuditLogWithUser>>>` | 分页查询（items/total/page/pageSize，含用户名；使用返回的规范化元数据，默认 pageSize 20） |
| `audit.getUserRecent` | `(userId: string, limit?: number) => Promise<HaiResult<AuditLog[]>>`       | 用户最近活动         |
| `audit.cleanup`       | `(olderThanDays?: number) => Promise<HaiResult<number>>`                   | 清理旧日志           |
| `audit.getStats`      | `(days?: number, filters?: Pick<ListAuditLogsOptions, 'category' \| 'outcome' \| 'severity' \| 'scopeId' \| 'userId' \| 'resource'>) => Promise<HaiResult<AuditStatItem[]>>` | 操作统计 |
| `audit.countByOutcome` | `(options?: ListAuditLogsOptions) => Promise<HaiResult<AuditOutcomeCounts>>` | 用与列表相同的筛选统计成功、失败和拒绝 |

### 便捷记录器 (`audit.helper`)

| 方法                                                                           | 说明         |
| ------------------------------------------------------------------------------ | ------------ |
| `audit.helper.login(userId, ip?, ua?)`                                         | 登录         |
| `audit.helper.logout(userId, ip?, ua?)`                                        | 登出         |
| `audit.helper.register(userId, ip?, ua?)`                                      | 注册         |
| `audit.helper.passwordResetRequest(email, ip?, ua?)`                           | 密码重置请求 |
| `audit.helper.passwordResetComplete(userId, ip?, ua?)`                         | 密码重置完成 |
| `audit.helper.crud(input)` | CRUD 操作    |

`audit.helper.crud()` 将动作名限定为 `create`、`read`、`update`、`delete`，并把 `ip`、`ua` 映射到事件的 `ipAddress`、`userAgent`。业务代码提供资源 ID 和变化详情。需要审计事件 ID、业务事务或自定义动作名时用 `audit.log()`。

> `audit.log()` / `audit.helper.*()` 中的 `details` 始终隐藏凭据（如 `password` / `token` / `secret`）；默认也隐藏邮箱、手机号等业务隐私，privacy.enabled 可关闭业务隐私，privacy.fields 可追加字段名，自由文本需指定整个字段隐藏。

## 错误码

| 错误码                            | code             | 说明         |
| --------------------------------- | ---------------- | ------------ |
| `HaiAuditError.LOG_FAILED`       | `hai:audit:001`  | 记录失败     |
| `HaiAuditError.QUERY_FAILED`     | `hai:audit:002`  | 查询失败     |
| `HaiAuditError.CLEANUP_FAILED`   | `hai:audit:003`  | 清理失败     |
| `HaiAuditError.STATS_FAILED`     | `hai:audit:004`  | 统计失败     |
| `HaiAuditError.INIT_IN_PROGRESS` | `hai:audit:005`  | 初始化进行中 |
| `HaiAuditError.NOT_INITIALIZED`  | `hai:audit:010`  | 模块未初始化 |
| `HaiAuditError.CONFIG_ERROR`     | `hai:audit:012`  | 配置错误     |
| `HaiAuditError.ALERTS_DISABLED` | `hai:audit:024` | 告警未启用 |
| `HaiAuditError.ALERTS_FAILED` | `hai:audit:025` | 告警检查或通知失败 |

JavaScript 调用方传入无效日数或选项时检查对应的 `HaiResult` 错误，例如字符串日数会使清理返回 `CLEANUP_FAILED`、统计返回 `STATS_FAILED`，无效列表筛选返回 `QUERY_FAILED`。

## 常见模式

### 用户认证审计

```ts
// 登录
// 用已认证用户 ID、连接 IP 和请求的 User-Agent 记录登录。成功无 data，写入失败读取 error。
await audit.helper.login(userId, request.ip, request.headers['user-agent'])

// 登出
// 用当前会话用户 ID、IP 和 User-Agent 记录退出。成功无 data，写入失败读取 error。
await audit.helper.logout(userId, request.ip, request.headers['user-agent'])
```

### CRUD 操作审计

```ts
// 用发起者、创建成功的用户 ID 和名称记录 users 创建事件。成功无 data，失败读取 error。
await audit.helper.crud({ userId, action: 'create', resource: 'users', resourceId: newUser.id, details: { name: newUser.name } })
// 用发起者、目标 roleId 和业务变更记录角色修改。成功无 data，失败读取 error。
await audit.helper.crud({ userId, action: 'update', resource: 'roles', resourceId: roleId, details: { changes } })
// 用发起者及目标权限 ID 记录删除。成功无 data，失败读取 error。
await audit.helper.crud({ userId, action: 'delete', resource: 'permissions', resourceId: permId })
```

### 仪表盘数据

```ts
// 最近日志
// 取默认第一页的最多 10 条审计记录。成功 data 包含 items 和分页信息，失败读取 error。
const recentLogs = await audit.list({ pageSize: 10 })

// 7 天统计
// 统计最近 7 天各类操作数量。成功 data 为分组数组，失败读取 error。
const stats = await audit.getStats(7)
```

### 定期清理

```ts
// 清理 90 天前的日志
// 删除早于 90 天的记录，成功 data 为删除条数，失败读取 error。
const result = await audit.cleanup(90)
if (result.success) {
  // 把本次清理条数写入 info 日志，无业务返回值。
  logger.info(`Cleaned up ${result.data} old audit logs`)
}
```

## 相关 Skills

- `hai-reldb` — 数据库模块（审计模块依赖）
- `hai-iam` — 身份认证与权限管理（审计的主要记录对象）
- `hai-core` — 核心工具（日志、ID 生成、i18n）
