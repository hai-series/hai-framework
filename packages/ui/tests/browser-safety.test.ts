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
  registerClipboardHostWriter,
  writeStoredValue,
  writeTextToClipboard,
} from '../src/lib/internal/browser-safety.js'

const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')

function restoreProperty(
  propertyName: 'localStorage' | 'navigator' | 'document',
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
  restoreProperty('document', undefined)
  registerClipboardHostWriter(null)
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

  it('clipboard API 失败时应回退到 execCommand', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('not allowed'))

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        clipboard: {
          writeText,
        },
      },
    })

    const mockExecCommand = vi.fn(() => true)
    const mockBody = { appendChild: vi.fn(), removeChild: vi.fn() }
    const mockTextarea = { value: '', style: { cssText: '' }, select: vi.fn() }
    const mockCreateElement = vi.fn(() => ({ ...mockTextarea }))

    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        createElement: mockCreateElement,
        body: mockBody,
        execCommand: mockExecCommand,
      },
    })

    await expect(writeTextToClipboard('demo')).resolves.toBe(true)
    expect(mockExecCommand).toHaveBeenCalledWith('copy')
    expect(mockCreateElement).toHaveBeenCalledWith('textarea')

    Reflect.deleteProperty(globalThis, 'document')
  })

  it('clipboard API 和 execCommand 均失败时应返回 false', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('blocked'))

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        clipboard: {
          writeText,
        },
      },
    })

    const mockBody = { appendChild: vi.fn(), removeChild: vi.fn() }
    const mockTextarea = { value: '', style: { cssText: '' }, select: vi.fn() }

    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        createElement: vi.fn(() => ({ ...mockTextarea })),
        body: mockBody,
        execCommand: vi.fn(() => false),
      },
    })

    await expect(writeTextToClipboard('demo')).resolves.toBe(false)

    Reflect.deleteProperty(globalThis, 'document')
  })

  it('execCommand 失败时应由宿主写入器兜底', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('blocked'))
    const hostWriter = vi.fn().mockResolvedValue(true)

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        clipboard: {
          writeText,
        },
      },
    })

    const mockBody = { appendChild: vi.fn(), removeChild: vi.fn() }
    const mockTextarea = { value: '', style: { cssText: '' }, select: vi.fn() }

    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        createElement: vi.fn(() => ({ ...mockTextarea })),
        body: mockBody,
        execCommand: vi.fn(() => false),
      },
    })
    registerClipboardHostWriter(hostWriter)

    await expect(writeTextToClipboard('demo')).resolves.toBe(true)
    expect(hostWriter).toHaveBeenCalledWith('demo')

    Reflect.deleteProperty(globalThis, 'document')
  })

  it('全部降级路径失败时应返回 false', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('blocked'))
    const hostWriter = vi.fn().mockResolvedValue(false)

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        clipboard: {
          writeText,
        },
      },
    })

    const mockBody = { appendChild: vi.fn(), removeChild: vi.fn() }
    const mockTextarea = { value: '', style: { cssText: '' }, select: vi.fn() }

    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        createElement: vi.fn(() => ({ ...mockTextarea })),
        body: mockBody,
        execCommand: vi.fn(() => false),
      },
    })
    registerClipboardHostWriter(hostWriter)

    await expect(writeTextToClipboard('demo')).resolves.toBe(false)
    expect(hostWriter).toHaveBeenCalledWith('demo')

    Reflect.deleteProperty(globalThis, 'document')
  })
})
