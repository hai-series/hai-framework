/** 批量删除的逐项失败、回执完整性、分批及中断语义。 */
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { ok } from '@h-ai/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { storage } from '../src/index'

afterEach(async () => {
  await storage.close()
  vi.restoreAllMocks()
})

/** 建立真实 Provider，只替换 SDK 传输结果，连接验证不属于批量删除。 */
async function s3Provider() {
  const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({})
  const provider = storage
  expect((await provider.init({
    type: 's3',
    bucket: 'test-bucket',
    region: 'us-east-1',
    accessKeyId: 'test-key',
    secretAccessKey: 'test-secret',
    prefix: 'tenant',
  })).success).toBe(true)
  send.mockReset()
  return { provider, send }
}

describe('s3 deleteMany', () => {
  it('hTTP 200 的 AccessDenied 仍返回失败，并保留不含 prefix/原始 Message 的部分进度', async () => {
    const { provider, send } = await s3Provider()
    send.mockResolvedValue({ Deleted: [{ Key: 'tenant/a' }], Errors: [{ Key: 'tenant/b', Code: 'AccessDenied', Message: 'sensitive upstream details' }] })
    const result = await provider.file.deleteMany(['a', 'b'])
    expect(result).toMatchObject({ success: false, error: { ext: { deleteMany: {
      deletedKeys: ['a'],
      failures: [{ key: 'b', code: 'AccessDenied', retryable: false, outcome: 'failed' }],
    } } } })
    expect(send).toHaveBeenCalledOnce()
    expect(JSON.stringify(result)).not.toContain('sensitive upstream details')
    expect(JSON.stringify(result)).not.toContain('tenant/')
    await provider.close()
  })

  it('1001 个键分为 1000+1，重复键只发送一次且逐项核验成功回执', async () => {
    const { provider, send } = await s3Provider()
    send.mockImplementation(async (command) => {
      if (!(command instanceof DeleteObjectsCommand))
        throw new Error('Unexpected command')
      return { Deleted: command.input.Delete?.Objects?.map(item => ({ Key: item.Key })) }
    })
    const keys = Array.from({ length: 1001 }, (_, index) => `key-${index}`)
    const result = await provider.file.deleteMany([...keys, keys[0]])
    expect(result).toEqual({ success: true, data: { deletedKeys: keys, failures: [] } })
    expect(send.mock.calls.map(([command]) => command instanceof DeleteObjectsCommand ? command.input.Delete?.Objects?.length : 0)).toEqual([1000, 1])
    await provider.close()
  })

  it('只重试 SlowDown 项，成功与 AccessDenied 项不再发送', async () => {
    const { provider, send } = await s3Provider()
    send.mockResolvedValueOnce({ Deleted: [{ Key: 'tenant/a' }], Errors: [{ Key: 'tenant/b', Code: 'AccessDenied' }, { Key: 'tenant/c', Code: 'SlowDown' }] })
      .mockResolvedValueOnce({ Deleted: [{ Key: 'tenant/c' }] })
    const result = await provider.file.deleteMany(['a', 'b', 'c'])
    expect(result).toMatchObject({ success: false, error: { ext: { deleteMany: { deletedKeys: ['a', 'c'], failures: [{ key: 'b', retryable: false }] } } } })
    expect(send.mock.calls.map(([command]) => command instanceof DeleteObjectsCommand ? command.input.Delete?.Objects : [])).toEqual([
      [{ Key: 'tenant/a' }, { Key: 'tenant/b' }, { Key: 'tenant/c' }],
      [{ Key: 'tenant/c' }],
    ])
    await provider.close()
  })

  it('瞬时失败最多尝试三次，耗尽后保留可重试失败项', async () => {
    const { provider, send } = await s3Provider()
    send.mockResolvedValue({ Errors: [{ Key: 'tenant/a', Code: 'InternalError' }] })
    expect(await provider.file.deleteMany(['a'])).toMatchObject({ success: false, error: { ext: { deleteMany: { deletedKeys: [], failures: [{ key: 'a', code: 'InternalError', retryable: true }] } } } })
    expect(send).toHaveBeenCalledTimes(3)
    await provider.close()
  })

  it('请求中断保留已完成批次，当前批次标记未知，后续批次未发送', async () => {
    const { provider, send } = await s3Provider()
    send.mockImplementationOnce(async (command) => {
      if (!(command instanceof DeleteObjectsCommand))
        throw new Error('Unexpected command')
      return { Deleted: command.input.Delete?.Objects?.map(item => ({ Key: item.Key })) }
    }).mockRejectedValueOnce(Object.assign(new Error('sensitive network payload'), { name: 'NetworkError' }))
    const result = await provider.file.deleteMany(Array.from({ length: 2001 }, (_, index) => `key-${index}`))
    expect(result.success).toBe(false)
    if (!result.success) {
      const summary = result.error.ext?.deleteMany
      expect(summary?.deletedKeys).toHaveLength(1000)
      expect(summary?.failures.filter(item => item.outcome === 'unknown')).toHaveLength(1000)
      expect(summary?.failures.at(-1)).toMatchObject({ key: 'key-2000', outcome: 'notAttempted' })
      expect(JSON.stringify(result)).not.toContain('sensitive network payload')
    }
    expect(send).toHaveBeenCalledTimes(2)
    await provider.close()
  })

  it.each([
    { Deleted: [{ Key: 'tenant/a' }] },
    { Deleted: [{ Key: 'tenant/a' }, { Key: 'tenant/a' }] },
    { Deleted: [{ Key: 'tenant/a' }, { Key: 'outside/b' }] },
    { Deleted: [{ Key: 'tenant/a' }], Errors: [{ Key: 'tenant/a', Code: 'AccessDenied' }] },
    { Deleted: [{ Key: 'tenant/a' }], Errors: [{ Code: 'AccessDenied' }] },
  ])('遗漏、重复或未知回执键不能伪成功：%j', async (response) => {
    const { provider, send } = await s3Provider()
    send.mockResolvedValue(response)
    expect(await provider.file.deleteMany(['a', 'b'])).toMatchObject({ success: false, error: { ext: { deleteMany: { deletedKeys: [], failures: [{ key: 'a', outcome: 'unknown' }, { key: 'b', outcome: 'unknown' }] } } } })
    expect(send).toHaveBeenCalledOnce()
    await provider.close()
  })

  it('目录删除传播逐项失败，不宣称目录已清空', async () => {
    const { provider, send } = await s3Provider()
    send.mockImplementation(async (command) => {
      if (command instanceof ListObjectsV2Command)
        return { Contents: [{ Key: 'tenant/dir/a', Size: 1 }] }
      return { Errors: [{ Key: 'tenant/dir/a', Code: 'AccessDenied' }] }
    })
    expect((await provider.dir.delete('dir/')).success).toBe(false)
    await provider.close()
  })
})

describe('local deleteMany', () => {
  it('有界并发，reject 不会被当作成功；空数组返回空进度', async () => {
    const root = path.resolve(import.meta.dirname, '../tmp')
    await mkdir(root, { recursive: true })
    const directory = await mkdtemp(path.join(root, 'delete-many-'))
    if (!directory.startsWith(`${root}${path.sep}`))
      throw new Error('Unexpected local test directory')
    const provider = storage
    try {
      expect((await provider.init({ type: 'local', root: directory })).success).toBe(true)
      expect(await provider.file.deleteMany([])).toEqual({ success: true, data: { deletedKeys: [], failures: [] } })
      let active = 0
      let peak = 0
      vi.spyOn(provider.file, 'delete').mockImplementation(async (key) => {
        if (key === 'bad')
          throw new Error('unexpected filesystem failure')
        active++
        peak = Math.max(peak, active)
        await new Promise(resolve => setTimeout(resolve, 1))
        active--
        return ok(undefined)
      })
      const result = await provider.file.deleteMany(['bad', ...Array.from({ length: 100 }, (_, index) => `key-${index}`)])
      expect(result).toMatchObject({ success: false, error: { ext: { deleteMany: { failures: [{ key: 'bad', outcome: 'failed' }] } } } })
      expect(peak).toBeLessThanOrEqual(32)
      if (!result.success)
        expect(result.error.ext?.deleteMany?.deletedKeys).toHaveLength(100)
    }
    finally {
      await provider.close()
      await rm(directory, { recursive: true, force: true })
    }
  })
})
