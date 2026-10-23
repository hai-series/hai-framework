/** 通过真实 MinIO/RustFS 验证分批回执、持久删除与响应中断后的未知结果。 */
import type { S3ContainerLease } from './helpers/s3-container'
import { randomUUID } from 'node:crypto'
import { createServer, request } from 'node:http'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { storage } from '../src/index'
import { acquireMinioContainer } from './helpers/minio-container'
import { acquireRustfsContainer } from './helpers/rustfs-container'

/** 转发到真实 S3，但丢弃删除响应，模拟服务端已执行、调用方未收到回执。 */
async function interruptDeleteResponses(endpoint: string) {
  let deleteRequests = 0
  const server = createServer((incoming, outgoing) => {
    const target = new URL(incoming.url ?? '/', endpoint)
    const isDelete = incoming.method === 'POST' && target.searchParams.has('delete')
    const forwarded = request(target, { method: incoming.method, headers: incoming.headers }, (response) => {
      if (isDelete) {
        deleteRequests++
        response.resume()
        response.once('end', () => outgoing.destroy())
      }
      else {
        outgoing.writeHead(response.statusCode ?? 502, response.headers)
        response.pipe(outgoing)
      }
    })
    forwarded.on('error', () => outgoing.destroy())
    incoming.pipe(forwarded)
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing proxy address')
  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    get deleteRequests() { return deleteRequests },
    async close() {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    },
  }
}

describe.each([
  { backend: 'MinIO', acquire: acquireMinioContainer },
  { backend: 'RustFS', acquire: acquireRustfsContainer },
])('$backend batch delete integration', ({ acquire }) => {
  let lease: S3ContainerLease | undefined
  beforeAll(async () => {
    lease = await acquire()
  }, 180_000)
  afterEach(async () => {
    await storage.close()
  })
  afterAll(async () => {
    await lease?.release()
  }, 30_000)

  it('真实删除 1001 个键并核对不存在对象的成功回执，保留未请求对象', async () => {
    if (!lease)
      throw new Error('Missing S3 lease')
    const prefix = `batch-${randomUUID()}`
    const config = { type: 's3' as const, ...lease, prefix, forcePathStyle: true }
    const s3 = new S3Client({ region: lease.region, endpoint: lease.endpoint, forcePathStyle: true, credentials: lease })
    try {
      expect((await storage.init(config)).success).toBe(true)
      const keys = Array.from({ length: 1001 }, (_, index) => `key-${index}`)
      // 最后一个键故意不存在；S3 仍须在非 quiet 回执中确认删除。
      for (let offset = 0; offset < 1000; offset += 32) {
        await Promise.all(keys.slice(offset, Math.min(offset + 32, 1000)).map(key =>
          s3.send(new PutObjectCommand({ Bucket: lease!.bucket, Key: `${prefix}/${key}`, Body: 'data' })),
        ))
      }
      expect((await storage.file.put('keep.txt', 'keep')).success).toBe(true)
      const result = await storage.file.deleteMany([...keys, keys[0]])
      expect(result.success).toBe(true)
      if (result.success)
        expect(result.data).toEqual({ deletedKeys: keys, failures: [] })
      const listed = await storage.dir.list()
      expect(listed.success).toBe(true)
      if (listed.success)
        expect(listed.data.files.map(file => file.key)).toEqual(['keep.txt'])
      expect(await storage.file.exists(keys[0])).toEqual({ success: true, data: false })
      expect((await storage.dir.delete('')).success).toBe(true)
      const empty = await storage.dir.list()
      expect(empty.success).toBe(true)
      if (empty.success)
        expect(empty.data.files).toEqual([])
    }
    finally {
      s3.destroy()
    }
  }, 120_000)

  it('真实后端已删除但所有响应中断时返回 unknown，不能伪装失败未执行或成功', async () => {
    if (!lease)
      throw new Error('Missing S3 lease')
    const config = { type: 's3' as const, ...lease, prefix: `interrupt-${randomUUID()}`, forcePathStyle: true }
    expect((await storage.init(config)).success).toBe(true)
    expect((await storage.file.put('a.txt', 'data')).success).toBe(true)
    await storage.close()
    const proxy = await interruptDeleteResponses(lease.endpoint)
    try {
      expect((await storage.init({ ...config, endpoint: proxy.endpoint })).success).toBe(true)
      const result = await storage.file.deleteMany(['a.txt'])
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('hai:storage:002')
        expect(result.error.ext?.deleteMany).toEqual({ deletedKeys: [], failures: [{ key: 'a.txt', code: expect.any(String), retryable: true, outcome: 'unknown' }] })
      }
      // SDK 与模块都不得重放未知结果；并发上传的新对象不能被第二次删除。
      expect(proxy.deleteRequests).toBe(1)
      await storage.close()
      expect((await storage.init(config)).success).toBe(true)
      expect(await storage.file.exists('a.txt')).toEqual({ success: true, data: false })
    }
    finally {
      await storage.close()
      await proxy.close()
    }
  }, 60_000)
})
