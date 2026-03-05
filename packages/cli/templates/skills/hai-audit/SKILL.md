---
name: hai-audit
description: 使用 @h-ai/audit 进行审计日志的记录、查询、清理与统计。当需求涉及操作审计、安全事件追踪、用户活动日志时使用。
---

# @h-ai/audit — 审计日志模块

统一审计日志模块，基于 `@h-ai/reldb` 实现持久化，提供审计日志的记录、分页查询、清理与统计。

## 使用步骤

### 1. 配置

审计模块依赖已初始化的 `@h-ai/reldb` 实例，无需独立配置文件。

### 2. 初始化

```ts
import { audit } from '@h-ai/audit'
import { reldb } from '@h-ai/reldb'

await reldb.init({ type: 'sqlite', database: './data.db' })
const result = await audit.init({ reldb })
if (!result.success) {
  // 处理错误
}
```

### 3. 关闭

```ts
await audit.close()
```

## 核心 API

### 生命周期

| 方法                  | 签名                                                             | 说明       |
| --------------------- | ---------------------------------------------------------------- | ---------- |
| `audit.init`          | `(config: AuditInitConfig) => Promise<Result<void, AuditError>>` | 初始化模块 |
| `audit.close`         | `() => Promise<void>`                                            | 关闭模块   |
| `audit.isInitialized` | `boolean`                                                        | 初始化状态 |

### 日志操作

| 方法                  | 签名                                                                                | 说明                 |
| --------------------- | ----------------------------------------------------------------------------------- | -------------------- |
| `audit.log`           | `(input: CreateAuditLogInput) => Promise<Result<AuditLog, AuditError>>`             | 记录审计日志         |
| `audit.list`          | `(options?: ListAuditLogsOptions) => Promise<Result<{ items, total }, AuditError>>` | 分页查询（含用户名） |
| `audit.getUserRecent` | `(userId: string, limit?: number) => Promise<Result<AuditLog[], AuditError>>`       | 用户最近活动         |
| `audit.cleanup`       | `(olderThanDays?: number) => Promise<Result<number, AuditError>>`                   | 清理旧日志           |
| `audit.getStats`      | `(days?: number) => Promise<Result<AuditStatItem[], AuditError>>`                   | 操作统计             |

### 便捷记录器 (`audit.helper`)

| 方法                                                                           | 说明         |
| ------------------------------------------------------------------------------ | ------------ |
| `audit.helper.login(userId, ip?, ua?)`                                         | 登录         |
| `audit.helper.logout(userId, ip?, ua?)`                                        | 登出         |
| `audit.helper.register(userId, ip?, ua?)`                                      | 注册         |
| `audit.helper.passwordResetRequest(email, ip?, ua?)`                           | 密码重置请求 |
| `audit.helper.passwordResetComplete(userId, ip?, ua?)`                         | 密码重置完成 |
| `audit.helper.crud(userId, action, resource, resourceId?, details?, ip?, ua?)` | CRUD 操作    |

## 错误码

| 错误码                           | 数值  | 含义         |
| -------------------------------- | ----- | ------------ |
| `AuditErrorCode.LOG_FAILED`      | 10000 | 记录失败     |
| `AuditErrorCode.QUERY_FAILED`    | 10001 | 查询失败     |
| `AuditErrorCode.CLEANUP_FAILED`  | 10002 | 清理失败     |
| `AuditErrorCode.STATS_FAILED`    | 10003 | 统计失败     |
| `AuditErrorCode.NOT_INITIALIZED` | 10010 | 模块未初始化 |
| `AuditErrorCode.CONFIG_ERROR`    | 10012 | 配置错误     |

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
await audit.helper.crud(userId, 'create', 'users', newUser.id, { name: newUser.name })
await audit.helper.crud(userId, 'update', 'roles', roleId, { changes })
await audit.helper.crud(userId, 'delete', 'permissions', permId)
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
