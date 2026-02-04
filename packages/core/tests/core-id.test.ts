/**
 * =============================================================================
 * @hai/core - ID 工具测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { core } from '../src/core-index.node.js'

describe('core.id', () => {
  it('generate 应该生成指定长度的 nanoid', () => {
    const id = core.id.generate(12)
    expect(id).toHaveLength(12)
    expect(core.id.isValidNanoId(id, 12)).toBe(true)
  })

  it('short 应该生成短 ID', () => {
    const id = core.id.short()
    expect(id).toHaveLength(10)
  })

  it('withPrefix 应该带前缀', () => {
    const id = core.id.withPrefix('user_')
    expect(id.startsWith('user_')).toBe(true)
  })

  it('trace/request 应该包含固定前缀', () => {
    expect(core.id.trace().startsWith('trace-')).toBe(true)
    expect(core.id.request().startsWith('req-')).toBe(true)
  })

  it('uuid 应该生成有效 UUID v4', () => {
    const uuid = core.id.uuid()
    expect(core.id.isValidUUID(uuid)).toBe(true)
  })

  it('isValidNanoId 应该能识别无效值', () => {
    expect(core.id.isValidNanoId('invalid-id', 21)).toBe(false)
  })
})
