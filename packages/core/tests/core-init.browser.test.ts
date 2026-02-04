/**
 * =============================================================================
 * @hai/core - 初始化测试（浏览器）
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { core } from '../src/core-index.browser.js'

describe('core.init (browser)', () => {
  it('init 应该可在浏览器环境调用', () => {
    expect(() => core.init({ logging: { level: 'info' } })).not.toThrow()
  })
})
