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
 * db.init({ type: 'sqlite', database: './data.db' })
 *
 * // PostgreSQL
 * db.init({
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
 * db.init({
 *     type: 'mysql',
 *     url: 'mysql://user:pass@localhost:3306/mydb'
 * })
 *
 * // DDL
 * db.ddl.createTable('users', {
 *     id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
 *     name: { type: 'TEXT', notNull: true }
 * })
 *
 * // SQL
 * db.sql.execute('INSERT INTO users (name) VALUES (?)', ['张三'])
 * const users = db.sql.query('SELECT * FROM users')
 *
 * // 事务
 * db.tx((tx) => {
 *     tx.execute('INSERT INTO users (name) VALUES (?)', ['用户1'])
 *     tx.execute('INSERT INTO users (name) VALUES (?)', ['用户2'])
 * })
 *
 * // 关闭
 * db.close()
 * ```
 * =============================================================================
 */
import { core } from '@hai/core'
import messagesEnUS from '../messages/en-US.json'
import messagesZhCN from '../messages/zh-CN.json'

// 配置 Schema（zod）
export * from './db-config.js'

// 统一服务入口
export * from './db-main.js'

// 类型定义
export * from './db-types.js'

// i18n
type DbMessageKey = keyof typeof messagesZhCN
export const getDbMessage
  = core.i18n.createMessageGetter<DbMessageKey>({ 'zh-CN': messagesZhCN, 'en-US': messagesEnUS })
