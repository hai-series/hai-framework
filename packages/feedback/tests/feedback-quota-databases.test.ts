import type { DbTestEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { reldb } from '@h-ai/reldb'
import { storage } from '@h-ai/storage'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mysqlEnv, postgresEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'
import { feedback, HaiFeedbackError } from '../src/index.js'

for (const [name, factory] of [['postgresql', postgresEnv], ['mysql', mysqlEnv]] as const) {
  describe.sequential(`feedback atomic quota ${name}`, () => {
    let backend: DbTestEnv | undefined
    let directory: string | undefined
    beforeAll(async () => {
      backend = await factory()
      expect((await reldb.init(backend.config)).success).toBe(true)
      directory = await mkdtemp(join(tmpdir(), 'hai-feedback-quota-'))
      expect((await storage.init({ type: 'local', root: directory })).success).toBe(true)
      expect((await feedback.init({ appId: 'quota-database', notificationMode: 'disabled', workerIntervalMs: 0, maxReportsPerUserDay: 1 })).success).toBe(true)
    }, 180000)
    afterAll(async () => {
      await feedback.close()
      await storage.close()
      await reldb.close()
      await backend?.release?.()
      if (directory)
        await rm(directory, { recursive: true, force: true })
    })
    it('同一用户并发提交只有一份受理，其它配额失败完整回滚', async () => {
      const actor = { scopeId: 'quota-scope', userId: 'quota-user', permissions: ['feedback:*'] }
      const results = await Promise.all(Array.from({ length: 6 }, (_, index) => feedback.submit({ appId: 'quota-database', submissionId: `quota-${index}` }, actor)))
      expect(results.filter(result => result.success)).toHaveLength(1)
      for (const result of results.filter(result => !result.success))
        expect(result).toMatchObject({ success: false, error: { code: HaiFeedbackError.QUOTA_EXCEEDED.code } })
      expect(await feedback.list({}, actor)).toMatchObject({ success: true, data: { total: 1 } })
      const reservations = await reldb.sql.get<{ count: number | string }>('SELECT COUNT(*) AS count FROM hai_feedback_quotas WHERE period = -1')
      expect(reservations.success).toBe(true)
      if (reservations.success)
        expect(Number(reservations.data?.count)).toBe(1)
    })
  })
}
