/** 在真实 MinIO/RustFS 中验证 storage.init 自行建桶与重复初始化保留对象。 */
import { randomBytes } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { storage } from '../src/index.js'
import { acquireMinioContainer } from './helpers/minio-container.js'
import { acquireRustfsContainer } from './helpers/rustfs-container.js'

for (const [name, acquire] of [['MinIO', acquireMinioContainer], ['RustFS', acquireRustfsContainer]] as const) {
  describe.sequential(`${name} bucket initialization`, () => {
    let lease: Awaited<ReturnType<typeof acquire>> | undefined
    beforeAll(async () => {
      lease = await acquire()
    }, 180_000)
    afterEach(async () => {
      expect((await storage.close()).success).toBe(true)
    })
    afterAll(async () => {
      await lease?.release()
    }, 30_000)

    it('creates an absent bucket only when enabled and preserves its objects on reinitialization', async () => {
      if (!lease)
        throw new Error('Missing S3 container lease')
      const config = {
        type: 's3' as const,
        bucket: `init-${randomBytes(8).toString('hex')}`,
        region: lease.region,
        endpoint: lease.endpoint,
        accessKeyId: lease.accessKeyId,
        secretAccessKey: lease.secretAccessKey,
        forcePathStyle: true,
      }
      expect((await storage.init(config)).success).toBe(false)
      expect(storage.isInitialized).toBe(false)
      expect((await storage.init({ ...config, createBucket: true })).success).toBe(true)
      expect((await storage.file.put('kept.txt', 'bucket survives initialization')).success).toBe(true)
      expect((await storage.close()).success).toBe(true)
      expect((await storage.init({ ...config, createBucket: true })).success).toBe(true)
      const read = await storage.file.get('kept.txt')
      expect(read.success).toBe(true)
      if (read.success)
        expect(read.data.toString()).toBe('bucket survives initialization')
      expect((await storage.file.delete('kept.txt')).success).toBe(true)
    }, 30_000)
  })
}
