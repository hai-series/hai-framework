/**
 * =============================================================================
 * @hai/db - 主入口
 * =============================================================================
 * 数据库模块，提供:
 * - 多数据库支持 (SQLite/PostgreSQL/MySQL)
 * - 连接管理
 * - 数据迁移
 * - Repository 模式
 * =============================================================================
 */

// 连接管理
export {
    ConnectionManager,
    createConnection,
    getConnectionManager,
    type DbConnection,
    type DbError,
    type DbErrorType,
    type DbInstance,
    type MysqlConnection,
    type PostgresConnection,
    type SqliteConnection,
} from './connection.js'

// 迁移工具
export {
    createMigrationManager,
    MigrationManager,
    type Migration,
} from './migrate.js'

// Repository
export {
    BaseRepository,
    type PaginatedResult,
    type PaginationParams,
    type RepositoryError,
    type RepositoryErrorType,
} from './repository.js'

// Re-export Drizzle utilities
export { eq, and, or, sql, desc, asc, like, isNull, isNotNull } from 'drizzle-orm'
