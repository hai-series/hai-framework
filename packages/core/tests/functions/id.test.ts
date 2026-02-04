/**
 * =============================================================================
 * @hai/core - ID 生成器测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { id } from '../../src/functions/core-function-id.js'

describe('core-function-id', () => {
  describe('id.generate()', () => {
    it('应生成 21 字符的默认 nanoid', () => {
      const result = id.generate()
      expect(result).toHaveLength(21)
      expect(id.isValidNanoId(result)).toBe(true)
    })

    it('应生成指定长度的 nanoid', () => {
      const result = id.generate(32)
      expect(result).toHaveLength(32)
      expect(id.isValidNanoId(result, 32)).toBe(true)
    })

    it('应生成唯一的 ID', () => {
      const ids = new Set<string>()
      for (let i = 0; i < 1000; i++) {
        ids.add(id.generate())
      }
      expect(ids.size).toBe(1000)
    })
  })

  describe('id.short()', () => {
    it('应生成 10 字符的短 ID', () => {
      const result = id.short()
      expect(result).toHaveLength(10)
    })
  })

  describe('id.withPrefix()', () => {
    it('应生成带前缀的 ID', () => {
      const result = id.withPrefix('user_')
      expect(result).toMatch(/^user_/)
      expect(result.length).toBe(5 + 21) // prefix + default length
    })

    it('应支持自定义长度', () => {
      const result = id.withPrefix('tx_', 10)
      expect(result).toMatch(/^tx_/)
      expect(result.length).toBe(3 + 10)
    })
  })

  describe('id.trace()', () => {
    it('应生成带 trace- 前缀的 ID', () => {
      const result = id.trace()
      expect(result).toMatch(/^trace-/)
    })
  })

  describe('id.request()', () => {
    it('应生成带 req- 前缀的 ID', () => {
      const result = id.request()
      expect(result).toMatch(/^req-/)
    })
  })

  describe('id.uuid()', () => {
    it('应生成有效的 UUID v4', () => {
      const result = id.uuid()
      expect(id.isValidUUID(result)).toBe(true)
    })

    it('应生成唯一的 UUID', () => {
      const uuids = new Set<string>()
      for (let i = 0; i < 1000; i++) {
        uuids.add(id.uuid())
      }
      expect(uuids.size).toBe(1000)
    })
  })

  describe('id.isValidUUID()', () => {
    it('应验证有效的 UUID', () => {
      expect(id.isValidUUID('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(true)
      expect(id.isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
    })

    it('应拒绝无效的 UUID', () => {
      expect(id.isValidUUID('not-a-uuid')).toBe(false)
      expect(id.isValidUUID('f47ac10b-58cc-4372-a567')).toBe(false)
      expect(id.isValidUUID('')).toBe(false)
    })
  })

  describe('id.isValidNanoId()', () => {
    it('应验证正确的 nanoid', () => {
      expect(id.isValidNanoId('V1StGXR8_Z5jdHi6B-myT')).toBe(true)
      expect(id.isValidNanoId('abc1234567', 10)).toBe(true)
    })

    it('应拒绝无效的 nanoid', () => {
      expect(id.isValidNanoId('invalid!')).toBe(false)
      expect(id.isValidNanoId('too-short')).toBe(false)
      expect(id.isValidNanoId('')).toBe(false)
    })
  })
})
