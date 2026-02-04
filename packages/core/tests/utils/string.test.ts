/**
 * =============================================================================
 * @hai/core - 字符串操作工具测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { string } from '../../src/utils/core-util-string.js'

describe('core-util-string', () => {
  describe('capitalize()', () => {
    it('应将首字母大写', () => {
      expect(string.capitalize('hello')).toBe('Hello')
      expect(string.capitalize('world')).toBe('World')
    })

    it('应处理空字符串', () => {
      expect(string.capitalize('')).toBe('')
    })

    it('应保持其他字符不变', () => {
      expect(string.capitalize('hELLO')).toBe('HELLO')
    })
  })

  describe('kebabCase()', () => {
    it('应将 camelCase 转换为 kebab-case', () => {
      expect(string.kebabCase('helloWorld')).toBe('hello-world')
      expect(string.kebabCase('myVariableName')).toBe('my-variable-name')
    })

    it('应处理单个单词', () => {
      expect(string.kebabCase('hello')).toBe('hello')
    })
  })

  describe('camelCase()', () => {
    it('应将 kebab-case 转换为 camelCase', () => {
      expect(string.camelCase('hello-world')).toBe('helloWorld')
      expect(string.camelCase('my-variable-name')).toBe('myVariableName')
    })

    it('应处理单个单词', () => {
      expect(string.camelCase('hello')).toBe('hello')
    })
  })

  describe('snakeCase()', () => {
    it('应将 camelCase 转换为 snake_case', () => {
      expect(string.snakeCase('helloWorld')).toBe('hello_world')
      expect(string.snakeCase('myVariableName')).toBe('my_variable_name')
    })
  })

  describe('pascalCase()', () => {
    it('应将字符串转换为 PascalCase', () => {
      expect(string.pascalCase('hello-world')).toBe('HelloWorld')
      expect(string.pascalCase('my_variable')).toBe('MyVariable')
    })
  })

  describe('truncate()', () => {
    it('应截断超长字符串', () => {
      expect(string.truncate('hello world', 5)).toBe('hello...')
    })

    it('应保持短字符串不变', () => {
      expect(string.truncate('hi', 5)).toBe('hi')
    })

    it('应支持自定义后缀', () => {
      expect(string.truncate('hello world', 5, '…')).toBe('hello…')
    })
  })

  describe('trim()', () => {
    it('应移除两端空白', () => {
      expect(string.trim('  hello  ')).toBe('hello')
      expect(string.trim('\n\thello\n\t')).toBe('hello')
    })
  })

  describe('isBlank()', () => {
    it('应对空字符串返回 true', () => {
      expect(string.isBlank('')).toBe(true)
    })

    it('应对只含空白的字符串返回 true', () => {
      expect(string.isBlank('   ')).toBe(true)
      expect(string.isBlank('\n\t')).toBe(true)
    })

    it('应对非空字符串返回 false', () => {
      expect(string.isBlank('hello')).toBe(false)
      expect(string.isBlank(' a ')).toBe(false)
    })
  })

  describe('isNotBlank()', () => {
    it('应对非空字符串返回 true', () => {
      expect(string.isNotBlank('hello')).toBe(true)
    })

    it('应对空/空白字符串返回 false', () => {
      expect(string.isNotBlank('')).toBe(false)
      expect(string.isNotBlank('   ')).toBe(false)
    })
  })

  describe('padStart()', () => {
    it('应在左侧填充字符', () => {
      expect(string.padStart('5', 3, '0')).toBe('005')
      expect(string.padStart('hello', 10, '-')).toBe('-----hello')
    })
  })

  describe('padEnd()', () => {
    it('应在右侧填充字符', () => {
      expect(string.padEnd('5', 3, '0')).toBe('500')
      expect(string.padEnd('hello', 10, '-')).toBe('hello-----')
    })
  })
})
