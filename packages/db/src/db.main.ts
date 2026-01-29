/**
 * =============================================================================
 * @hai/db - 统一数据库服务
 * =============================================================================
 * 提供统一的数据库 API，支持多种 provider
 * =============================================================================
 */

import type { Result } from '@hai/core'

import type {
    ConnectionProvider,
    DbConfig,
    DbConnection,
    DbError,
    DbService,
    MigrationProvider,
    QueryProvider,
} from './db-types.js'

import { createHaiConnectionProvider } from './provider/hai/db-hai-connection.js'
import { createHaiMigrationProvider } from './provider/hai/db-hai-migration.js'
import { createHaiQueryProvider } from './provider/hai/db-hai-query.js'

// =============================================================================
// 默认配置
// =============================================================================

const defaultConfig: DbConfig = {
    provider: 'hai',
    type: 'sqlite',
    sqlite: {
        filename: ':memory:',
        walMode: true,
    },
}

// =============================================================================
// Provider 实例
// =============================================================================

let currentConfig: DbConfig = { ...defaultConfig }
let connectionProvider: ConnectionProvider | null = null
let migrationProvider: MigrationProvider | null = null
let queryProvider: QueryProvider | null = null
let currentConnection: DbConnection | null = null

// =============================================================================
// Provider 工厂
// =============================================================================

function createConnectionProvider(config: DbConfig): ConnectionProvider {
    switch (config.provider) {
        case 'hai':
            return createHaiConnectionProvider()
        case 'supabase':
        case 'firebase':
        case 'planetscale':
        case 'neon':
        case 'custom':
            // 可扩展其他实现
            return createHaiConnectionProvider()
        default:
            return createHaiConnectionProvider()
    }
}

function createMigrationProvider(config: DbConfig): MigrationProvider {
    switch (config.provider) {
        case 'hai':
            return createHaiMigrationProvider()
        case 'supabase':
        case 'firebase':
        case 'planetscale':
        case 'neon':
        case 'custom':
            return createHaiMigrationProvider()
        default:
            return createHaiMigrationProvider()
    }
}

function createQueryProvider(config: DbConfig): QueryProvider {
    switch (config.provider) {
        case 'hai':
            return createHaiQueryProvider()
        case 'supabase':
        case 'firebase':
        case 'planetscale':
        case 'neon':
        case 'custom':
            return createHaiQueryProvider()
        default:
            return createHaiQueryProvider()
    }
}

// =============================================================================
// 初始化
// =============================================================================

function ensureProviders() {
    if (!connectionProvider) {
        connectionProvider = createConnectionProvider(currentConfig)
    }
    if (!migrationProvider) {
        migrationProvider = createMigrationProvider(currentConfig)
    }
    if (!queryProvider) {
        queryProvider = createQueryProvider(currentConfig)
    }
}

// =============================================================================
// 统一数据库服务
// =============================================================================

/**
 * 统一数据库服务实例
 *
 * @example
 * ```typescript
 * import { db } from '@hai/db'
 *
 * // 初始化
 * await db.init({
 *   type: 'sqlite',
 *   sqlite: { filename: './data.db', walMode: true }
 * })
 *
 * // 运行迁移
 * db.migration.initialize(db.current!)
 * await db.migration.run(db.current!, migrations)
 *
 * // 执行查询
 * const result = await db.query.raw(db.current!, 'SELECT * FROM users')
 *
 * // 关闭连接
 * await db.close()
 * ```
 */
export const db: DbService = {
    get connection(): ConnectionProvider {
        ensureProviders()
        return connectionProvider!
    },

    get migration(): MigrationProvider {
        ensureProviders()
        return migrationProvider!
    },

    get query(): QueryProvider {
        ensureProviders()
        return queryProvider!
    },

    get config(): DbConfig {
        return { ...currentConfig }
    },

    get current(): DbConnection | null {
        return currentConnection
    },

    async init(config?: Partial<DbConfig>): Promise<Result<DbConnection, DbError>> {
        if (config) {
            currentConfig = { ...defaultConfig, ...config }
        }

        // 重新创建 providers
        connectionProvider = createConnectionProvider(currentConfig)
        migrationProvider = createMigrationProvider(currentConfig)
        queryProvider = createQueryProvider(currentConfig)

        // 建立连接
        const result = await connectionProvider.connect(currentConfig)

        if (result.success) {
            currentConnection = result.data
        }

        return result
    },

    async close(): Promise<void> {
        if (currentConnection && connectionProvider) {
            await connectionProvider.close(currentConnection)
            currentConnection = null
        }
    },
}

// =============================================================================
// 便捷函数导出
// =============================================================================

/**
 * 创建新的数据库服务实例
 */
export function createDbService(config?: Partial<DbConfig>): DbService {
    const serviceConfig: DbConfig = { ...defaultConfig, ...config }
    const connProvider = createConnectionProvider(serviceConfig)
    const migrProvider = createMigrationProvider(serviceConfig)
    const qryProvider = createQueryProvider(serviceConfig)
    let conn: DbConnection | null = null

    return {
        get connection() { return connProvider },
        get migration() { return migrProvider },
        get query() { return qryProvider },
        get config() { return { ...serviceConfig } },
        get current() { return conn },

        async init(newConfig?: Partial<DbConfig>): Promise<Result<DbConnection, DbError>> {
            if (newConfig) {
                Object.assign(serviceConfig, newConfig)
            }
            const result = await connProvider.connect(serviceConfig)
            if (result.success) {
                conn = result.data
            }
            return result
        },

        async close(): Promise<void> {
            if (conn) {
                await connProvider.close(conn)
                conn = null
            }
        },
    }
}
