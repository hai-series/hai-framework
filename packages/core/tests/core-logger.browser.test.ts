/**
 * =============================================================================
 * @hai/core - Logger 测试（Browser）
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { core } from '../src/core-index.browser.js'

describe('core.logger (browser)', () => {
  it('logger 应该为单例', () => {
    expect(core.logger).toBe(core.logger)
  })

  it('createLogger 应该返回带方法的实例', () => {
    const logger = core.createLogger({ name: 'browser-test' })
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.error).toBe('function')
    expect(typeof logger.child).toBe('function')
  })

  it('setLogLevel/getLogLevel 应该生效', () => {
    core.setLogLevel('warn')
    expect(core.getLogLevel()).toBe('warn')
  })
})
