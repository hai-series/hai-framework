/**
 * =============================================================================
 * @h-ai/capacitor - Token Storage 测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'

describe('capacitor module', () => {
  it('模块可导入', async () => {
    const mod = await import('../src/index.js')
    expect(mod).toBeDefined()
    expect(typeof mod.createCapacitorTokenStorage).toBe('function')
  })
})
