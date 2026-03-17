/**
 * @h-ai/reldb — DDL SQL 构建辅助
 *
 * 纯函数集合：生成跨数据库通用的 DDL SQL 片段。
 * Provider 在 raw DdlOperations 实现中调用这些函数生成 SQL，再交由引擎执行。
 * @module reldb-ddl-builder
 */

import type { ReldbColumnDef, ReldbIndexDef, ReldbTableDef } from '../reldb-types.js'

import { escapeSqlString, quoteIdentifier } from '../reldb-security.js'

// ─── 列定义构建 ───

/**
 * 列定义 SQL 构建选项
 *
 * 各 Provider 通过不同选项控制方言差异（类型映射、主键内联方式等）。
 */
export interface ColumnSqlOptions {
  /** 标识符引用函数 */
  quoteId: (n: string) => string
  /** ColumnType → SQL 类型字符串 */
  mapType: (def: ReldbColumnDef) => string
  /** 是否在列定义中内联 PRIMARY KEY（SQLite/PG true，MySQL false） */
  inlinePrimaryKey: boolean
  /** 自定义约束附加（返回额外 SQL 片段数组） */
  extraConstraints?: (def: ReldbColumnDef) => string[]
  /** 默认值格式化覆盖（返回 undefined 走通用逻辑，返回 null 跳过默认值） */
  formatDefault?: (def: ReldbColumnDef) => string | null | undefined
}

/**
 * 通用 buildColumnSql 骨架
 *
 * 各 Provider 仅提供 typeMap 和 overrides 即可。
 */
export function buildColumnSqlBase(
  name: string,
  def: ReldbColumnDef,
  options: ColumnSqlOptions,
): string {
  const parts: string[] = [options.quoteId(name)]

  parts.push(options.mapType(def))

  if (options.inlinePrimaryKey && def.primaryKey) {
    parts.push('PRIMARY KEY')
  }

  // 额外约束（如 AUTOINCREMENT、AUTO_INCREMENT、NOT NULL for PK 等）
  if (options.extraConstraints) {
    parts.push(...options.extraConstraints(def))
  }

  if (def.notNull && !def.primaryKey) {
    parts.push('NOT NULL')
  }

  if (def.unique && !def.primaryKey) {
    parts.push('UNIQUE')
  }

  // 默认值
  if (def.defaultValue !== undefined) {
    const custom = options.formatDefault?.(def)
    if (custom === null) {
      // null 表示跳过默认值（如 MySQL autoIncrement）
    }
    else if (custom !== undefined) {
      parts.push(custom)
    }
    else if (def.defaultValue === null) {
      parts.push('DEFAULT NULL')
    }
    else if (typeof def.defaultValue === 'string') {
      if (def.defaultValue.startsWith('(') && def.defaultValue.endsWith(')')) {
        parts.push(`DEFAULT ${def.defaultValue}`)
      }
      else {
        parts.push(`DEFAULT '${escapeSqlString(def.defaultValue)}'`)
      }
    }
    else {
      parts.push(`DEFAULT ${def.defaultValue}`)
    }
  }

  // 外键引用（内联模式）
  if (options.inlinePrimaryKey && def.references) {
    parts.push(`REFERENCES ${quoteIdentifier(def.references.table)}(${quoteIdentifier(def.references.column)})`)
    if (def.references.onDelete) {
      parts.push(`ON DELETE ${def.references.onDelete}`)
    }
    if (def.references.onUpdate) {
      parts.push(`ON UPDATE ${def.references.onUpdate}`)
    }
  }

  return parts.join(' ')
}

// ─── 表级 DDL SQL ───

/**
 * 默认 CREATE TABLE SQL 生成（SQLite / PostgreSQL 通用）
 *
 * 列定义内联主键和外键，无额外子句。
 */
export function buildDefaultCreateTableSql(
  buildColumnSql: (name: string, def: ReldbColumnDef) => string,
  quotedTable: string,
  columns: ReldbTableDef,
  ifNotExists: boolean,
): string {
  const columnDefs = Object.entries(columns)
    .map(([name, def]) => buildColumnSql(name, def))
    .join(', ')
  const ifNotExistsClause = ifNotExists ? 'IF NOT EXISTS ' : ''
  return `CREATE TABLE ${ifNotExistsClause}${quotedTable} (${columnDefs})`
}

/**
 * 默认 CREATE INDEX SQL 生成（SQLite / PostgreSQL 通用）
 *
 * 支持 IF NOT EXISTS 与 WHERE 子句。
 */
export function buildDefaultCreateIndexSql(
  quoteId: (name: string) => string,
  quotedTable: string,
  quotedIndex: string,
  indexDef: ReldbIndexDef,
): string {
  const uniqueClause = indexDef.unique ? 'UNIQUE ' : ''
  const columns = indexDef.columns.map(c => quoteId(c)).join(', ')
  const whereClause = indexDef.where ? ` WHERE ${indexDef.where}` : ''
  return `CREATE ${uniqueClause}INDEX IF NOT EXISTS ${quotedIndex} ON ${quotedTable} (${columns})${whereClause}`
}

/**
 * 默认 RENAME TABLE SQL 生成（SQLite / PostgreSQL 通用）
 */
export function buildDefaultRenameTableSql(quotedOld: string, quotedNew: string): string {
  return `ALTER TABLE ${quotedOld} RENAME TO ${quotedNew}`
}

/**
 * 默认 DROP INDEX SQL 生成（SQLite / PostgreSQL 通用）
 */
export function buildDefaultDropIndexSql(
  quoteId: (name: string) => string,
  indexName: string,
  ifExists: boolean,
): string {
  const ifExistsClause = ifExists ? 'IF EXISTS ' : ''
  return `DROP INDEX ${ifExistsClause}${quoteId(indexName)}`
}
