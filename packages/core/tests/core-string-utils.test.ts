/**
 * =============================================================================
 * @h-ai/core - 字符串工具测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { core } from '../src/index.js'

describe('core.string', () => {
  it('capitalize 应该首字母大写', () => {
    expect(core.string.capitalize('hello')).toBe('Hello')
  })

  it('kebabCase/camelCase/snackCase/pascalCase 应该转换格式', () => {
    expect(core.string.kebabCase('helloWorld')).toBe('hello-world')
    expect(core.string.camelCase('hello-world')).toBe('helloWorld')
    expect(core.string.snakeCase('helloWorld')).toBe('hello_world')
    expect(core.string.pascalCase('hello-world')).toBe('HelloWorld')
  })

  it('kebabCase/snakeCase 应该处理连续大写字母', () => {
    expect(core.string.kebabCase('getHTTPSUrl')).toBe('get-https-url')
    expect(core.string.kebabCase('XMLParser')).toBe('xml-parser')
    expect(core.string.snakeCase('getHTTPSUrl')).toBe('get_https_url')
    expect(core.string.snakeCase('XMLParser')).toBe('xml_parser')
  })

  it('truncate 应该截断并添加后缀', () => {
    expect(core.string.truncate('hello world', 5)).toBe('hello...')
    expect(core.string.truncate('hi', 5)).toBe('hi')
  })

  it('truncate length <= 0 应返回原字符串', () => {
    expect(core.string.truncate('hello', 0)).toBe('hello')
    expect(core.string.truncate('hello', -1)).toBe('hello')
  })

  it('trim/isBlank/isNotBlank 应该处理空白', () => {
    expect(core.string.trim('  hi  ')).toBe('hi')
    expect(core.string.isBlank('   ')).toBe(true)
    expect(core.string.isNotBlank('ok')).toBe(true)
  })

  it('padStart/padEnd 应该按长度填充', () => {
    expect(core.string.padStart('1', 3, '0')).toBe('001')
    expect(core.string.padEnd('1', 3, '0')).toBe('100')
  })
})
