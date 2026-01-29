/**
 * =============================================================================
 * @hai/db - 共享测试模块
 * =============================================================================
 *
 * 抽象统一的数据库测试逻辑，各数据库测试文件只需提供：
 * - 初始化/清理逻辑
 * - 数据库特定的差异化测试
 *
 * =============================================================================
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db, DbErrorCode } from '../src/index.js'

type TestResult<T, E> = { success: true; data: T } | { success: false; error: E }

function unwrapOk<T, E>(result: TestResult<T, E>): T {
    if (!result.success) {
        const errorMessage =
            typeof result.error === 'object'
                && result.error !== null
                && 'message' in result.error
                ? String((result.error as { message?: unknown }).message)
                : String(result.error)
        throw new Error(`期望返回成功结果，但实际返回失败结果: ${errorMessage}`)
    }
    return result.data
}

function unwrapErr<T, E>(result: TestResult<T, E>): E {
    if (result.success) {
        throw new Error('期望返回失败结果，但实际返回成功结果')
    }
    return result.error
}

/**
 * 测试配置
 */
export interface DbTestConfig {
    /** 数据库类型名称 */
    name: string
    /** 数据库类型 */
    type: 'sqlite' | 'postgresql' | 'mysql'
    /** 是否支持同步操作 */
    supportSync: boolean
    /** DDL 执行后等待时间（毫秒），异步数据库需要等待 */
    ddlWaitMs?: number
    /** 查询系统表的 SQL（用于验证表是否存在） */
    tableExistsQuery: (tableName: string) => { sql: string; expectField: string }
}

// =============================================================================
// 辅助：等待 DDL 生效（容器化环境可能有延迟）
// =============================================================================

async function waitForTableState(
    config: DbTestConfig,
    tableName: string,
    expectedExists: boolean,
    timeoutMs = 10_000,
    intervalMs = 100,
): Promise<boolean> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
        const exists = await verifyTableExists(config, tableName)
        if (exists === expectedExists) {
            return true
        }
        await delay(intervalMs)
    }
    return false
}

/**
 * 运行 DDL 操作测试
 */
export function runDdlTests(config: DbTestConfig) {
    const wait = config.ddlWaitMs ?? 0
    const testTimeout = config.supportSync ? undefined : 20_000

    describe('DDL 操作', () => {
        beforeEach(async () => {
            // 清理测试表
            db.ddl.dropTable('test_users', true)
            db.ddl.dropTable('test_posts', true)
            db.ddl.dropTable('test_temp', true)

            // 异步驱动需要等待 DDL 生效（容器环境下更明显）
            if (!config.supportSync) {
                await waitForTableState(config, 'test_users', false)
                await waitForTableState(config, 'test_posts', false)
                await waitForTableState(config, 'test_temp', false)
            }
            else if (wait > 0) {
                await delay(wait)
            }
        })

        it('createTable - 应该创建表', async () => {
            const result = db.ddl.createTable('test_users', {
                id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
                name: { type: 'TEXT', notNull: true },
                email: { type: 'TEXT', unique: true },
                age: { type: 'INTEGER' },
                is_active: { type: 'BOOLEAN', defaultValue: true },
            })

            expect(result.success).toBe(true)

            if (!config.supportSync) {
                const verified = await waitForTableState(config, 'test_users', true)
                expect(verified).toBe(true)
                return
            }
            if (wait > 0) await delay(wait)

            // 验证表存在
            const verified = await verifyTableExists(config, 'test_users')
            expect(verified).toBe(true)
        }, testTimeout)

        it('dropTable - 应该删除表', async () => {
            db.ddl.createTable('test_temp', {
                id: { type: 'INTEGER', primaryKey: true },
            })
            if (!config.supportSync) {
                await waitForTableState(config, 'test_temp', true)
            }
            else if (wait > 0) {
                await delay(wait)
            }

            const result = db.ddl.dropTable('test_temp')
            expect(result.success).toBe(true)
            if (!config.supportSync) {
                const verified = await waitForTableState(config, 'test_temp', false)
                expect(verified).toBe(true)
                return
            }
            if (wait > 0) await delay(wait)

            // 验证表不存在
            const verified = await verifyTableExists(config, 'test_temp')
            expect(verified).toBe(false)
        }, testTimeout)

        it('addColumn - 应该添加列', async () => {
            db.ddl.createTable('test_users', {
                id: { type: 'INTEGER', primaryKey: true },
            })
            if (wait > 0) await delay(wait)

            const result = db.ddl.addColumn('test_users', 'nickname', {
                type: 'TEXT',
                defaultValue: 'unknown',
            })

            expect(result.success).toBe(true)
        }, testTimeout)

        it('renameTable - 应该重命名表', async () => {
            db.ddl.createTable('test_users', {
                id: { type: 'INTEGER', primaryKey: true },
            })
            if (!config.supportSync) {
                await waitForTableState(config, 'test_users', true)
            }
            else if (wait > 0) {
                await delay(wait)
            }

            const result = db.ddl.renameTable('test_users', 'test_members')
            expect(result.success).toBe(true)

            if (!config.supportSync) {
                const verified = await waitForTableState(config, 'test_members', true)
                expect(verified).toBe(true)
                // 清理
                db.ddl.dropTable('test_members', true)
                await waitForTableState(config, 'test_members', false)
                return
            }
            if (wait > 0) await delay(wait)

            // 验证新表存在
            const verified = await verifyTableExists(config, 'test_members')
            expect(verified).toBe(true)

            // 清理
            db.ddl.dropTable('test_members', true)
        }, testTimeout)

        it('createIndex - 应该创建索引', async () => {
            db.ddl.createTable('test_users', {
                id: { type: 'INTEGER', primaryKey: true },
                email: { type: 'TEXT' },
            })
            if (!config.supportSync) {
                await waitForTableState(config, 'test_users', true)
            }
            else if (wait > 0) {
                await delay(wait)
            }

            const result = db.ddl.createIndex('test_users', 'idx_test_users_email', {
                columns: ['email'],
                unique: true,
            })

            expect(result.success).toBe(true)
        }, testTimeout)
    })
}

/**
 * 运行异步事务测试（所有数据库都支持）
 */
export function runAsyncTxTests(config: DbTestConfig) {
    const wait = config.ddlWaitMs ?? 0

    describe('异步事务操作 (txAsync)', () => {
        beforeAll(async () => {
            db.ddl.dropTable('test_accounts', true)
            if (wait > 0) await delay(wait)

            db.ddl.createTable('test_accounts', {
                id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
                name: { type: 'TEXT', notNull: true },
                balance: { type: 'INTEGER', defaultValue: 0 },
            })
            if (wait > 0) await delay(wait)
        })

        beforeEach(async () => {
            // 清空数据
            await db.txAsync(async (tx) => {
                await tx.execute('DELETE FROM test_accounts')
            })
        })

        it('txAsync - 应该执行异步事务', async () => {
            const result = await db.txAsync(async (tx) => {
                await tx.execute('INSERT INTO test_accounts (name, balance) VALUES (?, ?)', ['张三', 1000])
                await tx.execute('INSERT INTO test_accounts (name, balance) VALUES (?, ?)', ['李四', 500])

                const accounts = await tx.query<{ id: number; name: string; balance: number }>(
                    'SELECT * FROM test_accounts ORDER BY id'
                )
                return accounts
            })

            const data = unwrapOk(result)
            expect(data.length).toBe(2)
            expect(data[0].name).toBe('张三')
            expect(data[1].name).toBe('李四')
        })

        it('txAsync - 应该支持查询单行 (get)', async () => {
            await db.txAsync(async (tx) => {
                await tx.execute('INSERT INTO test_accounts (name, balance) VALUES (?, ?)', ['张三', 1000])
            })

            const result = await db.txAsync(async (tx) => {
                const account = await tx.get<{ name: string; balance: number }>(
                    'SELECT * FROM test_accounts WHERE name = ?',
                    ['张三']
                )
                return account
            })

            const data = unwrapOk(result)
            expect(data?.name).toBe('张三')
            expect(data?.balance).toBe(1000)
        })

        it('txAsync - 不存在时 get 返回 null', async () => {
            const result = await db.txAsync(async (tx) => {
                const account = await tx.get<{ name: string }>(
                    'SELECT * FROM test_accounts WHERE name = ?',
                    ['不存在']
                )
                return account
            })

            const data = unwrapOk(result)
            expect(data).toBeNull()
        })

        it('txAsync - 事务失败应该回滚', async () => {
            // 先插入数据
            await db.txAsync(async (tx) => {
                await tx.execute('INSERT INTO test_accounts (name, balance) VALUES (?, ?)', ['张三', 1000])
            })

            // 尝试事务但会失败
            const result = await db.txAsync(async (tx) => {
                await tx.execute('UPDATE test_accounts SET balance = ? WHERE name = ?', [500, '张三'])
                throw new Error('模拟错误')
            })

            const error = unwrapErr(result)
            expect(error.code).toBe(DbErrorCode.TRANSACTION_FAILED)

            // 验证数据未被修改
            const verifyResult = await db.txAsync(async (tx) => {
                const account = await tx.get<{ balance: number }>(
                    'SELECT balance FROM test_accounts WHERE name = ?',
                    ['张三']
                )
                return account
            })

            const verifyData = unwrapOk(verifyResult)
            expect(verifyData?.balance).toBe(1000)
        })

        it('txAsync - 应该支持转账场景', async () => {
            // 插入测试数据
            await db.txAsync(async (tx) => {
                await tx.execute('INSERT INTO test_accounts (name, balance) VALUES (?, ?)', ['张三', 1000])
                await tx.execute('INSERT INTO test_accounts (name, balance) VALUES (?, ?)', ['李四', 500])
            })

            // 转账
            const result = await db.txAsync(async (tx) => {
                await tx.execute('UPDATE test_accounts SET balance = balance - ? WHERE name = ?', [200, '张三'])
                await tx.execute('UPDATE test_accounts SET balance = balance + ? WHERE name = ?', [200, '李四'])

                const zhang = await tx.get<{ balance: number }>(
                    'SELECT balance FROM test_accounts WHERE name = ?',
                    ['张三']
                )
                const li = await tx.get<{ balance: number }>(
                    'SELECT balance FROM test_accounts WHERE name = ?',
                    ['李四']
                )

                return { zhang: zhang?.balance, li: li?.balance }
            })

            const data = unwrapOk(result)
            expect(data.zhang).toBe(800)
            expect(data.li).toBe(700)
        })
    })
}

/**
 * 运行同步 SQL 操作测试（仅 SQLite 支持）
 */
export function runSyncSqlTests() {
    describe('同步 SQL 操作 (db.sql)', () => {
        beforeAll(() => {
            db.ddl.dropTable('test_users', true)
            db.ddl.createTable('test_users', {
                id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
                name: { type: 'TEXT', notNull: true },
                email: { type: 'TEXT' },
            })
        })

        beforeEach(() => {
            db.sql.execute('DELETE FROM test_users')
        })

        it('execute - 应该插入数据', () => {
            const result = db.sql.execute(
                'INSERT INTO test_users (name, email) VALUES (?, ?)',
                ['张三', 'zhang@test.com']
            )

            const data = unwrapOk(result)
            expect(data.changes).toBe(1)
            expect(data.lastInsertRowid).toBe(1)
        })

        it('query - 应该查询多行', () => {
            db.sql.execute('INSERT INTO test_users (name, email) VALUES (?, ?)', ['张三', 'zhang@test.com'])
            db.sql.execute('INSERT INTO test_users (name, email) VALUES (?, ?)', ['李四', 'li@test.com'])

            const result = db.sql.query<{ id: number; name: string; email: string }>(
                'SELECT * FROM test_users ORDER BY id'
            )

            const data = unwrapOk(result)
            expect(data.length).toBe(2)
            expect(data[0].name).toBe('张三')
            expect(data[1].name).toBe('李四')
        })

        it('get - 应该查询单行', () => {
            db.sql.execute('INSERT INTO test_users (name, email) VALUES (?, ?)', ['张三', 'zhang@test.com'])

            const result = db.sql.get<{ id: number; name: string }>(
                'SELECT * FROM test_users WHERE name = ?',
                ['张三']
            )

            const data = unwrapOk(result)
            expect(data?.name).toBe('张三')
        })

        it('get - 不存在时返回 null', () => {
            const result = db.sql.get('SELECT * FROM test_users WHERE name = ?', ['不存在'])

            const data = unwrapOk(result)
            expect(data).toBeNull()
        })

        it('execute - 应该更新数据', () => {
            db.sql.execute('INSERT INTO test_users (name, email) VALUES (?, ?)', ['张三', 'zhang@test.com'])

            const result = db.sql.execute(
                'UPDATE test_users SET email = ? WHERE name = ?',
                ['new@test.com', '张三']
            )

            const data = unwrapOk(result)
            expect(data.changes).toBe(1)
        })

        it('execute - 应该删除数据', () => {
            db.sql.execute('INSERT INTO test_users (name, email) VALUES (?, ?)', ['张三', 'zhang@test.com'])

            const result = db.sql.execute('DELETE FROM test_users WHERE name = ?', ['张三'])

            const data = unwrapOk(result)
            expect(data.changes).toBe(1)
        })

        it('batch - 应该批量执行', () => {
            const result = db.sql.batch([
                { sql: 'INSERT INTO test_users (name, email) VALUES (?, ?)', params: ['用户1', 'u1@test.com'] },
                { sql: 'INSERT INTO test_users (name, email) VALUES (?, ?)', params: ['用户2', 'u2@test.com'] },
                { sql: 'INSERT INTO test_users (name, email) VALUES (?, ?)', params: ['用户3', 'u3@test.com'] },
            ])

            unwrapOk(result)

            const count = db.sql.get<{ cnt: number }>('SELECT COUNT(*) as cnt FROM test_users')
            const countData = unwrapOk(count)
            expect(countData?.cnt).toBe(3)
        })
    })
}

/**
 * 运行同步事务测试（仅 SQLite 支持）
 */
export function runSyncTxTests() {
    describe('同步事务操作 (db.tx)', () => {
        beforeAll(() => {
            db.ddl.dropTable('test_accounts', true)
            db.ddl.createTable('test_accounts', {
                id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
                name: { type: 'TEXT', notNull: true },
                balance: { type: 'INTEGER', defaultValue: 0 },
            })
        })

        beforeEach(() => {
            db.sql.execute('DELETE FROM test_accounts')
        })

        it('tx - 应该执行同步事务', () => {
            const result = db.tx((tx) => {
                tx.execute('INSERT INTO test_accounts (name, balance) VALUES (?, ?)', ['张三', 100])
                tx.execute('INSERT INTO test_accounts (name, balance) VALUES (?, ?)', ['李四', 200])

                const users = tx.query<{ name: string }>('SELECT * FROM test_accounts')
                return users.length
            })

            const data = unwrapOk(result)
            expect(data).toBe(2)
        })

        it('tx - 事务内查询应该可见未提交数据', () => {
            const result = db.tx((tx) => {
                tx.execute('INSERT INTO test_accounts (name, balance) VALUES (?, ?)', ['张三', 100])

                const user = tx.get<{ name: string; balance: number }>(
                    'SELECT * FROM test_accounts WHERE name = ?',
                    ['张三']
                )

                return user
            })

            const data = unwrapOk(result)
            expect(data?.name).toBe('张三')
            expect(data?.balance).toBe(100)
        })

        it('tx - 事务失败应该回滚', () => {
            // 先插入一条数据
            db.sql.execute('INSERT INTO test_accounts (name, balance) VALUES (?, ?)', ['张三', 100])

            // 尝试事务但会失败
            const result = db.tx((tx) => {
                tx.execute('UPDATE test_accounts SET balance = ? WHERE name = ?', [50, '张三'])
                throw new Error('模拟错误')
            })

            const error = unwrapErr(result)
            expect(error.code).toBe(DbErrorCode.TRANSACTION_FAILED)

            // 验证数据未被修改
            const user = db.sql.get<{ balance: number }>('SELECT balance FROM test_accounts WHERE name = ?', ['张三'])
            const userData = unwrapOk(user)
            expect(userData?.balance).toBe(100)
        })

        it('tx - 应该支持转账场景', () => {
            db.sql.execute('INSERT INTO test_accounts (name, balance) VALUES (?, ?)', ['张三', 1000])
            db.sql.execute('INSERT INTO test_accounts (name, balance) VALUES (?, ?)', ['李四', 500])

            const result = db.tx((tx) => {
                tx.execute('UPDATE test_accounts SET balance = balance - ? WHERE name = ?', [200, '张三'])
                tx.execute('UPDATE test_accounts SET balance = balance + ? WHERE name = ?', [200, '李四'])

                const zhang = tx.get<{ balance: number }>('SELECT balance FROM test_accounts WHERE name = ?', ['张三'])
                const li = tx.get<{ balance: number }>('SELECT balance FROM test_accounts WHERE name = ?', ['李四'])

                return { zhang: zhang?.balance, li: li?.balance }
            })

            const data = unwrapOk(result)
            expect(data.zhang).toBe(800)
            expect(data.li).toBe(700)
        })
    })
}

/**
 * 运行同步操作不支持测试（PostgreSQL/MySQL）
 */
export function runSyncUnsupportedTests() {
    describe('同步操作应该返回不支持错误', () => {
        it('sql.query 应该返回不支持错误', () => {
            const result = db.sql.query('SELECT 1')
            const error = unwrapErr(result)
            expect(error.code).toBe(DbErrorCode.UNSUPPORTED_TYPE)
        })

        it('sql.get 应该返回不支持错误', () => {
            const result = db.sql.get('SELECT 1')
            const error = unwrapErr(result)
            expect(error.code).toBe(DbErrorCode.UNSUPPORTED_TYPE)
        })

        it('sql.execute 应该返回不支持错误', () => {
            const result = db.sql.execute('SELECT 1')
            const error = unwrapErr(result)
            expect(error.code).toBe(DbErrorCode.UNSUPPORTED_TYPE)
        })

        it('tx 应该返回不支持错误', () => {
            const result = db.tx(() => 'test')
            const error = unwrapErr(result)
            expect(error.code).toBe(DbErrorCode.UNSUPPORTED_TYPE)
        })
    })
}

/**
 * 运行错误处理测试
 */
export function runErrorTests(config?: DbTestConfig) {
    describe('错误处理', () => {
        it('SQL 语法错误应该返回错误', async () => {
            const result = await db.txAsync(async (tx) => {
                await tx.query('INVALID SQL')
            })

            expect(result.success).toBe(false)
        })

        it('DDL 错误应该返回错误', async () => {
            // SQLite：DDL 同步执行，可直接校验错误码
            if (config?.supportSync ?? (db.config?.type === 'sqlite')) {
                const result = db.ddl.raw('CREATE TABL invalid')
                const error = unwrapErr(result)
                expect(error.code).toBe(DbErrorCode.DDL_FAILED)
                return
            }

            // PostgreSQL/MySQL：驱动异步，使用 txAsync 来捕获数据库返回的语法错误
            const result = await db.txAsync(async (tx) => {
                await tx.execute('CREATE TABL invalid')
            })

            const error = unwrapErr(result)
            expect(error.code).toBe(DbErrorCode.TRANSACTION_FAILED)
        })
    })
}

// =============================================================================
// 辅助函数
// =============================================================================

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

async function verifyTableExists(config: DbTestConfig, tableName: string): Promise<boolean> {
    const queryInfo = config.tableExistsQuery(tableName)

    if (config.supportSync) {
        const result = db.sql.query<Record<string, unknown>>(queryInfo.sql, [tableName])
        const data = unwrapOk(result)
        return (data.length ?? 0) > 0
    }
    else {
        const result = await db.txAsync(async (tx) => {
            const rows = await tx.query<Record<string, unknown>>(queryInfo.sql, [tableName])
            return rows
        })
        const data = unwrapOk(result)
        return (data.length ?? 0) > 0
    }
}
