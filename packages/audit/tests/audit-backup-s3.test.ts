/** 真实 S3 兼容后端的大归档、原子创建竞争和私有读取边界。 */
import { reldb } from '@h-ai/reldb'
import { storage } from '@h-ai/storage'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { s3Env } from '../../storage/tests/helpers/storage-test-suite.js'
import { audit, HaiAuditError } from '../src/index.js'

for (const backend of ['minio', 'rustfs'] as const) {
  describe.sequential(`audit backup S3 ${backend}`, () => {
    let environment: Awaited<ReturnType<typeof s3Env>> | undefined
    beforeAll(async () => {
      environment = await s3Env(backend)
      expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
      expect((await reldb.ddl.createTable('hai_iam_users', { id: { type: 'TEXT', primaryKey: true }, username: { type: 'TEXT' } })).success).toBe(true)
      expect((await storage.init(environment.config)).success).toBe(true)
      expect((await audit.init({ storage, backup: { enabled: true, batchSize: 1, maxRecordBytes: 8 * 1024 * 1024 } })).success).toBe(true)
    }, 300_000)
    afterAll(async () => {
      try {
        await audit.close()
        await storage.close()
        await reldb.close()
      }
      finally {
        await environment?.cleanup?.()
      }
    }, 300_000)

    it('真实大文件上传与并发创建只保留完整的一份，并可流式校验', async () => {
      expect((await audit.log({ action: 'large-s3-backup', resource: 'orders', details: { notes: '界'.repeat(2 * 1024 * 1024), password: 'private-credential' } })).success).toBe(true)
      const id = `s3-${backend}-${crypto.randomUUID()}`
      const results = await Promise.all([audit.backup.run({ id }), audit.backup.run({ id })])
      expect(results[0].success).toBe(true)
      expect(results[1]).toEqual(results[0])
      if (!results[0].success)
        return
      const info = results[0].data
      const metadata = await storage.file.head(info.key)
      expect(metadata.success && metadata.data.size).toBeGreaterThan(5 * 1024 * 1024)
      expect(await audit.backup.verify(info.key)).toEqual(results[0])
      if (!environment || environment.config.type !== 's3')
        throw new Error('S3 fixture configuration required')
      const key = info.key.split('/').map(encodeURIComponent).join('/')
      const response = await fetch(`${environment.config.endpoint}/${environment.config.bucket}/${key}`)
      try {
        expect([401, 403, 404]).toContain(response.status)
      }
      finally {
        await response.body?.cancel()
      }
    }, 120_000)

    it('明确配置公开访问地址时拒绝启用审计备份', async () => {
      if (!environment || environment.config.type !== 's3')
        throw new Error('S3 fixture configuration required')
      await audit.close()
      await storage.close()
      expect((await storage.init({ ...environment.config, publicUrl: 'https://public.example.test' })).success).toBe(true)
      expect(await audit.init({ storage, backup: { enabled: true } })).toMatchObject({ success: false, error: { code: HaiAuditError.CONFIG_ERROR.code } })
    })
  })
}
