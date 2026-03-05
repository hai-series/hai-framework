# @h-ai/audit

统一审计日志模块，通过 `audit` 对象提供审计日志的记录、查询、清理与统计功能，基于 `@h-ai/reldb` 实现持久化。

## 适用场景

- 用户操作审计（登录、登出、注册、密码重置等）
- CRUD 操作审计（创建、读取、更新、删除资源）
- 安全事件追踪与合规审计
- 运营数据统计（操作频次、活跃用户等）

## 快速开始

```ts
import { audit } from '@h-ai/audit'
import { reldb } from '@h-ai/reldb'

// 1. 初始化数据库
await reldb.init({ type: 'sqlite', database: './data.db' })

// 2. 初始化审计模块
const result = await audit.init({ db: reldb })
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
await audit.helper.crud('user_1', 'create', 'users', 'user_2', { name: '张三' })

// 5. 查询日志
const logs = await audit.list({ pageSize: 20, action: 'login' })

// 6. 获取统计
const stats = await audit.getStats(7) // 最近 7 天

// 7. 清理旧日志
await audit.cleanup(90) // 清理 90 天前的日志

// 8. 关闭
await audit.close()
```

## 初始化配置

```ts
await audit.init({
  db: reldb, // 已初始化的 @h-ai/reldb 实例（必须）
  tableName: 'audit_logs', // 审计日志表名（默认 'audit_logs'）
  userTable: 'users', // 用户表名（默认 'users'）
  userIdColumn: 'id', // 用户表主键列名（默认 'id'）
  userNameColumn: 'username', // 用户表用户名列名（默认 'username'）
})
```

## API 概览

- `audit.init(config)` - 初始化审计模块
- `audit.log(input)` - 记录审计日志
- `audit.list(options)` - 分页查询审计日志（含用户名 JOIN）
- `audit.getUserRecent(userId, limit)` - 获取用户最近活动
- `audit.cleanup(days)` - 清理旧日志
- `audit.getStats(days)` - 获取操作统计
- `audit.helper.login/logout/register/...` - 便捷记录器
- `audit.close()` - 关闭模块

## 错误码

所有操作返回 `Result<T, AuditError>`，常用错误码如下：

- `AuditErrorCode.LOG_FAILED` (10000) - 记录失败
- `AuditErrorCode.QUERY_FAILED` (10001) - 查询失败
- `AuditErrorCode.CLEANUP_FAILED` (10002) - 清理失败
- `AuditErrorCode.STATS_FAILED` (10003) - 统计失败
- `AuditErrorCode.NOT_INITIALIZED` (10010) - 模块未初始化
- `AuditErrorCode.CONFIG_ERROR` (10012) - 配置错误

## 测试

```bash
pnpm --filter @h-ai/audit test
```

## License

Apache-2.0
