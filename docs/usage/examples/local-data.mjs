/** 可执行的本地数据示例：仅使用新建临时数据，真实调用公开 API，完成后反序关闭。 */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { datapipe } from '@h-ai/datapipe'
import { reldb } from '@h-ai/reldb'
import { HaiStorageError, storage } from '@h-ai/storage'

async function main() {
  if (core.module.requiresSharedState(process.env))
    throw new Error('This example requires an isolated development/test process')
  const directory = await mkdtemp(path.join(tmpdir(), 'hai-usage-'))
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()))
  assert.ok(path.basename(directory).startsWith('hai-usage-'))
  const results = []

  function value(result) {
    assert.ok(result.success, result.success ? undefined : `${result.error.code}: ${result.error.message}`)
    return result.data
  }

  try {
    value(await reldb.init({ type: 'sqlite', database: path.join(directory, 'app.db') }))
    value(await cache.init({ type: 'memory' }))
    value(await storage.init({ type: 'local', root: path.join(directory, 'uploads') }))
    value(await reldb.sql.execute('CREATE TABLE example_orders (id TEXT PRIMARY KEY, title TEXT NOT NULL)'))
    value(await reldb.sql.execute('INSERT INTO example_orders (id, title) VALUES (?, ?)', ['order-1', 'Example order']))
    const orders = value(await reldb.sql.query('SELECT title FROM example_orders WHERE id = ?', ['order-1']))
    assert.equal(orders[0].title, 'Example order')
    results.push('SQLite parameterized write/read passed')

    const rejected = await reldb.tx.wrap(async (tx) => {
      value(await tx.execute('INSERT INTO example_orders (id, title) VALUES (?, ?)', ['rollback-1', 'Must roll back']))
      // 重复主键制造真实写入失败；异常触发 wrap 回滚，不能只返回失败结果。
      const duplicate = await tx.execute('INSERT INTO example_orders (id, title) VALUES (?, ?)', ['order-1', 'Duplicate'])
      if (!duplicate.success)
        throw new Error(duplicate.error.message, { cause: duplicate.error })
    })
    assert.equal(rejected.success, false)
    const remaining = value(await reldb.sql.query('SELECT id FROM example_orders WHERE id = ?', ['rollback-1']))
    assert.equal(remaining.length, 0)
    results.push('Transaction failure rolled back the earlier write; remaining rows: 0')

    assert.equal(value(await cache.kv.set('example:order', { id: 'order-1' }, { ex: 60, nx: true })), true)
    assert.equal(value(await cache.kv.set('example:order', { id: 'replacement' }, { ex: 60, nx: true })), false)
    assert.deepEqual(value(await cache.kv.get('example:order')), { id: 'order-1' })
    results.push('Memory cache write/read passed')

    value(await storage.file.put('example.txt', 'Example material', { ifNoneMatch: '*' }))
    assert.equal(value(await storage.file.get('example.txt')).toString('utf8'), 'Example material')
    const duplicate = await storage.file.put('example.txt', 'Replacement', { ifNoneMatch: '*' })
    assert.equal(duplicate.success, false)
    if (!duplicate.success)
      assert.equal(duplicate.error.code, HaiStorageError.ALREADY_EXISTS.code)
    const signed = await storage.presign.getUrl('example.txt')
    assert.equal(signed.success, false)
    if (!signed.success)
      assert.equal(signed.error.code, HaiStorageError.UNSUPPORTED_OPERATION.code)
    results.push('Local file roundtrip, conditional write and unsupported presign checked')

    const chunks = value(datapipe.chunk('abcdefghij', { mode: 'character', maxSize: 4, overlap: 1 }))
    assert.deepEqual(chunks.map(chunk => chunk.content), ['abcd', 'defg', 'ghij'])
    assert.ok(chunks.every(chunk => [...chunk.content].length <= 4))
    results.push('Text chunk size and overlap checked')

    const sanitized = core.sanitize.sanitizeSensitiveFields({ secretKey: 'example-only', passwordHash: 'example-only', action: 'connect' })
    assert.deepEqual(sanitized, { secretKey: '[REDACTED]', passwordHash: '[REDACTED]', action: 'connect' })
    results.push('Credential redaction checked')
  }
  finally {
    const cleanup = []
    for (const module of [storage, cache, reldb]) {
      const closed = await module.close()
      if (!closed.success)
        cleanup.push(closed.error.code)
    }
    assert.deepEqual(cleanup, [], 'Cleanup failed; preserve this run directory for diagnosis')
    await rm(directory, { recursive: true, force: true })
  }
  process.stdout.write(`${JSON.stringify({ results, cleanup: 'passed' }, null, 2)}\n`)
}

main().catch((error) => {
  core.logger.error('Local usage example failed', { error })
  process.exitCode = 1
})
