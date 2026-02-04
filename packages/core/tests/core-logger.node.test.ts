/**
 * =============================================================================
 * @hai/core - Logger 测试（Node.js）
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { core } from '../src/core-index.node.js'

describe('core.logger (node)', () => {
  it('logger 应该为单例', () => {
    expect(core.logger).toBe(core.logger)
  })

  it('createLogger 应该返回带方法的实例', () => {
    const logger = core.createLogger({ name: 'test' })
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.error).toBe('function')
    expect(typeof logger.child).toBe('function')

    const child = logger.child({ requestId: 'req-1' })
    expect(typeof child.info).toBe('function')
  })

  it('configureLogger/setLogLevel/getLogLevel 应该生效', () => {
    core.configureLogger({ level: 'warn' })
    expect(core.getLogLevel()).toBe('warn')

    core.setLogLevel('error')
    expect(core.getLogLevel()).toBe('error')
  })
})
