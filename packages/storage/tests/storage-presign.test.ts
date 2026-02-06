/**
 * =============================================================================
 * @hai/storage - 签名 URL 操作测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { storage } from '../src/index.js'
import { defineStorageSuite, localStorageEnv, s3Env } from './helpers/storage-test-suite.js'

describe('storage.presign', () => {
  const defineCommon = (label: 'local' | 's3') => {
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

    it(`${label}: putUrl 带 expiresIn 应成功返回 URL`, async () => {
      const result = await storage.presign.putUrl('b.txt', { expiresIn: 300, contentType: 'text/plain' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(typeof result.data).toBe('string')
        expect(result.data.length).toBeGreaterThan(0)
      }
    })

    // =========================================================================
    // publicUrl
    // =========================================================================

    it(`${label}: publicUrl 未配置 publicUrl 时应返回 null`, () => {
      const url = storage.presign.publicUrl('some-file.txt')
      expect(url).toBeNull()
    })
  }

  defineStorageSuite('local', localStorageEnv, () => defineCommon('local'))

  defineStorageSuite('s3', s3Env, () => defineCommon('s3'))
})
