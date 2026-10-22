/** 三种真实数据库执行同一对象 Merge Patch，禁止把 PostgreSQL 浅拼接视为 RFC 7396。 */
import type { HaiResult } from '@h-ai/core'
import { expect, it } from 'vitest'
import { reldb } from '../src/index.js'
import { defineDbSuite, mysqlEnv, postgresEnv, sqliteMemoryEnv } from './helpers/reldb-test-suite.js'

function unwrap<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(result.error.message)
  return result.data
}

const cases: Array<{ name: string, target: unknown, patch: Record<string, unknown>, expected: unknown }> = [
  { name: 'deletes explicit null while preserving unpatched null', target: { remove: 'x', keep: null }, patch: { remove: null }, expected: { keep: null } },
  { name: 'recursively merges siblings', target: { profile: { name: 'A', flags: { a: 1, b: 2 } } }, patch: { profile: { flags: { b: null, c: 3 } } }, expected: { profile: { name: 'A', flags: { a: 1, c: 3 } } } },
  { name: 'converts scalar root to object', target: 1, patch: { name: 'A' }, expected: { name: 'A' } },
  { name: 'converts null root to object for empty patch', target: null, patch: {}, expected: {} },
  { name: 'converts nested array to object', target: { flags: [1, 2] }, patch: { flags: { active: true, gone: null } }, expected: { flags: { active: true } } },
  { name: 'replaces arrays atomically', target: { items: [1, 2] }, patch: { items: [3, null] }, expected: { items: [3, null] } },
  { name: 'preserves empty objects', target: { settings: null }, patch: { settings: {} }, expected: { settings: {} } },
  { name: 'handles numeric and punctuation object keys', target: { '0': { keep: 1 }, 'a.b': { keep: 2 } }, patch: { '0': { next: 3 }, 'a.b': { next: 4 } }, expected: { '0': { keep: 1, next: 3 }, 'a.b': { keep: 2, next: 4 } } },
  { name: 'keeps SQL metacharacters inside parameters', target: {}, patch: { 'x\'); DROP TABLE users; --': { 'a"b': 'safe' } }, expected: { 'x\'); DROP TABLE users; --': { 'a"b': 'safe' } } },
  { name: 'keeps prototype-like keys as JSON data', target: Object.fromEntries([['__proto__', { before: 1 }]]), patch: Object.fromEntries([['__proto__', { after: 2 }]]), expected: Object.fromEntries([['__proto__', { before: 1, after: 2 }]]) },
]

for (const [label, setup] of [['sqlite', sqliteMemoryEnv], ['postgresql', postgresEnv], ['mysql', mysqlEnv]] as const) {
  defineDbSuite(`JSON merge ${label}`, setup, () => {
    it('merges concurrent row updates without losing independent nested fields', async () => {
      unwrap(await reldb.ddl.createTable('json_merge_rows', {
        id: { type: 'INTEGER', primaryKey: true },
        document: { type: 'JSON' },
      }))
      unwrap(await reldb.sql.execute('INSERT INTO json_merge_rows (id, document) VALUES (?, ?)', [1, JSON.stringify({ profile: { keep: true } })]))
      const patches = [{ profile: { left: 1 } }, { profile: { right: 2 } }]
      const results = await Promise.all(patches.map(async (patch) => {
        const expression = reldb.json.merge('document', patch)
        return reldb.sql.execute(`UPDATE json_merge_rows SET document = ${expression.sql} WHERE id = ?`, [...expression.params, 1])
      }))
      for (const result of results) expect(unwrap(result).changes).toBe(1)
      const row = unwrap(await reldb.sql.get<{ document: unknown }>('SELECT document FROM json_merge_rows WHERE id = ?', [1]))
      const decoded: unknown = typeof row?.document === 'string' ? JSON.parse(row.document) : row?.document
      expect(decoded).toEqual({ profile: { keep: true, left: 1, right: 2 } })
      unwrap(await reldb.ddl.dropTable('json_merge_rows'))
    })
    for (const entry of cases) {
      it(entry.name, async () => {
        const expression = reldb.json.merge('document', entry.patch)
        const input = label === 'postgresql' ? '?::jsonb' : label === 'mysql' ? 'CAST(? AS JSON)' : 'json(?)'
        const rows = unwrap(await reldb.sql.query<{ value: unknown }>(
          `SELECT ${expression.sql} AS value FROM (SELECT ${input} AS document) AS input_document`,
          [...expression.params, JSON.stringify(entry.target)],
        ))
        const value = rows[0]?.value
        expect(typeof value === 'string' ? JSON.parse(value) : value).toEqual(entry.expected)
      })
    }
  })
}
