# hai-audit 参考

统一审计日志模块，基于 `@h-ai/reldb` 实现持久化，提供审计日志的记录、分页查询、清理与统计。

SQLite、PostgreSQL、MySQL 均返回 `createdAt: Date`、`details: string | null`（JSON 字符串），缺失可空字段为 `null`。日期筛选与写入保持同一驱动转换；`getStats()` 数量为安全整数，超出范围返回 `STATS_FAILED`，不要把底层驱动 JSON 对象或时间戳当成公开审计结果。


`audit.init()` 会等待自动建表和仓库就绪才返回成功；DDL 失败保持 `isInitialized=false`，修正数据库后可重试。自定义 JOIN、统计和清理也使用同一就绪屏障；初始化期间关闭会使迟到结果失效。先检查 init 的 HaiResult，再立即记录或查询；audit 不拥有共享 RelDB 的连接，关闭 audit 后再关闭数据库。

## 运行环境

> ⚠️ **服务端模块（Node.js only）。** 审计日志由服务端自动记录，浏览器端通过 API 端点查询审计数据。

## 依赖

| 模块 | 用途 | 是否必需 | 初始化要求 |
| --- | --- | --- | --- |
| `@h-ai/reldb` | 数据库（审计日志持久化） | **必需** | 需在 `audit.init()` 前初始化 |
| `@h-ai/storage` | 私有备份 | 可选 | 启用备份时先初始化并注入 |
| `@h-ai/reach` | 异常告警 | 可选 | 启用告警时先初始化并注入 |
| `@h-ai/scheduler` | 自动备份/告警 | 可选 | 宿主显式装配 schedulerPlan，先于 Audit 关闭 |

## 使用步骤

### 1. 配置

审计模块依赖已初始化的 `@h-ai/reldb` 单例，无需独立配置文件。审计日志固定存储在 `hai_audit_logs` 表中。

### 2. 初始化

```ts
import { audit } from '@h-ai/audit'
import { reldb } from '@h-ai/reldb'

// 先初始化依赖
await reldb.init({ type: 'sqlite', database: './data.db' })

// 再初始化审计模块（自动使用已初始化的 reldb 单例）
const result = await audit.init()
if (!result.success) {
  // 处理错误
}
```

自定义用户表映射：

```ts
await audit.init({
  userTable: 'hai_iam_users',
  userIdColumn: 'id',
  userNameColumn: 'username',
})
```

### 3. 关闭

```ts
const closeResult = await audit.close()
if (!closeResult.success) {
  throw new Error(closeResult.error.message)
}
```

### 事件身份与保留保护

`category/outcome/severity` 分别表示系统或业务类别、成功或失败/拒绝、异常等级。`requestId/traceId/scopeId` 用于关联，`actorSnapshot` 保留事件时 id/username/displayName/roles，不能当授权依据。`audit.withContext(context,operation)` 保持异步隔离，可信入口应传入已验证的身份及客户端地址。只传 userId 时尝试捕获映射用户名，失败输出诊断并保留明确缺少名称的身份。旧记录不会补造身份快照；其用户名 JOIN 只用于兼容展示。

`capture:{enabled:true,includeReads:false}` 控制框架自动事件：IAM 关键变更及鉴别失败、Serv/Kit 写请求与失败/拒绝。可信入口自动绑定身份、地址和请求关联；业务语义仍须显式 audit.log。成功读取可选，关闭 capture 不影响显式 log。先初始化 audit 再初始化 IAM，关闭反序。任务/CLI 应通过 withContext 提供可信操作身份。

`audit.log(input,tx)`、`audit.capture(input,{tx})` 可使用调用者现有 RelDB 事务，事件和变更一并提交或回滚；失败尝试须在回滚后由入口记录。自动记录失败输出诊断并保留已生效业务结果；强制审计的业务检查同事务显式 log 的 HaiResult 后再提交。list 支持 requestId/traceId 关联筛选。

`retention:{enabled:true,minDays:90}` 启用共享最低保留，cleanup(0) 不能绕过。触发器拒绝保护期内改删及冲突覆盖；未传 retention 的重初始化沿用已有策略，只有显式可信配置能关闭。默认清理90天不等于不可变保护，首次未配置时不强制启用。DB 所有者 DDL、权限与独立归档需部署侧控制。升级前停旧写入并备份，`migrateAudit({dryRun:true})` 只读预检，init 自动升级；close 会等待已开始的写入。

`backup.enabled` 默认关闭；开启后注入已初始化的私有 StorageFunctions。backup.run({id?,from?,to?,signal?}) 流式条件创建 JSONL，返回记录数/SHA-256/截止时间；稳定 ID 只复用完整且条件相同的归档，不覆盖。backup.verify(key) 有界核对；batchSize/maxRecordBytes 控制内存，超限不截断证据。AUDIT_BACKUP_PREFIX 固定为 hai-private/audit-backups/，公开读取入口只允许指定资源，关闭备份不解除私有边界；已配置公开 publicUrl 的 S3 不能启用备份。

backup.schedule 配置开关、五字段 cron、IANA timezone；audit.schedulerPlan 返回供宿主显式合并到 scheduler.init 的 tasks/hooks，没有自动任务时为 null。回调复用共享 occurrenceId/取消信号，失败抛错让 Scheduler 正确失败。关闭 Scheduler 后再关闭 IAM/Audit/Storage/RelDB，audit 只取消/排空自己的备份。配置计划不隐式启动模块，也不劫持已有全局 hooks。

归档 v1 为 header、entry.record、footer；日期 ISO、保留历史 nullable 身份，SHA-256 覆盖 footer 前全部 UTF-8 行和换行。它是固定截止/主键游标的在线归档，严格同一时点恢复需停写/停清理或数据库快照。核对后离线读取或恢复至独立查询存储，不覆盖受保护在线记录；checksum 不等于来源真实性。

## 分级告警

审计 createdAt、归档截止与窗口以数据库时钟为准；Scheduler 计划中的任务依赖稳定归档 ID/共享通知领取声明幂等，失败不能误锁后续检查。

alerts 默认关闭，启用须注入已初始化 Reach，并配置规则 id/actions/resource/outcomes/minimumSeverity/threshold/windowSeconds/severity 与 targets(id/provider/to)。audit.checkAlerts({signal?}) 仅统计已提交事件的当前和前一固定窗口；默认300秒，60–86400秒，不补发更旧停机历史。共享 DB 先领取每个规则/目标/窗口的一次通知尝试，最终 SQL 校验存储端时钟。maxNotificationsPerCheck 默认100，more 提示后续继续。通知只含编号/等级/计数/窗口，submitted 不等于人员收到，queued 仅为 Reach 持久入队；核验 queueId。失败/崩溃保留 unknown/sending/claimed，禁止自动重发未知外部效果；结合 audit.alert 事件和 hai_audit_alert_claims 对照通知端处理。规则/目标语义改变可产生新通知。

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

### 便捷记录器 (`audit.helper`)

| 方法                                                                           | 说明         |
| ------------------------------------------------------------------------------ | ------------ |
| `audit.helper.login(userId, ip?, ua?)`                                         | 登录         |
| `audit.helper.logout(userId, ip?, ua?)`                                        | 登出         |
| `audit.helper.register(userId, ip?, ua?)`                                      | 注册         |
| `audit.helper.passwordResetRequest(email, ip?, ua?)`                           | 密码重置请求 |
| `audit.helper.passwordResetComplete(userId, ip?, ua?)`                         | 密码重置完成 |
| `audit.helper.crud(input)` | CRUD 操作    |

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

## 常见模式

### 用户认证审计

```ts
// 登录
await audit.helper.login(userId, request.ip, request.headers['user-agent'])

// 登出
await audit.helper.logout(userId, request.ip, request.headers['user-agent'])
```

### CRUD 操作审计

```ts
await audit.helper.crud({ userId, action: 'create', resource: 'users', resourceId: newUser.id, details: { name: newUser.name } })
await audit.helper.crud({ userId, action: 'update', resource: 'roles', resourceId: roleId, details: { changes } })
await audit.helper.crud({ userId, action: 'delete', resource: 'permissions', resourceId: permId })
```

### 仪表盘数据

```ts
// 最近日志
const recentLogs = await audit.list({ pageSize: 10 })

// 7 天统计
const stats = await audit.getStats(7)
```

### 定期清理

```ts
// 清理 90 天前的日志
const result = await audit.cleanup(90)
if (result.success) {
  logger.info(`Cleaned up ${result.data} old audit logs`)
}
```

## 相关 Skills

- `hai-reldb` — 数据库模块（审计模块依赖）
- `hai-iam` — 身份认证与权限管理（审计的主要记录对象）
- `hai-core` — 核心工具（日志、ID 生成、i18n）
