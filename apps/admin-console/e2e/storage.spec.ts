/**
 * =============================================================================
 * E2E 测试 - 存储文件服务路由
 * =============================================================================
 *
 * 覆盖 /api/storage/[...key] 路由的核心场景：文件访问、安全校验、404 处理。
 * 通过先上传头像再访问对应 URL 来验证完整的上传→读取链路。
 * =============================================================================
 */

import { Buffer } from 'node:buffer'
import { expect, test } from '@playwright/test'
import { registerAndLoginViaApi } from './helpers'

// ---------------------------------------------------------------------------
// 存储文件服务 API
// ---------------------------------------------------------------------------
test.describe('Storage File Serving', () => {
  test('上传头像后可通过存储路由访问文件', async ({ request }) => {
    await registerAndLoginViaApi(request, 'storage')

    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5n0q8AAAAASUVORK5CYII=',
      'base64',
    )

    // 上传头像
    const uploadRes = await request.post('/api/auth/profile/avatar', {
      multipart: {
        file: {
          name: 'avatar.png',
          mimeType: 'image/png',
          buffer: pngBuffer,
        },
      },
    })
    expect(uploadRes.ok()).toBeTruthy()
    const uploadBody = await uploadRes.json()
    const avatarUrl = uploadBody.data?.avatar ?? uploadBody.avatar

    // 验证返回 URL 格式（本地存储为 /api/storage/avatars/...，S3 为完整 URL）
    expect(String(avatarUrl)).toMatch(/\/api\/storage\/avatars\/|^https?:\/\//)

    // 如果是本地存储路由，验证可以获取到文件
    if (String(avatarUrl).startsWith('/api/storage/')) {
      const fileRes = await request.get(String(avatarUrl))
      expect(fileRes.ok()).toBeTruthy()
      expect(fileRes.headers()['content-type']).toContain('image/png')

      // 验证不可变缓存头
      const cacheControl = fileRes.headers()['cache-control'] ?? ''
      expect(cacheControl).toContain('immutable')
    }
  })

  test('访问不存在的存储文件返回 404', async ({ request }) => {
    await registerAndLoginViaApi(request, 'storage')

    const res = await request.get('/api/storage/nonexistent/file.png')
    expect(res.status()).toBe(404)
  })

  test('路径穿越攻击被拒绝', async ({ request }) => {
    await registerAndLoginViaApi(request, 'storage')

    // 尝试使用 .. 进行路径穿越
    const res = await request.get('/api/storage/avatars/../../etc/passwd')
    expect(res.status()).toBe(400)
  })

  test('上传不同格式头像文件返回正确 Content-Type', async ({ request }) => {
    await registerAndLoginViaApi(request, 'storage')

    // 使用 1x1 JPEG（最小合法 JPEG）
    const jpegBuffer = Buffer.from(
      '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AKwA=',
      'base64',
    )

    const uploadRes = await request.post('/api/auth/profile/avatar', {
      multipart: {
        file: {
          name: 'avatar.jpg',
          mimeType: 'image/jpeg',
          buffer: jpegBuffer,
        },
      },
    })
    expect(uploadRes.ok()).toBeTruthy()
    const uploadBody = await uploadRes.json()
    const avatarUrl = uploadBody.data?.avatar ?? uploadBody.avatar

    // 如果是本地存储路由，验证 JPEG Content-Type
    if (String(avatarUrl).startsWith('/api/storage/')) {
      const fileRes = await request.get(String(avatarUrl))
      expect(fileRes.ok()).toBeTruthy()
      expect(fileRes.headers()['content-type']).toContain('image/jpeg')
    }
  })

  test('不支持的文件类型被拒绝', async ({ request }) => {
    await registerAndLoginViaApi(request, 'storage')

    const textBuffer = Buffer.from('Hello, world!', 'utf-8')

    const res = await request.post('/api/auth/profile/avatar', {
      multipart: {
        file: {
          name: 'test.txt',
          mimeType: 'text/plain',
          buffer: textBuffer,
        },
      },
    })
    expect(res.status()).toBe(400)
  })

  test('超大文件被拒绝', async ({ request }) => {
    await registerAndLoginViaApi(request, 'storage')

    // 构造一个超过 2MB 的 buffer
    const largeBuffer = Buffer.alloc(2 * 1024 * 1024 + 1)

    const res = await request.post('/api/auth/profile/avatar', {
      multipart: {
        file: {
          name: 'big.png',
          mimeType: 'image/png',
          buffer: largeBuffer,
        },
      },
    })
    expect(res.status()).toBe(400)
  })
})
