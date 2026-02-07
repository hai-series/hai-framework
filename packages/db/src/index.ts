/**
 * =============================================================================
 * @hai/db - 数据库模块
 * =============================================================================
 * 提供统一的关系型数据库访问接口
 *
 * 支持：
 * - SQLite（better-sqlite3）
 * - PostgreSQL（pg）
 * - MySQL（mysql2）
 *
 * @example
 * ```ts
 * import { db } from '@hai/db'
 *
 * // SQLite
 * await db.init({ type: 'sqlite', database: './data.db' })
 *
 * // PostgreSQL
 * await db.init({
 *     type: 'postgresql',
 *     host: 'localhost',
 *     port: 5432,
 *     database: 'mydb',
 *     user: 'admin',
 *     password: 'secret',
 *     pool: { max: 20 }
 * })
 *
 * // MySQL
 * await db.init({
 *     type: 'mysql',
 *     url: 'mysql://user:pass@localhost:3306/mydb'
 * })
 *
 * // DDL
 * await db.ddl.createTable('users', {
 *     id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
 *     name: { type: 'TEXT', notNull: true }
 * })
 *
 * // SQL
 * await db.sql.execute('INSERT INTO users (name) VALUES (?)', ['张三'])
 * const users = await db.sql.query('SELECT * FROM users')
 *
 * // 事务
 * await db.tx.wrap(async (tx) => {
 *     await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户1'])
 *     await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户2'])
 * })
 *
 * // 关闭
 * await db.close()
 * ```
 * =============================================================================
 */
// CRUD 仓库基类
export * from './crud/db-crud-repository.js'

// 统一服务入口
export * from './db-main.js'

// 类型定义
export * from './db-types.js'
