import { expect, it } from 'vitest'
import { deploy } from '../src/index.js'

it.each([
  [' @Shop/Orders__API ', 'orders-api'],
  ['---alpha---', 'alpha'],
  ['a--b', 'a--b'],
  [`a${'-'.repeat(8000)}b`, `a${'-'.repeat(8000)}b`],
])('工程名归一化保留有效内部连字符：%s', (input, expected) => {
  expect(deploy.normalizeProjectName(input)).toBe(expected)
})

it.each(['', '---', '中文'])('没有字母数字的工程名明确失败：%s', (input) => {
  expect(() => deploy.normalizeProjectName(input)).toThrow()
})
