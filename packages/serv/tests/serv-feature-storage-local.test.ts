/** 本地真实文件经 serv HTTP 与 typed client 的能力错误和跨实例分页契约。 */
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'
import { core } from '@h-ai/core'
import { HaiStorageError, storage } from '@h-ai/storage'
import { expect, it } from 'vitest'
import { createStorageProcedures } from '../src/features/serv-feature-storage.js'
import { serv } from '../src/serv-main.js'

/** 只删除本测试创建的直接临时目录；必须先关闭所有文件与 HTTP 句柄。 */
async function removeFixture(directory: string): Promise<void> {
  const target = resolve(directory)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hai-local-presign-'))
    throw new Error('Unexpected local presign cleanup target')
  await rm(target, { recursive: true, force: true })
}

it('local 能力经真实 HTTP 和 apiClient 保留预签名失败并支持游标续页', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hai-local-presign-'))
  const contract = apiContract.create({ storage: apiContract.storage })
  const client = apiClient.create(contract)
  let node: ReturnType<typeof serv.listen> | undefined
  try {
    expect((await storage.init({ type: 'local', root: directory })).success).toBe(true)
    const key = 'users/user-1/report.txt'
    expect((await storage.file.put(key, 'private local bytes')).success).toBe(true)
    const app = serv.createApp({
      contract,
      procedures: { storage: createStorageProcedures({ storage, authorize: ({ keys }) => keys.every(key => key.startsWith('users/user-1/')) }) },
      createContext: ({ request }) => ({
        request,
        requestId: 'local-presign-test',
        locale: 'en-US',
        logger: core.logger.child({ module: 'serv-test' }),
        session: { userId: 'user-1', roles: [], permissions: [] },
      }),
    })
    node = serv.listen(app, { host: '127.0.0.1', port: 0 })
    await once(node.server, 'listening')
    const address = node.server.address()
    if (!address || typeof address === 'string')
      throw new Error('Local presign HTTP server did not start')
    const baseUrl = `http://127.0.0.1:${address.port}/api/v1`
    expect((await client.init({ baseUrl, auth: { storage: apiClient.tokenStorage.memory() } })).success).toBe(true)

    for (const operation of ['download', 'upload']) {
      const response = await fetch(`${baseUrl}/storage/presigned-urls/${operation}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      })
      expect(response.status).toBe(200)
      const body: unknown = await response.json()
      expect(body).toMatchObject({ success: false, error: { code: HaiStorageError.UNSUPPORTED_OPERATION.code } })
      expect(body).not.toHaveProperty('data')
    }
    for (const operation of ['createDownload', 'createUpload'] as const) {
      const result = await client.storage.presignedUrls[operation]({ key })
      expect(result.success).toBe(false)
      expect(result).not.toHaveProperty('data')
      if (!result.success)
        expect(result.error.code).toBe(HaiStorageError.UNSUPPORTED_OPERATION.code)
    }
    const metadata = await client.storage.files.getMetadata({ key })
    expect(metadata.success).toBe(true)
    if (metadata.success)
      expect(metadata.data.key).toBe(key)
    const content = await storage.file.get(key)
    expect(content.success && content.data.toString()).toBe('private local bytes')
    expect(storage.presign.publicUrl(key)).toBeNull()

    const prefix = 'users/user-1/page/'
    for (const name of ['a.txt', 'b/first.txt', 'b/second.txt', 'c.txt', 'd.txt'])
      expect((await storage.file.put(prefix + name, name)).success).toBe(true)
    const first = await client.storage.files.list({ prefix, delimiter: '/', maxKeys: 2 })
    expect(first.success).toBe(true)
    if (!first.success)
      return
    expect(first.data.files.map(file => file.key)).toEqual([`${prefix}a.txt`])
    expect(first.data.commonPrefixes).toEqual([`${prefix}b/`])
    expect(first.data.isTruncated).toBe(true)
    expect((await storage.close()).success).toBe(true)
    expect((await storage.init({ type: 'local', root: directory })).success).toBe(true)
    const second = await client.storage.files.list({ prefix, delimiter: '/', maxKeys: 2, continuationToken: first.data.nextContinuationToken })
    expect(second.success).toBe(true)
    if (second.success) {
      expect(second.data.files.map(file => file.key)).toEqual([`${prefix}c.txt`, `${prefix}d.txt`])
      expect(second.data.commonPrefixes).toEqual([])
      expect(second.data.isTruncated).toBe(false)
      expect(second.data.nextContinuationToken).toBeUndefined()
    }
  }
  finally {
    await client.close()
    await node?.close()
    const closed = await storage.close()
    await removeFixture(directory)
    expect(closed.success).toBe(true)
  }
})
