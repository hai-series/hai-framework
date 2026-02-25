/**
 * =============================================================================
 * @h-ai/core - 初始化测试（浏览器）
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { core } from '../src/core-index.browser.js'

describe('core.init (browser)', () => {
  it('init 应该可在浏览器环境调用', () => {
    expect(() => core.init({ logging: { level: 'info' } })).not.toThrow()
  })

  it('init 不传参应正常执行', () => {
    expect(() => core.init()).not.toThrow()
  })

  it('init 带 logging 应该配置日志级别', () => {
    core.init({ logging: { level: 'debug' } })
    expect(core.getLogLevel()).toBe('debug')

    // 恢复
    core.setLogLevel('info')
  })

  it('init 带 watchConfig 应该输出警告但不崩溃', () => {
    expect(() => core.init({ watchConfig: true })).not.toThrow()
  })
})
