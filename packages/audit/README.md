# @h-ai/audit

统一审计日志模块，通过 `audit` 对象提供审计日志的记录、查询、清理与统计功能，基于 `@h-ai/reldb` 实现持久化。

## 依赖

- `@h-ai/reldb` — 数据库（审计日志持久化），**需在 audit.init() 前初始化**

## 适用场景

- 用户操作审计（登录、登出、注册、密码重置等）
- CRUD 操作审计（创建、读取、更新、删除资源）
- 安全事件追踪与合规审计
- 运营数据统计（操作频次、活跃用户等）

## 快速开始

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
await audit.close()
```

## 初始化配置

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

## API 概览

- `audit.init(config)` - 初始化审计模块
- `audit.log(input)` - 记录审计日志
- `audit.list(options)` - 分页查询审计日志（含用户名 JOIN）
- `audit.getUserRecent(userId, limit)` - 获取用户最近活动
- `audit.cleanup(days)` - 清理旧日志
- `audit.getStats(days)` - 获取操作统计
- `audit.helper.login/logout/register/...` - 便捷记录器
- `audit.close()` - 关闭模块

### 输入约束

- `audit.log(input)`：`action` / `resource` 必须为非空字符串，且长度不超过 256。
- `audit.list(options)`：若同时传 `startDate` 与 `endDate`，必须满足 `startDate <= endDate`。
- `audit.getUserRecent(userId, limit)`：`userId` 必须为非空字符串；`limit`（如传入）必须为正整数。
- `audit.cleanup(days)`：`days`（如传入）必须为非负整数。
- `audit.getStats(days)`：`days`（如传入）必须为非负整数。

## 错误码

所有操作返回 `HaiResult<T>`，常用错误码如下：

| 错误码                           | code            | 说明         |
| -------------------------------- | --------------- | ------------ |
| `HaiAuditError.LOG_FAILED`       | `hai:audit:001` | 记录失败     |
| `HaiAuditError.QUERY_FAILED`     | `hai:audit:002` | 查询失败     |
| `HaiAuditError.CLEANUP_FAILED`   | `hai:audit:003` | 清理失败     |
| `HaiAuditError.STATS_FAILED`     | `hai:audit:004` | 统计失败     |
| `HaiAuditError.INIT_IN_PROGRESS` | `hai:audit:005` | 初始化进行中 |
| `HaiAuditError.NOT_INITIALIZED`  | `hai:audit:010` | 模块未初始化 |
| `HaiAuditError.CONFIG_ERROR`     | `hai:audit:012` | 配置错误     |

## 测试

```bash
pnpm --filter @h-ai/audit test
```

## License

Apache-2.0
