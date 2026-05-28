/**
 * =============================================================================
 * @h-ai/core - 初始化测试（浏览器）
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { core, HaiCommonError } from '../src/core-index.browser.js'

describe('core.init (browser)', () => {
  it('init 应该可在浏览器环境调用', () => {
    expect(() => core.init({ logging: { level: 'info' } })).not.toThrow()
  })

  it('init 不传参应正常执行', () => {
    expect(() => core.init()).not.toThrow()
  })

  it('init 带 logging 应该配置日志级别', () => {
    core.init({ logging: { level: 'debug' } })
    expect(core.logger.getLevel()).toBe('debug')

    // 恢复
    core.logger.setLevel('info')
  })

  it('init 带 watchConfig 应该输出警告但不崩溃', () => {
    expect(() => core.init({ watchConfig: true })).not.toThrow()
  })

  it('browser config 应保持 API 形态并返回不支持错误', () => {
    expect(core.config.get('app')).toBeUndefined()
    expect(core.config.has('app')).toBe(false)
    expect(core.config.keys()).toEqual([])
    expect(core.config.isWatching('app')).toBe(false)

    const loadResult = core.config.load('app', './config/app.yml')
    expect(loadResult.success).toBe(false)
    if (!loadResult.success)
      expect(loadResult.error.code).toBe(HaiCommonError.SERVICE_UNAVAILABLE.code)

    let watchErrorCode: string | number | undefined
    const unwatch = core.config.watch('app', (_cfg, error) => {
      watchErrorCode = error?.code
    })
    expect(watchErrorCode).toBe(HaiCommonError.SERVICE_UNAVAILABLE.code)
    expect(() => unwatch()).not.toThrow()
  })
})
