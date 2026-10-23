/** PostgreSQL/MySQL 真数据库证明 CAS、缺失创建和锁等待后的最终期限。 */
import { reldb } from '@h-ai/reldb'
import { describe, expect, it, vi } from 'vitest'
import { mysqlEnv, postgresEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'
import { createDbStoreProviderFromModules } from '../src/store/providers/ai-store-provider-db.js'

describe.each(['postgresql', 'mysql'] as const)('server Store CAS %s', (backend) => {
  it('版本冲突不会覆盖，语句等待行锁越过deadline后不能落库，实际故障不当作missing', async () => {
    const env = await (backend === 'mysql' ? mysqlEnv() : postgresEnv())
    try {
      await reldb.close()
      const init = await reldb.init(env.config)
      if (!init.success)
        throw new Error(init.error.message)
      const provider = createDbStoreProviderFromModules()
      const table = `hai_ai_cas_${crypto.randomUUID().replaceAll('-', '')}`
      const a = provider.createRelStore<{ value: string }>(table, { hasObjectId: true })
      const b = provider.createRelStore<{ value: string }>(table, { hasObjectId: true })
      const scalar = provider.createRelStore<string>(`${table}_scalar`)
      await provider.initialize()
      await scalar.save('text', 'plain string')
      expect(await scalar.get('text')).toBe('plain string')
      expect((await scalar.readVersioned('text'))?.data).toBe('plain string')
      const winners = await Promise.all(Array.from({ length: 8 }, (_, index) => a.compareAndSwap('one', {
        expectedVersion: undefined,
        data: { value: String(index) },
        scope: { objectId: 'owner' },
      })))
      expect(winners.filter(Boolean)).toHaveLength(1)
      const read = await b.readVersioned('one')
      expect(read).toBeDefined()
      const next = await b.compareAndSwap('one', { expectedVersion: read?.version, data: { value: 'next' } })
      expect(next).toBeDefined()
      expect(await a.compareAndSwap('one', { expectedVersion: read?.version, data: { value: 'stale' } })).toBeUndefined()
      const tx = await reldb.tx.begin()
      if (!tx.success)
        throw new Error(tx.error.message)
      try {
        expect((await tx.data.execute(`UPDATE ${table} SET updated_at = updated_at WHERE id = ?`, ['one'])).success).toBe(true)
        const deadline = await a.currentTime() + 1000
        const pending = a.compareAndSwap('one', { expectedVersion: next, data: { value: 'expired' }, notAfter: deadline })
        await new Promise(resolve => setTimeout(resolve, 1500))
        expect((await tx.data.commit()).success).toBe(true)
        expect(await pending).toBeUndefined()
      }
      finally { await tx.data.rollback() }
      expect(await b.query({ objectId: 'owner' })).toEqual([{ value: 'next' }])
      const now = await a.currentTime()
      expect(await b.compareAndSwap('missing', { expectedVersion: undefined, data: { value: 'expired' }, notAfter: now - 1 })).toBeUndefined()
      const fault = vi.spyOn(reldb.sql, 'get').mockResolvedValueOnce({ success: false, error: { code: 'hai:reldb:002', message: 'Injected SQL failure' } })
      await expect(a.readVersioned('one')).rejects.toThrow('Injected SQL failure')
      fault.mockRestore()
      await provider.close?.()
    }
    finally {
      vi.restoreAllMocks()
      await reldb.close()
      await env.release?.()
      const restored = await reldb.init({ type: 'sqlite', database: ':memory:' })
      expect(restored.success).toBe(true)
    }
  }, 180_000)
})
