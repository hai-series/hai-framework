import type { ReldbTableDef } from '@h-ai/reldb'
import { reldb } from '@h-ai/reldb'

/** 初始化识图记录表和所有者查询索引。 */
export async function ensureVisionTable(): Promise<void> {
  const definition = {
    id: { type: 'TEXT', primaryKey: true, notNull: true },
    user_id: { type: 'TEXT' },
    storage_key: { type: 'TEXT', notNull: true },
    file_name: { type: 'TEXT', notNull: true },
    mime_type: { type: 'TEXT', notNull: true },
    prompt: { type: 'TEXT' },
    analysis: { type: 'TEXT', notNull: true },
    tags_json: { type: 'TEXT', notNull: true },
    confidence: { type: 'REAL', notNull: true },
    created_at: { type: 'TEXT', notNull: true },
  } satisfies ReldbTableDef
  const created = await reldb.ddl.createTable('vision_records', definition)
  if (!created.success)
    throw new Error(`Vision table initialization failed: ${created.error.message}`)
  const schema = await reldb.schemaColumns('vision_records')
  if (!schema.success)
    throw new Error(`Vision table schema inspection failed: ${schema.error.message}`)
  if (schema.data.length !== Object.keys(definition).length || schema.data.some(column => !Object.hasOwn(definition, column)))
    throw new Error('Vision table does not match its current schema')
  const indexName = 'idx_vision_records_user_created'
  const columns = ['user_id', 'created_at']
  const mysql = reldb.config?.type === 'mysql'
  async function hasMysqlIndex(): Promise<boolean> {
    const index = await reldb.sql.get('SELECT index_name FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=? AND index_name=? GROUP BY index_name HAVING GROUP_CONCAT(column_name ORDER BY seq_in_index)=?', [
      'vision_records',
      indexName,
      columns.join(','),
    ])
    if (!index.success)
      throw new Error(`Vision ownership index inspection failed: ${index.error.message}`)
    return index.data !== null
  }
  if (mysql && await hasMysqlIndex())
    return
  const indexed = await reldb.ddl.createIndex('vision_records', indexName, { columns })
  // MySQL 没有 CREATE INDEX IF NOT EXISTS。并发初始化时复核其他进程刚创建的索引。
  if (!indexed.success && !(mysql && await hasMysqlIndex()))
    throw new Error(`Vision ownership index initialization failed: ${indexed.error.message}`)
}
