import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apiClient } from '@h-ai/api-client'
import { apiContract, STORAGE_PROXY_MAX_FILE_BYTES } from '@h-ai/api-contract'
import { core, HaiCommonError } from '@h-ai/core'
import { HaiStorageError, storage } from '@h-ai/storage'
import { expect, it } from 'vitest'
import { serv } from '../src/serv-main.js'

it('本地存储经 typed client 中转文件并限制对象所有权、覆盖和正文大小', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hai-storage-transfer-'))
  const contract = apiContract.create({ storageTransfer: apiContract.extensions.storage })
  const client = apiClient.create(contract)
  try {
    expect((await storage.init({ type: 'local', root: directory })).success).toBe(true)
    const { upload, download } = contract.storageTransfer.files
    const app = serv.createApp({
      contract,
      procedures: {
        storageTransfer: serv.createStorageExtensionProcedures({
          storage,
          authorize: ({ context, keys }) => keys[0].startsWith(`users/${context.session.userId}/`),
        }),
      },
      transportRoutes: [
        { procedure: upload, maxRequestBytes: STORAGE_PROXY_MAX_FILE_BYTES + 1024 },
        { procedure: download, maxRequestBytes: 0 },
      ],
      createContext: ({ request }) => ({
        request,
        requestId: 'local-storage-transfer',
        locale: 'en-US',
        logger: core.logger.child({ module: 'serv-test' }),
        ...(request.headers.get('authorization') === 'Bearer storage-fixture-access'
          ? {
              session: { userId: 'owner', roles: [], permissions: [] },
            }
          : {}),
      }),
    })
    const baseUrl = 'https://storage.example/api/v1'
    let downloadHeaders: Headers | undefined
    expect((await client.init({
      baseUrl,
      headers: { authorization: 'Bearer storage-fixture-access' },
      fetch: async (input, init) => {
        const request = new Request(input, init)
        const response = await app.fetch(request)
        if (new URL(request.url).pathname === '/api/v1/storage/files/download')
          downloadHeaders = response.headers
        return response
      },
    })).success).toBe(true)
    const { files } = client.storageTransfer
    const key = 'users/owner/report.txt'
    const file = new File(['quarterly report'], 'upload.txt', { type: 'text/plain' })
    expect(await files.upload({ key, file })).toMatchObject({
      success: true,
      data: { key, size: file.size, contentType: 'text/plain' },
    })
    expect(await files.upload({ key, file })).toMatchObject({
      success: false,
      error: { code: HaiStorageError.ALREADY_EXISTS.code },
    })
    const result = await files.download({ key })
    expect(result).toBeInstanceOf(File)
    if (!(result instanceof File))
      throw new TypeError(result.error.message)
    expect(result.name).toBe('report.txt')
    expect(await result.text()).toBe('quarterly report')
    expect(downloadHeaders?.get('cache-control')).toBe('no-store')
    expect(downloadHeaders?.get('x-content-type-options')).toBe('nosniff')
    expect(downloadHeaders?.get('content-disposition')).toMatch(/^attachment/)

    const foreignKey = 'users/owner-other/report.txt'
    expect(await files.upload({ key: foreignKey, file })).toMatchObject({
      success: false,
      error: { code: HaiCommonError.FORBIDDEN.code },
    })
    expect(await files.download({ key: foreignKey })).toMatchObject({
      success: false,
      error: { code: HaiCommonError.FORBIDDEN.code },
    })
    const guestResponse = await app.fetch(new Request(`${baseUrl}/storage/files/download?key=${encodeURIComponent(key)}`))
    expect(guestResponse.status).toBe(401)

    const tooLargeKey = 'users/owner/too-large.txt'
    const tooLarge = new Uint8Array(STORAGE_PROXY_MAX_FILE_BYTES + 1)
    expect((await storage.file.put(tooLargeKey, tooLarge)).success).toBe(true)
    expect(await files.download({ key: tooLargeKey })).toMatchObject({
      success: false,
      error: { httpStatus: 413 },
    })
    const uploadBody = new FormData()
    uploadBody.set('key', 'users/owner/oversize.txt')
    uploadBody.set('file', new File([tooLarge], 'oversize.txt'))
    const uploadResponse = await app.fetch(new Request(`${baseUrl}/storage/files/upload`, {
      method: 'POST',
      headers: { authorization: 'Bearer storage-fixture-access' },
      body: uploadBody,
    }))
    expect(uploadResponse.status).toBe(400)
    expect(await storage.file.exists('users/owner/oversize.txt')).toMatchObject({ success: true, data: false })
  }
  finally {
    await client.close()
    await storage.close()
    await rm(directory, { recursive: true, force: true })
  }
})
