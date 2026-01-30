/**
 * =============================================================================
 * @hai/kit - Storage Module 测试
 * =============================================================================
 */

import type { RequestEvent } from '@sveltejs/kit'
import type { StorageEndpointConfig } from '../src/modules/storage/storage-types.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createStorageEndpoint } from '../src/modules/storage/storage-handle.js'

/**
 * 创建模拟的 Storage 服务
 */
function createMockStorage() {
  return {
    put: vi.fn(),
    upload: vi.fn(),
    getPresignedUploadUrl: vi.fn(),
    getPresignedDownloadUrl: vi.fn(),
    list: vi.fn(),
    delete: vi.fn(),
  }
}

/**
 * 创建模拟的 RequestEvent
 */
function createMockEvent(
  path = '/api/storage',
  options: {
    method?: string
    searchParams?: Record<string, string>
    body?: FormData | string
    contentType?: string
    user?: { id: string }
  } = {},
): RequestEvent {
  const url = new URL(`http://localhost${path}`)

  if (options.searchParams) {
    Object.entries(options.searchParams).forEach(([key, value]) => {
      url.searchParams.set(key, value)
    })
  }

  const headers: Record<string, string> = {}
  if (options.contentType) {
    headers['content-type'] = options.contentType
  }

  return {
    request: new Request(url, {
      method: options.method || 'GET',
      headers,
      body: options.body,
    }),
    url,
    locals: options.user ? { user: options.user } : {},
    params: {},
    route: { id: path },
    getClientAddress: () => '127.0.0.1',
  } as unknown as RequestEvent
}

describe('createStorageEndpoint', () => {
  let mockStorage: ReturnType<typeof createMockStorage>
  let endpoint: ReturnType<typeof createStorageEndpoint>

  beforeEach(() => {
    mockStorage = createMockStorage()
    endpoint = createStorageEndpoint({
      storage: mockStorage as unknown as StorageEndpointConfig['storage'],
      bucket: 'test-bucket',
      allowedTypes: ['image/*', 'application/pdf'],
      maxFileSize: 10 * 1024 * 1024,
    })
  })

  describe('gET - 预签名 URL', () => {
    it('应该生成预签名上传 URL', async () => {
      mockStorage.getPresignedUploadUrl.mockResolvedValue({
        success: true,
        data: { url: 'https://storage.example.com/upload?signed=true' },
      })

      const event = createMockEvent('/api/storage', {
        searchParams: {
          action: 'presign',
          filename: 'test.jpg',
          contentType: 'image/jpeg',
        },
      })

      const response = await endpoint.get(event)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.url).toBe('https://storage.example.com/upload?signed=true')
      expect(data.key).toContain('test.jpg')
      expect(data.bucket).toBe('test-bucket')
    })

    it('应该在缺少 filename 时返回 400', async () => {
      const event = createMockEvent('/api/storage', {
        searchParams: { action: 'presign' },
      })

      const response = await endpoint.get(event)

      expect(response.status).toBe(400)
    })

    it('应该获取文件列表', async () => {
      mockStorage.list.mockResolvedValue({
        success: true,
        data: [
          { key: 'file1.jpg', size: 1024 },
          { key: 'file2.pdf', size: 2048 },
        ],
      })

      const event = createMockEvent('/api/storage', {
        searchParams: { action: 'list', prefix: 'uploads/' },
      })

      const response = await endpoint.get(event)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.files).toHaveLength(2)
      expect(mockStorage.list).toHaveBeenCalledWith('test-bucket', {
        prefix: 'uploads/',
        maxKeys: 100,
      })
    })

    it('应该生成下载 URL', async () => {
      mockStorage.getPresignedDownloadUrl.mockResolvedValue({
        success: true,
        data: { url: 'https://storage.example.com/download?signed=true' },
      })

      const event = createMockEvent('/api/storage', {
        searchParams: { key: 'uploads/test.jpg' },
      })

      const response = await endpoint.get(event)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.url).toBe('https://storage.example.com/download?signed=true')
    })
  })

  describe('pOST - 文件上传', () => {
    it('应该直接上传文件', async () => {
      mockStorage.put.mockResolvedValue({
        success: true,
        data: { key: 'uploads/test.jpg', url: 'https://storage.example.com/test.jpg' },
      })

      const formData = new FormData()
      const file = new File(['test content'], 'test.jpg', { type: 'image/jpeg' })
      formData.append('file', file)

      const event = createMockEvent('/api/storage', {
        method: 'POST',
        body: formData,
      })

      const response = await endpoint.post(event)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.key).toBeDefined()
    })

    it('应该拒绝超大文件', async () => {
      // 创建一个配置了小文件限制的端点
      const smallEndpoint = createStorageEndpoint({
        storage: mockStorage as unknown as StorageEndpointConfig['storage'],
        bucket: 'test-bucket',
        maxFileSize: 100, // 100 bytes
        allowedTypes: ['*/*'],
      })

      const formData = new FormData()
      // 创建一个大文件
      const largeContent = Array.from({ length: 200 }).fill('a').join('')
      const file = new File([largeContent], 'large.txt', { type: 'text/plain' })
      formData.append('file', file)

      const event = createMockEvent('/api/storage', {
        method: 'POST',
        body: formData,
      })

      const response = await smallEndpoint.post(event)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('文件大小')
    })

    it('应该拒绝不允许的文件类型', async () => {
      const formData = new FormData()
      const file = new File(['test'], 'script.exe', { type: 'application/x-msdownload' })
      formData.append('file', file)

      const event = createMockEvent('/api/storage', {
        method: 'POST',
        body: formData,
      })

      const response = await endpoint.post(event)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('文件类型')
    })
  })

  describe('dELETE - 文件删除', () => {
    it('应该删除文件', async () => {
      mockStorage.delete.mockResolvedValue({ success: true })

      const event = createMockEvent('/api/storage', {
        method: 'DELETE',
        searchParams: { key: 'uploads/test.jpg' },
      })

      const response = await endpoint.delete(event)

      expect(response.status).toBe(200)
      expect(mockStorage.delete).toHaveBeenCalledWith('test-bucket', 'uploads/test.jpg')
    })

    it('应该在缺少 key 时返回 400', async () => {
      const event = createMockEvent('/api/storage', {
        method: 'DELETE',
      })

      const response = await endpoint.delete(event)

      expect(response.status).toBe(400)
    })
  })

  describe('认证检查', () => {
    it('应该在 requireAuth 时检查用户', async () => {
      const authEndpoint = createStorageEndpoint({
        storage: mockStorage as unknown as StorageEndpointConfig['storage'],
        bucket: 'test-bucket',
        requireAuth: true,
      })

      const event = createMockEvent('/api/storage', {
        searchParams: { action: 'list' },
      })

      const response = await authEndpoint.get(event)

      expect(response.status).toBe(401)
    })

    it('应该允许已认证用户', async () => {
      mockStorage.list.mockResolvedValue({
        success: true,
        data: [],
      })

      const authEndpoint = createStorageEndpoint({
        storage: mockStorage as unknown as StorageEndpointConfig['storage'],
        bucket: 'test-bucket',
        requireAuth: true,
      })

      const event = createMockEvent('/api/storage', {
        searchParams: { action: 'list' },
        user: { id: 'user-1' },
      })

      const response = await authEndpoint.get(event)

      expect(response.status).toBe(200)
    })
  })
})
