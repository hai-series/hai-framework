/**
 * @h-ai/storage — 签名 URL 操作测试
 */

import { describe, expect, it } from 'vitest'
import { HaiStorageError, storage } from '../src/index.js'
import { defineS3StorageSuites, defineStorageSuite, localStorageEnv } from './helpers/storage-test-suite.js'

describe('storage.presign', () => {
  const defineCommon = (label: 's3') => {
    // =========================================================================
    // getUrl
    // =========================================================================

    it(`${label}: getUrl 应返回包含 key 的签名 URL`, async () => {
      const result = await storage.presign.getUrl('test-file.txt')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toContain('test-file.txt')
      }
    })

    it(`${label}: getUrl 带 expiresIn 应成功返回 URL`, async () => {
      const result = await storage.presign.getUrl('a.txt', { expiresIn: 60 })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(typeof result.data).toBe('string')
        expect(result.data.length).toBeGreaterThan(0)
      }
    })

    it(`${label}: getUrl 带 responseContentType 应成功`, async () => {
      const result = await storage.presign.getUrl('doc.pdf', {
        expiresIn: 3600,
        responseContentType: 'application/pdf',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toContain('doc.pdf')
      }
    })

    it(`${label}: getUrl 带 responseContentDisposition 应成功`, async () => {
      const result = await storage.presign.getUrl('report.xlsx', {
        expiresIn: 3600,
        responseContentDisposition: 'attachment; filename="report.xlsx"',
      })
      expect(result.success).toBe(true)
    })

    // =========================================================================
    // putUrl
    // =========================================================================

    it(`${label}: putUrl 应返回包含 key 的签名 URL`, async () => {
      const result = await storage.presign.putUrl('upload.txt')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toContain('upload.txt')
      }
    })

    it(`${label}: putUrl 带 expiresIn 和 contentType 应成功`, async () => {
      const result = await storage.presign.putUrl('b.txt', { expiresIn: 300, contentType: 'text/plain' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(typeof result.data).toBe('string')
        expect(result.data.length).toBeGreaterThan(0)
      }
    })

    it(`${label}: putUrl 嵌套路径应成功`, async () => {
      const result = await storage.presign.putUrl('uploads/2024/01/doc.pdf', {
        expiresIn: 3600,
        contentType: 'application/pdf',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toContain('doc.pdf')
      }
    })

    it.each([0, -1, 0.5, 604801])(`${label}: 无效有效期 %s 在签名前失败`, async (expiresIn) => {
      for (const operation of ['getUrl', 'putUrl'] as const) {
        const result = await storage.presign[operation]('a.txt', { expiresIn })
        expect(result).toMatchObject({ success: false, error: { code: HaiStorageError.PRESIGN_FAILED.code } })
      }
    })

    it(`${label}: 输入选项允许省略带默认值的有效期`, async () => {
      const result = await storage.presign.putUrl('default-type.txt', { contentType: 'text/plain' })
      expect(result.success).toBe(true)
      if (result.success)
        expect(new URL(result.data).searchParams.get('X-Amz-Expires')).toBe('3600')
    })

    // =========================================================================
    // publicUrl
    // =========================================================================

    it(`${label}: publicUrl 未配置 publicUrl 时应返回 null`, () => {
      const url = storage.presign.publicUrl('some-file.txt')
      expect(url).toBeNull()
    })
  }

  defineStorageSuite('local', localStorageEnv, () => {
    it.each(['getUrl', 'putUrl'] as const)('local: %s 明确不支持且不返回虚拟 URL', async (operation) => {
      const result = await storage.presign[operation]('uploads/report.txt')
      expect(result.success).toBe(false)
      expect(result).not.toHaveProperty('data')
      if (!result.success)
        expect(result.error.code).toBe(HaiStorageError.UNSUPPORTED_OPERATION.code)
    })

    it('local: publicUrl 保持 null，不把本地路径发布为 URL', () => {
      expect(storage.presign.publicUrl('uploads/report.txt')).toBeNull()
    })
  })

  defineS3StorageSuites(() => defineCommon('s3'))
})
