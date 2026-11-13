/** PostgreSQL/MySQL 真数据库证明 CAS、缺失创建和锁等待后的最终期限。 */
import { reldb } from '@h-ai/reldb'
import { describe, expect, it, vi } from 'vitest'
import { mysqlEnv, postgresEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'
import { createACPMaintenance } from '../src/acp/ai-acp-maintenance.js'
import { createDbStoreProviderFromModules } from '../src/store/providers/ai-store-provider-db.js'

describe.each(['postgresql', 'mysql'] as const)('server Store CAS %s', (backend) => {
  it('版本冲突不会覆盖，语句等待行锁越过deadline后不能落库，实际故障不当作missing', async () => {
    const env = await (backend === 'mysql'
      ? mysqlEnv()
      : postgresEnv())
    try {
      await reldb.close()
      const init = await reldb.init(env.config)
      if (!init.success)
        throw new Error(init.error.message)
      const provider = createDbStoreProviderFromModules()
      const table = `hai_ai_cas_${crypto.randomUUID().slice(0, 18).replaceAll('-', '')}`
      const a = provider.createRelStore<{ value: string }>(table, { hasObjectId: true })
      const b = provider.createRelStore<{ value: string }>(table, { hasObjectId: true })
      const scalar = provider.createRelStore<string>(`${table}_scalar`)
      const grants = provider.createRelStore<{ owner: string, expires: number, revoked?: boolean }>(`${table}_grants`)
      const quota1 = provider.createRelStore<{ count: number }>(`${table}_quota`, { serializeWrites: true })
      const quota2 = provider.createRelStore<{ count: number }>(`${table}_quota`, { serializeWrites: true })
      const scope = { tenantId: 'team', userId: 'ada' }
      const sessions = provider.createRelStore<{ workerId: string, workerScope: typeof scope, updatedAt: number }>(`${table}_sessions`, { hasUpdatedAtIndex: true })
      const receipts = provider.createRelStore<{ workerScope: typeof scope, updatedAt: number }>(`${table}_receipts`, { hasUpdatedAtIndex: true })
      const intents = provider.createRelStore<{ updatedAt: number }>(`${table}_intents`, { hasUpdatedAtIndex: true })
      await provider.initialize()
      const updates = Array.from({ length: 12 }, (_, index) => (index % 2
        ? quota1
        : quota2).withWriteLock!(async (store) => {
        const row = await store.get('counter')
        await store.save('counter', { count: (row?.count ?? 0) + 1 })
      }))
      await Promise.all(updates)
      expect(await quota1.get('counter')).toEqual({ count: 12 })

      const old = await sessions.currentTime() - 8 * 86_400_000
      const workers = {
        missing: {
          success: false as const,
          error: { code: 'hai:runner:021', message: 'Missing fixture' },
        },
        unknown: {
          success: true as const,
          data: {
            id: 'unknown',
            scope,
            kind: 'test',
            status: 'unknown' as const,
            createdAt: old,
            updatedAt: old,
          },
        },
        unavailable: {
          success: false as const,
          error: { code: 'hai:runner:028', message: 'Fixture unavailable' },
        },
      }
      for (const workerId of ['missing', 'unknown', 'unavailable'] as const) {
        await sessions.save(workerId, { workerId, workerScope: scope, updatedAt: old })
        await receipts.save(workerId, { workerScope: scope, updatedAt: old })
        await intents.save(workerId, { updatedAt: old })
      }
      await sessions.save('fresh', { workerId: 'missing', workerScope: scope, updatedAt: await sessions.currentTime() })
      await createACPMaintenance({
        get: async (_scope, id) => workers[id as keyof typeof workers],
      }, { bindings: sessions, receipts, intents })()
      expect(await sessions.get('missing')).toBeUndefined()
      expect(await receipts.get('missing')).toBeUndefined()
      expect(await intents.get('missing')).toBeUndefined()
      expect(await sessions.get('fresh')).toBeDefined()
      expect(await sessions.get('unknown')).toBeDefined()
      expect(await receipts.get('unknown')).toBeDefined()
      expect(await intents.get('unknown')).toBeDefined()
      expect(await sessions.get('unavailable')).toBeDefined()
      await scalar.save('text', 'plain string')
      expect(await scalar.get('text')).toBe('plain string')
      expect((await scalar.readVersioned('text'))?.data).toBe('plain string')
      const activeGrant = { owner: 'alice-scope', expires: 30 }
      await grants.saveMany([
        { id: 'active', data: activeGrant },
        {
          id: 'revoked',
          data: { owner: 'alice-scope', expires: 40, revoked: true },
        },
        {
          id: 'expired',
          data: { owner: 'alice-scope', expires: 10 },
        },
        {
          id: 'other',
          data: { owner: 'bob-scope', expires: 40 },
        },
      ])
      expect(await grants.queryPage({
        where: {
          owner: 'alice-scope',
          expires: { $gt: 20 },
          revoked: { $ne: true },
        },
        orderBy: { field: 'expires', direction: 'desc' },
      }, { limit: 1, offset: 0 })).toEqual({
        items: [activeGrant],
        total: 1,
      })
      const winners = await Promise.all(Array.from({ length: 8 }, (_, index) => a.compareAndSwap('one', {
        expectedVersion: undefined,
        data: {
          value: String(index),
        },
        scope: { objectId: 'owner' },
      })))
      expect(winners.filter(Boolean)).toHaveLength(1)
      const read = await b.readVersioned('one')
      expect(read).toBeDefined()
      const next = await b.compareAndSwap('one', {
        expectedVersion: read?.version,
        data: { value: 'next' },
      })
      expect(next).toBeDefined()
      expect(await a.compareAndSwap('one', {
        expectedVersion: read?.version,
        data: { value: 'stale' },
      })).toBeUndefined()
      const tx = await reldb.tx.begin()
      if (!tx.success)
        throw new Error(tx.error.message)
      try {
        expect((await tx.data.execute(`UPDATE ${table} SET updated_at = updated_at WHERE id = ?`, ['one'])).success).toBe(true)
        const deadline = await a.currentTime() + 1000
        const pending = a.compareAndSwap('one', {
          expectedVersion: next,
          data: { value: 'expired' },
          notAfter: deadline,
        })
        await new Promise(resolve => setTimeout(resolve, 1500))
        expect((await tx.data.commit()).success).toBe(true)
        expect(await pending).toBeUndefined()
      }
      finally { await tx.data.rollback() }
      expect(await b.query({ objectId: 'owner' })).toEqual([
        { value: 'next' },
      ])
      const now = await a.currentTime()
      expect(await b.compareAndSwap('missing', {
        expectedVersion: undefined,
        data: { value: 'expired' },
        notAfter: now - 1,
      })).toBeUndefined()
      const fault = vi.spyOn(reldb.sql, 'get').mockResolvedValueOnce({
        success: false,
        error: { code: 'hai:reldb:002', message: 'Injected SQL failure' },
      })
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
