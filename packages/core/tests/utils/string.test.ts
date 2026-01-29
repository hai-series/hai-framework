/**
 * =============================================================================
 * @hai/core - 字符串操作工具测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import {
  camelCase,
  capitalize,
  isBlank,
  isNotBlank,
  kebabCase,
  padEnd,
  padStart,
  pascalCase,
  snakeCase,
  trim,
  truncate,
} from '../../src/utils/core-util-string.js'

describe('core-util-string', () => {
  describe('capitalize()', () => {
    it('应将首字母大写', () => {
      expect(capitalize('hello')).toBe('Hello')
      expect(capitalize('world')).toBe('World')
    })

    it('应处理空字符串', () => {
      expect(capitalize('')).toBe('')
    })

    it('应保持其他字符不变', () => {
      expect(capitalize('hELLO')).toBe('HELLO')
    })
  })

  describe('kebabCase()', () => {
    it('应将 camelCase 转换为 kebab-case', () => {
      expect(kebabCase('helloWorld')).toBe('hello-world')
      expect(kebabCase('myVariableName')).toBe('my-variable-name')
    })

    it('应处理单个单词', () => {
      expect(kebabCase('hello')).toBe('hello')
    })
  })

  describe('camelCase()', () => {
    it('应将 kebab-case 转换为 camelCase', () => {
      expect(camelCase('hello-world')).toBe('helloWorld')
      expect(camelCase('my-variable-name')).toBe('myVariableName')
    })

    it('应处理单个单词', () => {
      expect(camelCase('hello')).toBe('hello')
    })
  })

  describe('snakeCase()', () => {
    it('应将 camelCase 转换为 snake_case', () => {
      expect(snakeCase('helloWorld')).toBe('hello_world')
      expect(snakeCase('myVariableName')).toBe('my_variable_name')
    })
  })

  describe('pascalCase()', () => {
    it('应将字符串转换为 PascalCase', () => {
      expect(pascalCase('hello-world')).toBe('HelloWorld')
      expect(pascalCase('my_variable')).toBe('MyVariable')
    })
  })

  describe('truncate()', () => {
    it('应截断超长字符串', () => {
      expect(truncate('hello world', 5)).toBe('hello...')
    })

    it('应保持短字符串不变', () => {
      expect(truncate('hi', 5)).toBe('hi')
    })

    it('应支持自定义后缀', () => {
      expect(truncate('hello world', 5, '…')).toBe('hello…')
    })
  })

  describe('trim()', () => {
    it('应移除两端空白', () => {
      expect(trim('  hello  ')).toBe('hello')
      expect(trim('\n\thello\n\t')).toBe('hello')
    })
  })

  describe('isBlank()', () => {
    it('应对空字符串返回 true', () => {
      expect(isBlank('')).toBe(true)
    })

    it('应对只含空白的字符串返回 true', () => {
      expect(isBlank('   ')).toBe(true)
      expect(isBlank('\n\t')).toBe(true)
    })

    it('应对非空字符串返回 false', () => {
      expect(isBlank('hello')).toBe(false)
      expect(isBlank(' a ')).toBe(false)
    })
  })

  describe('isNotBlank()', () => {
    it('应对非空字符串返回 true', () => {
      expect(isNotBlank('hello')).toBe(true)
    })

    it('应对空/空白字符串返回 false', () => {
      expect(isNotBlank('')).toBe(false)
      expect(isNotBlank('   ')).toBe(false)
    })
  })

  describe('padStart()', () => {
    it('应在左侧填充字符', () => {
      expect(padStart('5', 3, '0')).toBe('005')
      expect(padStart('hello', 10, '-')).toBe('-----hello')
    })
  })

  describe('padEnd()', () => {
    it('应在右侧填充字符', () => {
      expect(padEnd('5', 3, '0')).toBe('500')
      expect(padEnd('hello', 10, '-')).toBe('hello-----')
    })
  })
})
