/**
 * =============================================================================
 * @hai/db - 数据库模块
 * =============================================================================
 */

// 统一服务入口
export { db, createDbService } from './db.main.js'

// 类型定义
export type * from './db-types.js'

// HAI Provider 实现
export { createHaiConnectionProvider } from './provider/hai/db-hai-connection.js'
export { createHaiMigrationProvider } from './provider/hai/db-hai-migration.js'
export { createHaiQueryProvider } from './provider/hai/db-hai-query.js'

// Drizzle ORM 工具
export { eq, and, or, sql, desc, asc, like, isNull, isNotNull } from 'drizzle-orm'
