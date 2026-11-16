# @h-ai/audit

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/core](../core/README.md) · [@h-ai/reldb](../reldb/README.md)

统一审计日志模块，通过 `audit` 对象提供审计日志的记录、查询、清理与统计功能，基于 `@h-ai/reldb` 实现持久化。

## 快速开始

### 依赖

- `@h-ai/reldb` — 数据库（审计日志持久化），**需在 audit.init() 前初始化**

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
await audit.helper.crud({
  userId: 'user_1',
  action: 'create',
  resource: 'users',
  resourceId: 'user_2',
  details: { name: '张三' }
})

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

## 配置清单

生成项目使用 `config/_audit.yml`。应用可以通过 `audit.init(config)` 接入配置。

在[模块配置清单](../../docs/usage/configuration/audit.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

在[功能说明](../../docs/usage/function/audit.md)中查看调用示例、输入输出、错误处理与使用要点。

- `init` / `close` / `isInitialized` — 连接和关闭审计服务
- `withContext` / `log` / `capture` / `helper` — 为业务操作记录可关联的审计事件
- `list` / `getUserRecent` / `getStats` / `cleanup` — 查询记录和统计并清理历史
- `backup` / `schedulerPlan` / `checkAlerts` — 导出私有归档、安排定时执行并检查告警

## 数据结构

查看[数据结构](../../docs/usage/data/audit.md)，了解审计日志、字段映射、归档对象和告警去重。

## 开发测试

```bash
pnpm --filter @h-ai/audit test
```

审计源码示例明确先初始化 RelDB、检查审计写入结果，再按依赖反序检查关闭结果；参见[模块 JSDoc 约定](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证).

## 许可证

Apache-2.0
