/**
 * =============================================================================
 * @h-ai/core - ID 工具测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { core } from '../src/index.js'

describe('core.id', () => {
  it('generate 默认应该生成 21 位 nanoid', () => {
    const id = core.id.generate()
    expect(id).toHaveLength(21)
    expect(core.id.isValidNanoId(id)).toBe(true)
  })

  it('generate 应该生成指定长度的 nanoid', () => {
    const id = core.id.generate(12)
    expect(id).toHaveLength(12)
    expect(core.id.isValidNanoId(id, 12)).toBe(true)
  })

  it('short 应该生成 10 位短 ID', () => {
    const id = core.id.short()
    expect(id).toHaveLength(10)
    expect(core.id.isValidNanoId(id, 10)).toBe(true)
  })

  it('withPrefix 应该带前缀且后缀为有效 nanoid', () => {
    const id = core.id.withPrefix('user_')
    expect(id.startsWith('user_')).toBe(true)
    expect(id.length).toBe(5 + 21) // prefix + default nanoid length
  })

  it('withPrefix 应该支持自定义后缀长度', () => {
    const id = core.id.withPrefix('x_', 10)
    expect(id.startsWith('x_')).toBe(true)
    expect(id.length).toBe(2 + 10)
  })

  it('trace/request 应该包含固定前缀且后缀唯一', () => {
    const traceId = core.id.trace()
    expect(traceId.startsWith('trace-')).toBe(true)
    expect(traceId.length).toBeGreaterThan(6)

    const reqId = core.id.request()
    expect(reqId.startsWith('req-')).toBe(true)
    expect(reqId.length).toBeGreaterThan(4)

    // 两次生成不同
    expect(core.id.trace()).not.toBe(traceId)
  })

  it('uuid 应该生成有效 UUID v4', () => {
    const uuid = core.id.uuid()
    expect(core.id.isValidUUID(uuid)).toBe(true)
    // UUID v4 格式：8-4-4-4-12
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })

  it('uuid 每次生成不同值', () => {
    const uuids = new Set(Array.from({ length: 10 }, () => core.id.uuid()))
    expect(uuids.size).toBe(10)
  })

  it('isValidUUID 应该拒绝非 UUID 字符串', () => {
    expect(core.id.isValidUUID('not-a-uuid')).toBe(false)
    expect(core.id.isValidUUID('')).toBe(false)
    expect(core.id.isValidUUID('12345678-1234-1234-1234-123456789012')).toBe(false) // 非 v4
  })

  it('isValidNanoId 应该能识别无效值', () => {
    expect(core.id.isValidNanoId('invalid-id', 21)).toBe(false)
    expect(core.id.isValidNanoId('', 21)).toBe(false)
    expect(core.id.isValidNanoId('abc', 21)).toBe(false) // 长度不匹配
  })

  it('isValidNanoId 默认验证 21 位长度', () => {
    const id = core.id.generate()
    expect(core.id.isValidNanoId(id)).toBe(true)
    expect(core.id.isValidNanoId(id, 10)).toBe(false) // 长度不匹配
  })
})
