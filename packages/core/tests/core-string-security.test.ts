/** Node 凭证比较必须走原生恒时字节比较，同时保留 JavaScript 字符串的精确相等语义。 */
import { timingSafeEqual } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { core as browserCore } from '../src/core-main.browser.js'
import { core } from '../src/index.js'

vi.mock('node:crypto', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:crypto')>()
  return { ...original, timingSafeEqual: vi.fn(original.timingSafeEqual) }
})

beforeEach(() => {
  vi.mocked(timingSafeEqual).mockClear()
})

describe('原生凭证比较', () => {
  it.each([
    ['abc', 'abc', true],
    ['abc', 'abd', false],
    ['abc', 'xbc', false],
    ['abc', 'ab', false],
    ['', '', true],
    ['', 'a', false],
    ['a\0b', 'a\0b', true],
    ['a\0b', 'a\0c', false],
    ['你好', '你好', true],
    ['😀', '😁', false],
    ['\uD800', '\uD801', false],
    ['\uD800', '\uFFFD', false],
  ] as const)('按原始 UTF-16 单元比较第 %# 组', (a, b, expected) => {
    expect(core.string.constantTimeEqual(a, b)).toBe(expected)
    expect(timingSafeEqual).toHaveBeenCalledTimes(a.length === b.length ? 1 : 0)
  })

  it('浏览器保持字符串比较语义，不引入 Node 加密运行时', () => {
    expect(browserCore.string.constantTimeEqual('\uD800', '\uD801')).toBe(false)
    expect(browserCore.string.constantTimeEqual('a\0b', 'a\0b')).toBe(true)
    expect(timingSafeEqual).not.toHaveBeenCalled()
  })
})
