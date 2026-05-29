/**
 * =============================================================================
 * @h-ai/ui - 浏览器能力安全辅助测试
 * =============================================================================
 * 覆盖受限浏览器环境中的 localStorage / clipboard 降级行为。
 * =============================================================================
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  readStoredValue,
  writeStoredValue,
  writeTextToClipboard,
} from '../src/lib/internal/browser-safety.js'

const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')

function restoreProperty(
  propertyName: 'localStorage' | 'navigator',
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor) {
    Object.defineProperty(globalThis, propertyName, descriptor)
    return
  }

  Reflect.deleteProperty(globalThis, propertyName)
}

afterEach(() => {
  restoreProperty('localStorage', originalLocalStorageDescriptor)
  restoreProperty('navigator', originalNavigatorDescriptor)
  vi.restoreAllMocks()
})

describe('browser-safety helpers', () => {
  it('读取 localStorage 时若能力缺失应回退为 null', () => {
    Reflect.deleteProperty(globalThis, 'localStorage')
    expect(readStoredValue('hai-theme')).toBeNull()
  })

  it('读取 localStorage 时若浏览器抛错应回退为 null', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn(() => {
          throw new Error('blocked')
        }),
      },
    })

    expect(readStoredValue('hai-theme')).toBeNull()
  })

  it('写入 localStorage 时若浏览器抛错应返回 false', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        setItem: vi.fn(() => {
          throw new Error('blocked')
        }),
      },
    })

    expect(writeStoredValue('hai-theme', 'dark')).toBe(false)
  })

  it('剪贴板能力缺失时应返回 false', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {},
    })

    await expect(writeTextToClipboard('demo')).resolves.toBe(false)
  })

  it('剪贴板可用时应返回 true', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        clipboard: {
          writeText,
        },
      },
    })

    await expect(writeTextToClipboard('demo')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('demo')
  })
})
