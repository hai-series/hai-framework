import type { StorageFunctions } from '@h-ai/storage'
import { Buffer } from 'node:buffer'
import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { storageAssets } from '../src/serv-storage-assets.js'

const CONTENT = Buffer.from([0x89, 0x50, 0x4E, 0x47])
const METADATA = {
  key: 'avatars/persona-1/avatar-1.png',
  size: CONTENT.length,
  contentType: 'image/png',
  lastModified: new Date('2026-01-01T00:00:00.000Z'),
  etag: '"avatar-etag"',
}

function createStorage(
  overrides: {
    head?: StorageFunctions['file']['head']
    get?: StorageFunctions['file']['get']
  } = {},
) {
  return {
    file: {
      head: overrides.head ?? vi.fn().mockResolvedValue({ success: true, data: METADATA }),
      get: overrides.get ?? vi.fn().mockResolvedValue({ success: true, data: CONTENT }),
    },
  }
}

function createApp(storage = createStorage()) {
  const app = new Hono()
  app.use('/api/v1/avatar-assets/*', storageAssets({
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
  it('返回白名单内的 Storage 文件及缓存响应头', async () => {
    const storage = createStorage()
    const app = createApp(storage)

    const response = await app.request('/api/v1/avatar-assets/avatars/persona-1/avatar-1.png')

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('content-length')).toBe(String(CONTENT.length))
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(response.headers.get('cross-origin-resource-policy')).toBe('cross-origin')
    expect(response.headers.get('etag')).toBe(METADATA.etag)
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([...CONTENT])
    expect(storage.file.head).toHaveBeenCalledWith(METADATA.key)
    expect(storage.file.get).toHaveBeenCalledWith(METADATA.key)
  })

  it('head 请求仅读取元数据，不下载文件内容', async () => {
    const storage = createStorage()
    const app = createApp(storage)

    const response = await app.request('/api/v1/avatar-assets/avatars/persona-1/avatar-1.png', {
      method: 'HEAD',
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-length')).toBe(String(CONTENT.length))
    expect(storage.file.get).not.toHaveBeenCalled()
  })

  it('匹配弱 ETag 时返回 304 且不下载文件内容', async () => {
    const storage = createStorage()
    const app = createApp(storage)

    const response = await app.request('/api/v1/avatar-assets/avatars/persona-1/avatar-1.png', {
      headers: { 'if-none-match': '"other", W/"avatar-etag"' },
    })

    expect(response.status).toBe(304)
    expect(storage.file.get).not.toHaveBeenCalled()
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
  })

  it('隐藏非白名单 MIME 与 Storage 读取失败', async () => {
    const wrongMimeStorage = createStorage({
      head: vi.fn().mockResolvedValue({
        success: true,
        data: { ...METADATA, contentType: 'image/svg+xml' },
      }),
    })
    const missingStorage = createStorage({
      head: vi.fn().mockResolvedValue({ success: false, error: { code: 'NOT_FOUND' } }),
    })

    expect((await createApp(wrongMimeStorage).request('/api/v1/avatar-assets/avatars/persona-1/avatar-1.png')).status).toBe(404)
    expect((await createApp(missingStorage).request('/api/v1/avatar-assets/avatars/persona-1/avatar-1.png')).status).toBe(404)
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
