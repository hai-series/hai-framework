/**
 * =============================================================================
 * @h-ai/capacitor - Main 生命周期测试
 * =============================================================================
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { capacitor, HaiCapacitorError } from '../src/index.js'

// mock @capacitor/core
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: vi.fn(() => 'android'),
  },
}))

describe('capacitor main', () => {
  afterEach(async () => {
    await capacitor.close()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('初始状态为未初始化', () => {
    expect(capacitor.isInitialized).toBe(false)
  })

  it('非 Capacitor 环境下 init 返回 NOT_AVAILABLE', async () => {
    // 无 window.Capacitor
    const result = await capacitor.init()
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiCapacitorError.NOT_AVAILABLE.code)
    }
  })

  it('close 后 isInitialized 为 false', async () => {
    await capacitor.close()
    expect(capacitor.isInitialized).toBe(false)
  })

  it('close 可重复调用不报错', async () => {
    await capacitor.close()
    await expect(capacitor.close()).resolves.toEqual({ success: true, data: undefined })
  })

  it('getPlatform 在未初始化时返回 web', () => {
    expect(capacitor.getPlatform()).toBe('web')
  })

  it('isNative 在非原生环境返回 false', () => {
    expect(capacitor.isNative()).toBe(false)
  })

  it('关闭使进行中的初始化失败，完成后允许重新初始化', async () => {
    vi.stubGlobal('window', { Capacitor: {} })
    const initializing = capacitor.init()
    const closing = capacitor.close()
    const concurrent = await capacitor.init()
    expect(concurrent).toMatchObject({
      success: false,
      error: { code: HaiCapacitorError.INIT_IN_PROGRESS.code },
    })

    const [initialized, closed] = await Promise.all([initializing, closing])
    expect(initialized).toMatchObject({
      success: false,
      error: { code: HaiCapacitorError.INIT_FAILED.code },
    })
    expect(closed.success).toBe(true)
    expect(capacitor.isInitialized).toBe(false)
    expect(await capacitor.preferences.get('theme')).toMatchObject({
      success: false,
      error: { code: HaiCapacitorError.NOT_INITIALIZED.code },
    })

    expect((await capacitor.init()).success).toBe(true)
    expect(capacitor.isInitialized).toBe(true)
  })

  it('初始化时的内部重置不误取消重新初始化', async () => {
    vi.stubGlobal('window', { Capacitor: {} })
    expect((await capacitor.init()).success).toBe(true)
    expect((await capacitor.init()).success).toBe(true)
    expect(capacitor.isInitialized).toBe(true)
    expect(capacitor.getPlatform()).toBe('android')
  })
})

describe('capacitor sub-operation getters', () => {
  afterEach(async () => {
    await capacitor.close()
    vi.restoreAllMocks()
  })

  it('未初始化时 device getter 返回 NOT_INITIALIZED 错误', async () => {
    const result = await capacitor.device.getInfo()
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiCapacitorError.NOT_INITIALIZED.code)
    }
  })

  it('未初始化时 camera getter 返回 NOT_INITIALIZED 错误', async () => {
    const result = await capacitor.camera.takePhoto()
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiCapacitorError.NOT_INITIALIZED.code)
    }
  })

  it('未初始化时 push getter 返回 NOT_INITIALIZED 错误', async () => {
    const result = await capacitor.push.register()
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiCapacitorError.NOT_INITIALIZED.code)
    }
  })

  it('未初始化时 statusBar getter 返回 NOT_INITIALIZED 错误', async () => {
    const result = await capacitor.statusBar.configure({ style: 'dark', overlay: true })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiCapacitorError.NOT_INITIALIZED.code)
    }
  })

  it('未初始化时 preferences getter 返回 NOT_INITIALIZED 错误', async () => {
    const result = await capacitor.preferences.get('some_key')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiCapacitorError.NOT_INITIALIZED.code)
    }
  })
})
