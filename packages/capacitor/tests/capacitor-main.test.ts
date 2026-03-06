/**
 * =============================================================================
 * @h-ai/capacitor - Main 生命周期测试
 * =============================================================================
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

// mock @capacitor/core
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: vi.fn(() => 'android'),
  },
}))

describe('capacitor main', () => {
  afterEach(async () => {
    const { capacitor } = await import('../src/capacitor-main.js')
    await capacitor.close()
    vi.restoreAllMocks()
  })

  it('初始状态为未初始化', async () => {
    const { capacitor } = await import('../src/capacitor-main.js')
    expect(capacitor.isInitialized).toBe(false)
  })

  it('非 Capacitor 环境下 init 返回 NOT_AVAILABLE', async () => {
    const { capacitor } = await import('../src/capacitor-main.js')
    const { CapacitorErrorCode } = await import('../src/capacitor-config.js')

    // 无 window.Capacitor
    const result = await capacitor.init()
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(CapacitorErrorCode.NOT_AVAILABLE)
    }
  })

  it('close 后 isInitialized 为 false', async () => {
    const { capacitor } = await import('../src/capacitor-main.js')
    await capacitor.close()
    expect(capacitor.isInitialized).toBe(false)
  })

  it('close 可重复调用不报错', async () => {
    const { capacitor } = await import('../src/capacitor-main.js')
    await capacitor.close()
    await expect(capacitor.close()).resolves.toBeUndefined()
  })

  it('getPlatform 在未初始化时返回 web', async () => {
    const { capacitor } = await import('../src/capacitor-main.js')
    expect(capacitor.getPlatform()).toBe('web')
  })

  it('isNative 在非原生环境返回 false', async () => {
    const { capacitor } = await import('../src/capacitor-main.js')
    expect(capacitor.isNative()).toBe(false)
  })
})

describe('capacitor sub-operation getters', () => {
  afterEach(async () => {
    const { capacitor } = await import('../src/capacitor-main.js')
    await capacitor.close()
    vi.restoreAllMocks()
  })

  it('未初始化时 device getter 返回 NOT_INITIALIZED 错误', async () => {
    const { capacitor } = await import('../src/capacitor-main.js')
    const { CapacitorErrorCode } = await import('../src/capacitor-config.js')

    const result = await capacitor.device.getInfo()
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(CapacitorErrorCode.NOT_INITIALIZED)
    }
  })

  it('未初始化时 camera getter 返回 NOT_INITIALIZED 错误', async () => {
    const { capacitor } = await import('../src/capacitor-main.js')
    const { CapacitorErrorCode } = await import('../src/capacitor-config.js')

    const result = await capacitor.camera.takePhoto()
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(CapacitorErrorCode.NOT_INITIALIZED)
    }
  })

  it('未初始化时 push getter 返回 NOT_INITIALIZED 错误', async () => {
    const { capacitor } = await import('../src/capacitor-main.js')
    const { CapacitorErrorCode } = await import('../src/capacitor-config.js')

    const result = await capacitor.push.register()
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(CapacitorErrorCode.NOT_INITIALIZED)
    }
  })

  it('未初始化时 statusBar getter 返回 NOT_INITIALIZED 错误', async () => {
    const { capacitor } = await import('../src/capacitor-main.js')
    const { CapacitorErrorCode } = await import('../src/capacitor-config.js')

    const result = await capacitor.statusBar.configure({ style: 'dark', overlay: true })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(CapacitorErrorCode.NOT_INITIALIZED)
    }
  })

  it('未初始化时 preferences getter 返回 NOT_INITIALIZED 错误', async () => {
    const { capacitor } = await import('../src/capacitor-main.js')
    const { CapacitorErrorCode } = await import('../src/capacitor-config.js')

    const result = await capacitor.preferences.get('some_key')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(CapacitorErrorCode.NOT_INITIALIZED)
    }
  })
})
