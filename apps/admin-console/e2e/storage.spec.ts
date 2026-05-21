/**
 * =============================================================================
 * E2E 测试 - 头像上传接口
 * =============================================================================
 *
 * 覆盖 /api/auth/profile/avatar 的核心场景：
 * - 成功上传后返回可访问 URL
 * - 类型校验
 * - 大小校验
 *
 * 说明：优先使用 storage provider 的公开 URL；本地 provider 会回退到
 * `/api/storage/[...key]` 公开读取端点。
 * =============================================================================
 */

import { Buffer } from 'node:buffer'
import { expect, test } from '@playwright/test'
import { registerAndLoginViaApi } from './helpers'

// ---------------------------------------------------------------------------
// 头像上传 API
// ---------------------------------------------------------------------------
test.describe('Avatar Upload API', () => {
  test('上传头像后返回公开可访问 URL', async ({ request }) => {
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

    // 返回的 URL 不仅要长得像 URL，还必须真的能访问到图片内容
    expect(String(avatarUrl)).toMatch(/^https?:\/\//)

    const avatarRes = await request.get(String(avatarUrl))
    expect(avatarRes.ok(), `avatar fetch status=${avatarRes.status()} url=${String(avatarUrl)}`).toBeTruthy()
    expect(avatarRes.headers()['content-type']).toMatch(/^image\//)
    expect((await avatarRes.body()).byteLength).toBeGreaterThan(0)
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
