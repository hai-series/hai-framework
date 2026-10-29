/** 真实 MinIO 上核验健康检查失败、双客户端清理和关闭失败重试。 */
import type { Socket } from 'node:net'
import { Agent } from 'node:http'
import { S3Client } from '@aws-sdk/client-s3'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { storage } from '../src/index.js'
import { acquireMinioContainer } from './helpers/minio-container.js'

describe.sequential('s3 lifecycle ownership', () => {
  let lease: Awaited<ReturnType<typeof acquireMinioContainer>> | undefined
  beforeAll(async () => {
    lease = await acquireMinioContainer()
  }, 180_000)
  afterEach(async () => {
    vi.restoreAllMocks()
    expect((await storage.close()).success).toBe(true)
  })
  afterAll(async () => {
    await lease?.release()
  }, 30_000)
  function config() {
    if (!lease)
      throw new Error('Missing MinIO container')
    return { type: 's3' as const, bucket: lease.bucket, region: lease.region, endpoint: lease.endpoint, accessKeyId: lease.accessKeyId, secretAccessKey: lease.secretAccessKey, forcePathStyle: true }
  }

  it.each([false, true])('post-health failures release all clients and actual keepalive sockets, public endpoint=%s', async (publicAccess) => {
    const destroyed = new Set<S3Client>()
    const sockets = new Set<Socket>()
    const destroyAgent = Agent.prototype.destroy
    vi.spyOn(Agent.prototype, 'destroy').mockImplementation(function (this: Agent) {
      for (const group of [this.sockets, this.freeSockets]) {
        for (const values of Object.values(group)) {
          for (const socket of values ?? []) sockets.add(socket)
        }
      }
      destroyAgent.call(this)
    })
    const destroy = S3Client.prototype.destroy
    vi.spyOn(S3Client.prototype, 'destroy').mockImplementation(function (this: S3Client) {
      destroyed.add(this)
      destroy.call(this)
    })
    for (let attempt = 0; attempt < 3; attempt++) {
      const send = S3Client.prototype.send
      vi.spyOn(S3Client.prototype, 'send').mockImplementationOnce(async function (this: S3Client, command) {
        await send.call(this, command)
        throw new Error('injected health failure after actual S3 request')
      })
      expect((await storage.init({ ...config(), ...(publicAccess ? { publicEndpoint: 'https://files.example.invalid' } : {}) })).success).toBe(false)
      expect(storage.isInitialized).toBe(false)
    }
    expect(destroyed.size).toBe(publicAccess ? 9 : 6)
    expect(sockets.size).toBeGreaterThanOrEqual(3)
    await vi.waitFor(() => expect([...sockets].every(socket => socket.destroyed)).toBe(true))
    expect((await storage.init(config())).success).toBe(true)
    expect((await storage.dir.list()).success).toBe(true)
  }, 30_000)

  it.each([false, true])('one destroy failure still releases the others and blocks replacement, public endpoint=%s', async (publicAccess) => {
    expect((await storage.init({ ...config(), ...(publicAccess ? { publicEndpoint: 'https://files.example.invalid' } : {}) })).success).toBe(true)
    const counts = new Map<S3Client, number>()
    const blocked = new Set<S3Client>()
    let failures = 2
    const destroy = S3Client.prototype.destroy
    vi.spyOn(S3Client.prototype, 'destroy').mockImplementation(function (this: S3Client) {
      counts.set(this, (counts.get(this) ?? 0) + 1)
      if (blocked.size === 0)
        blocked.add(this)
      if (blocked.has(this) && failures-- > 0)
        throw new Error('injected destroy failure')
      destroy.call(this)
    })
    const send = vi.spyOn(S3Client.prototype, 'send')
    expect((await storage.close()).success).toBe(false)
    expect(counts.size).toBe(publicAccess ? 3 : 2)
    expect(storage.isInitialized).toBe(false)
    expect((await storage.dir.list()).success).toBe(false)
    expect((await storage.init(config())).success).toBe(false)
    expect(send).not.toHaveBeenCalled()
    expect((await storage.close()).success).toBe(true)
    expect([...counts.values()].sort()).toEqual(publicAccess ? [1, 1, 3] : [1, 3])
    expect((await storage.init(config())).success).toBe(true)
  })

  it.each([false, true])('presigning chooses the configured endpoint without external connections, public endpoint=%s', async (publicAccess) => {
    const destroyed = new Set<S3Client>()
    const destroy = S3Client.prototype.destroy
    vi.spyOn(S3Client.prototype, 'destroy').mockImplementation(function (this: S3Client) {
      destroyed.add(this)
      destroy.call(this)
    })
    expect((await storage.init({ ...config(), ...(publicAccess ? { publicEndpoint: 'https://files.example.invalid:9443' } : {}) })).success).toBe(true)
    expect((await storage.file.put('internal.txt', 'internal CRUD remains available')).success).toBe(true)
    expect((await storage.file.get('internal.txt')).success).toBe(true)
    for (const operation of ['getUrl', 'putUrl'] as const) {
      const signed = await storage.presign[operation]('internal.txt', { expiresIn: 60 })
      expect(signed.success).toBe(true)
      if (signed.success) {
        const url = new URL(signed.data)
        expect(url.origin).toBe(publicAccess ? 'https://files.example.invalid:9443' : new URL(config().endpoint).origin)
        expect(url.pathname).toBe(`/${config().bucket}/internal.txt`)
        expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('host')
      }
    }
    expect((await storage.close()).success).toBe(true)
    expect(destroyed.size).toBe(publicAccess ? 3 : 2)
  })
})
