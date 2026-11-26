import type { StorageFileRead, StorageFunctions } from '@h-ai/storage'
import { Buffer } from 'node:buffer'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { STORAGE_PROXY_MAX_FILE_BYTES } from '@h-ai/api-contract'
import { core, HaiCommonError } from '@h-ai/core'
import { storage as localStorage } from '@h-ai/storage'
import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { serv } from '../src/serv-main.js'

const CONTENT = Buffer.from([0x89, 0x50, 0x4E, 0x47])
const METADATA = {
  key: 'avatars/persona-1/avatar-1.png',
  size: CONTENT.length,
  contentType: 'image/png',
  lastModified: new Date('2026-01-01T00:00:00.000Z'),
  etag: '"avatar-etag"',
}

function createRead(overrides: Partial<StorageFileRead> = {}): StorageFileRead {
  return {
    metadata: METADATA,
    stream: {
      [Symbol.asyncIterator]: vi.fn(async function* () {
        yield CONTENT.subarray(0, 2)
        yield CONTENT.subarray(2)
      }),
    },
    close: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function createStorage(
  overrides: {
    head?: StorageFunctions['file']['head']
    getStreamWithMetadata?: StorageFunctions['file']['getStreamWithMetadata']
  } = {},
) {
  return {
    file: {
      head: overrides.head ?? vi.fn().mockResolvedValue(core.ok(METADATA)),
      getStreamWithMetadata: overrides.getStreamWithMetadata ?? vi.fn().mockResolvedValue(core.ok(createRead())),
    },
  }
}

function createApp(storage = createStorage()) {
  const app = new Hono()
  app.use('*', (c, next) => {
    c.header('X-Fixture', 'prepared')
    return next()
  })
  app.use('/api/v1/avatar-assets/*', serv.storageAssets({
    storage,
    pathPrefix: '/api/v1/avatar-assets/',
    keyPattern: /^avatars\/[\w-]{1,128}\/[\w-]{1,128}\.(?:jpg|png|webp)$/i,
    allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
    cacheControl: 'public, max-age=31536000, immutable',
    crossOriginResourcePolicy: 'cross-origin',
  }))
  return app
}

describe('serv.storageAssets', () => {
  it('用真实本地 Storage 返回同一对象的正文和元数据', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hai-serv-storage-assets-'))
    try {
      expect((await localStorage.init({ type: 'local', root })).success).toBe(true)
      expect((await localStorage.file.put(METADATA.key, CONTENT, {
        contentType: METADATA.contentType,
      })).success).toBe(true)

      const app = createApp(localStorage)
      const path = `/api/v1/avatar-assets/${METADATA.key}`
      const response = await app.request(path)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe(METADATA.contentType)
      expect(response.headers.get('content-length')).toBe(String(CONTENT.length))
      expect(Buffer.from(await response.arrayBuffer())).toEqual(CONTENT)
      const etag = response.headers.get('etag')
      expect(etag).toBeTruthy()
      if (etag !== null) {
        expect((await app.request(path, {
          headers: { 'if-none-match': etag },
        })).status).toBe(304)
      }
    }
    finally {
      await localStorage.close()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('返回白名单内的 Storage 文件及缓存响应头', async () => {
    const read = createRead({
      metadata: { ...METADATA, size: 0 },
    })
    const storage = createStorage({
      getStreamWithMetadata: vi.fn().mockResolvedValue(core.ok(read)),
    })
    const app = createApp(storage)

    const response = await app.request('/api/v1/avatar-assets/avatars/persona-1/avatar-1.png')

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('content-length')).toBe(String(CONTENT.length))
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(response.headers.get('cross-origin-resource-policy')).toBe('cross-origin')
    expect(response.headers.get('etag')).toBe(METADATA.etag)
    expect([
      ...new Uint8Array(await response.arrayBuffer()),
    ]).toEqual([...CONTENT])
    expect(storage.file.head).not.toHaveBeenCalled()
    expect(storage.file.getStreamWithMetadata).toHaveBeenCalledExactlyOnceWith(METADATA.key, {
      signal: expect.any(AbortSignal),
    })
    expect(read.close).toHaveBeenCalledTimes(1)
  })

  it('同键被覆盖时，GET 响应头和正文均取自本次读取', async () => {
    const read = createRead()
    const storage = createStorage({
      head: vi.fn().mockResolvedValue(core.ok({
        ...METADATA,
        size: 100,
        contentType: 'image/webp',
        etag: '"previous"',
      })),
      getStreamWithMetadata: vi.fn().mockResolvedValue(core.ok(read)),
    })
    const oldGet = vi.fn().mockResolvedValue(core.ok(CONTENT))
    const previousReader = {
      file: { ...storage.file, get: oldGet },
    }
    const response = await createApp(previousReader).request('/api/v1/avatar-assets/avatars/persona-1/avatar-1.png')

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe(METADATA.contentType)
    expect(response.headers.get('etag')).toBe(METADATA.etag)
    expect(response.headers.get('content-length')).toBe(String(CONTENT.length))
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array(CONTENT))
    expect(storage.file.head).not.toHaveBeenCalled()
    expect(oldGet).not.toHaveBeenCalled()
    expect(read.close).toHaveBeenCalledTimes(1)
  })

  it('head 请求仅读取元数据，不下载文件内容', async () => {
    const storage = createStorage()
    const app = createApp(storage)

    const response = await app.request('/api/v1/avatar-assets/avatars/persona-1/avatar-1.png', {
      method: 'HEAD',
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-length')).toBe(String(CONTENT.length))
    expect(storage.file.head).toHaveBeenCalledExactlyOnceWith(METADATA.key)
    expect(storage.file.getStreamWithMetadata).not.toHaveBeenCalled()
  })

  it('文件元数据超过公开 HTTP 容量时，GET 和 HEAD 都拒绝且不下载内容', async () => {
    const metadata = { ...METADATA, size: STORAGE_PROXY_MAX_FILE_BYTES + 1 }
    const read = createRead({ metadata })
    const app = createApp(createStorage({
      head: vi.fn().mockResolvedValue(core.ok(metadata)),
      getStreamWithMetadata: vi.fn().mockResolvedValue(core.ok(read)),
    }))
    for (const method of ['GET', 'HEAD']) {
      const response = await app.request('/api/v1/avatar-assets/avatars/persona-1/avatar-1.png', { method })
      expect(response.status).toBe(404)
      expect(response.headers.get('cache-control')).toBe('no-store')
    }
    expect(read.stream[Symbol.asyncIterator]).not.toHaveBeenCalled()
    expect(read.close).toHaveBeenCalledTimes(1)
  })

  it('读取时按实际收到的字节数检查文件容量并释放读取', async () => {
    const read = createRead({
      stream: {
        async* [Symbol.asyncIterator]() {
          yield new Uint8Array(STORAGE_PROXY_MAX_FILE_BYTES)
          yield new Uint8Array(1)
        },
      },
    })
    const app = createApp(createStorage({
      getStreamWithMetadata: vi.fn().mockResolvedValue(core.ok(read)),
    }))
    const response = await app.request('/api/v1/avatar-assets/avatars/persona-1/avatar-1.png')

    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.text()).toBe('')
    expect(read.close).toHaveBeenCalledTimes(1)
  })

  it('匹配弱 ETag 时返回 304 且不下载文件内容', async () => {
    const read = createRead()
    const storage = createStorage({
      getStreamWithMetadata: vi.fn().mockResolvedValue(core.ok(read)),
    })
    const app = createApp(storage)

    const response = await app.request('/api/v1/avatar-assets/avatars/persona-1/avatar-1.png', {
      headers: { 'if-none-match': '"other", W/"avatar-etag"' },
    })

    expect(response.status).toBe(304)
    expect(await response.text()).toBe('')
    expect(storage.file.head).not.toHaveBeenCalled()
    expect(read.stream[Symbol.asyncIterator]).not.toHaveBeenCalled()
    expect(read.close).toHaveBeenCalledTimes(1)
  })

  it.each([
    '/api/v1/avatar-assets/%2e%2e/secrets.txt',
    '/api/v1/avatar-assets/avatars/persona-1/avatar-1.svg',
    '/api/v1/avatar-assets/avatars%5cpersona-1%5cavatar-1.png',
  ])('拒绝非法或非白名单 key：%s', async (path) => {
    const storage = createStorage()
    const app = createApp(storage)

    const response = await app.request(path)

    expect(response.status).toBe(404)
    expect(storage.file.head).not.toHaveBeenCalled()
    expect(storage.file.getStreamWithMetadata).not.toHaveBeenCalled()
  })

  it('隐藏非白名单 MIME 与 Storage 读取失败', async () => {
    const read = createRead({
      metadata: { ...METADATA, contentType: 'application/octet-stream' },
    })
    const wrongMimeStorage = createStorage({
      getStreamWithMetadata: vi.fn().mockResolvedValue(core.ok(read)),
    })
    const missingStorage = createStorage({
      getStreamWithMetadata: vi.fn().mockResolvedValue(core.err(HaiCommonError.NOT_FOUND, 'Missing resource')),
    })

    expect((await createApp(wrongMimeStorage).request('/api/v1/avatar-assets/avatars/persona-1/avatar-1.png')).status).toBe(404)
    expect((await createApp(missingStorage).request('/api/v1/avatar-assets/avatars/persona-1/avatar-1.png')).status).toBe(404)
    expect(read.stream[Symbol.asyncIterator]).not.toHaveBeenCalled()
    expect(read.close).toHaveBeenCalledTimes(1)
  })

  it('取消请求时中止正文读取，释放当前读取并隐藏错误', async () => {
    const controller = new AbortController()
    const read = createRead()
    const getStreamWithMetadata = vi.fn<StorageFunctions['file']['getStreamWithMetadata']>()
      .mockImplementation(async (_key, options) => core.ok({
        ...read,
        stream: {
          async* [Symbol.asyncIterator]() {
            yield CONTENT.subarray(0, 2)
            controller.abort()
            options?.signal?.throwIfAborted()
            yield CONTENT.subarray(2)
          },
        },
      }))
    const response = await createApp(createStorage({ getStreamWithMetadata }))
      .request('/api/v1/avatar-assets/avatars/persona-1/avatar-1.png', { signal: controller.signal })

    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.text()).toBe('')
    expect(read.close).toHaveBeenCalledTimes(1)
  })

  it('释放读取失败时仍隐藏 Storage 错误', async () => {
    const read = createRead({
      close: vi.fn().mockRejectedValue(new Error('Failed to release resource')),
    })
    const storage = createStorage({
      getStreamWithMetadata: vi.fn().mockResolvedValue(core.ok(read)),
    })
    const response = await createApp(storage).request('/api/v1/avatar-assets/avatars/persona-1/avatar-1.png')

    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.has('etag')).toBe(false)
    expect(response.headers.has('content-length')).toBe(false)
    expect(await response.text()).toBe('')
  })

  it('拒绝 GET 与 HEAD 之外的方法', async () => {
    const app = createApp()

    const response = await app.request('/api/v1/avatar-assets/avatars/persona-1/avatar-1.png', {
      method: 'POST',
    })

    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('GET, HEAD')
  })
})
