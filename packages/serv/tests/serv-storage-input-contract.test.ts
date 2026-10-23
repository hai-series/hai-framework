/** 真实 TCP HTTP → 公开 typed client → Local 文件系统的输入边界与授权验证。 */
import { once } from 'node:events'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { apiClient, HaiApiClientError } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'
import { core, HaiCommonError } from '@h-ai/core'
import { storage } from '@h-ai/storage'
import { STORAGE_DELETE_MAX_KEYS } from '@h-ai/storage/schemas'
import { expect, it, vi } from 'vitest'
import { createStorageProcedures } from '../src/features/serv-feature-storage.js'
import { serv } from '../src/serv-main.js'

it('无效输入在授权和 Provider 前失败，允许的 1000 项真实删除完成，跨用户仍拒绝', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hai-storage-contract-'))
  const contract = apiContract.create({ storage: apiContract.storage })
  const client = apiClient.create(contract)
  const authorize = vi.fn(({ keys }: { keys: readonly string[] }) => keys.every(key => key.startsWith('users/u1/')))
  let node: ReturnType<typeof serv.listen> | undefined
  try {
    expect((await storage.init({ type: 'local', root: directory })).success).toBe(true)
    const app = serv.createApp({
      contract,
      procedures: { storage: createStorageProcedures({ storage, authorize }) },
      createContext: ({ request }) => ({ request, requestId: 'storage-input', locale: 'en-US', logger: core.logger.child({ module: 'serv-test' }), session: { userId: 'u1', roles: [], permissions: [] } }),
    })
    node = serv.listen(app, { host: '127.0.0.1', port: 0 })
    await once(node.server, 'listening')
    const address = node.server.address()
    if (!address || typeof address === 'string')
      throw new Error('Storage input HTTP server did not start')
    const baseUrl = `http://127.0.0.1:${address.port}/api/v1`
    expect((await client.init({ baseUrl, auth: { storage: apiClient.tokenStorage.memory() } })).success).toBe(true)

    for (const key of ['../secret', '/absolute', 'users/u1/a\\b', `users/u1/${'报'.repeat(342)}`]) {
      const result = await client.storage.files.getMetadata({ key })
      expect(result).toMatchObject({ success: false, error: { code: HaiApiClientError.VALIDATION_FAILED.code, cause: { status: 400 } } })
    }
    const tooMany = await client.storage.files.deleteMany({ keys: Array.from({ length: STORAGE_DELETE_MAX_KEYS + 1 }, (_, i) => `users/u1/${i}`) })
    expect(tooMany).toMatchObject({ success: false, error: { code: HaiApiClientError.VALIDATION_FAILED.code, cause: { status: 400 } } })
    const unsupported = await fetch(`${baseUrl}/storage/presigned-urls/upload`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'users/u1/a', contentLength: 100 }) })
    expect(unsupported.status).toBe(400)
    expect(authorize).not.toHaveBeenCalled()

    await mkdir(join(directory, 'users', 'u1'), { recursive: true })
    const keys = Array.from({ length: STORAGE_DELETE_MAX_KEYS }, (_, i) => `users/u1/${i}.txt`)
    // 每轮最多 32 个文件句柄，测试不会通过不受限并发掩盖 Provider 边界。
    for (let i = 0; i < keys.length; i += 32)
      await Promise.all(keys.slice(i, i + 32).map(key => writeFile(join(directory, key), 'fixture')))
    expect(await readdir(join(directory, 'users', 'u1'))).toHaveLength(STORAGE_DELETE_MAX_KEYS)
    const deleted = await client.storage.files.deleteMany({ keys })
    expect(deleted.success).toBe(true)
    if (deleted.success) {
      expect(deleted.data.deletedKeys).toHaveLength(STORAGE_DELETE_MAX_KEYS)
      expect(deleted.data.failures).toEqual([])
    }
    expect(await readdir(join(directory, 'users', 'u1'))).toEqual([])
    expect(authorize).toHaveBeenCalledOnce()
    const forbidden = await client.storage.files.getMetadata({ key: 'users/u2/private.txt' })
    expect(forbidden).toMatchObject({ success: false, error: { code: HaiCommonError.FORBIDDEN.code } })
  }
  finally {
    await client.close()
    await node?.close()
    const closed = await storage.close()
    const target = resolve(directory)
    expect(dirname(target)).toBe(resolve(tmpdir()))
    expect(basename(target).startsWith('hai-storage-contract-')).toBe(true)
    await rm(target, { recursive: true, force: true })
    expect(closed.success).toBe(true)
  }
}, 30000)
