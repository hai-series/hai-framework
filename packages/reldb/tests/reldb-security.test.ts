/**
 * =============================================================================
 * @h-ai/reldb - 安全工具测试
 * =============================================================================
 *
 * 纯函数测试，不需要数据库连接。
 * 覆盖：validateIdentifier、validateIdentifiers、escapeSqlString。
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { HaiReldbError, reldb } from '../src/index.js'

// =============================================================================
// validateIdentifier
// =============================================================================

describe('validateIdentifier', () => {
  it('应通过合法的标识符', () => {
    const cases = [
      'users',
      'user_name',
      '_private',
      'T1',
      'a',
      'A_B_C_123',
    ]
    for (const name of cases) {
      const result = reldb.validateIdentifier(name)
      expect(result.success, `expected "${name}" to pass`).toBe(true)
      if (result.success) {
        expect(result.data).toBe(name)
      }
    }
  })

  it('应拒绝以数字开头的标识符', () => {
    const result = reldb.validateIdentifier('1table')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiReldbError.CONFIG_ERROR.code)
    }
  })

  it('应拒绝包含空格的标识符', () => {
    const result = reldb.validateIdentifier('my table')
    expect(result.success).toBe(false)
  })

  it('应拒绝包含分号的标识符（SQL 注入向量）', () => {
    const result = reldb.validateIdentifier('users; DROP TABLE users')
    expect(result.success).toBe(false)
  })

  it('应拒绝包含括号的标识符', () => {
    const result = reldb.validateIdentifier('users()')
    expect(result.success).toBe(false)
  })

  it('应拒绝包含引号的标识符', () => {
    const single = reldb.validateIdentifier('user\'s')
    const double = reldb.validateIdentifier('user"s')
    expect(single.success).toBe(false)
    expect(double.success).toBe(false)
  })

  it('应拒绝空字符串', () => {
    const result = reldb.validateIdentifier('')
    expect(result.success).toBe(false)
  })

  it('应拒绝超过 128 字符的标识符', () => {
    const longName = `a${'b'.repeat(128)}`
    expect(longName.length).toBe(129)
    const result = reldb.validateIdentifier(longName)
    expect(result.success).toBe(false)
  })

  it('应通过恰好 128 字符的标识符', () => {
    const name = `a${'b'.repeat(127)}`
    expect(name.length).toBe(128)
    const result = reldb.validateIdentifier(name)
    expect(result.success).toBe(true)
  })

  it('应拒绝包含连字符的标识符', () => {
    const result = reldb.validateIdentifier('my-table')
    expect(result.success).toBe(false)
  })

  it('应拒绝包含点号的标识符', () => {
    const result = reldb.validateIdentifier('schema.table')
    expect(result.success).toBe(false)
  })
})

// =============================================================================
// validateIdentifiers
// =============================================================================

describe('validateIdentifiers', () => {
  it('应通过全部合法的标识符数组', () => {
    const result = reldb.validateIdentifiers(['id', 'name', 'created_at'])
    expect(result.success).toBe(true)
  })

  it('应在第一个不合法标识符处返回错误', () => {
    const result = reldb.validateIdentifiers(['id', 'bad name', 'ok'])
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.message).toContain('bad name')
    }
  })

  it('应通过空数组', () => {
    const result = reldb.validateIdentifiers([])
    expect(result.success).toBe(true)
  })
})

// =============================================================================
// escapeSqlString
// =============================================================================

describe('escapeSqlString', () => {
  it('应对普通字符串不做改动', () => {
    expect(reldb.escapeSqlString('hello')).toBe('hello')
  })

  it('应将单引号转义为两个单引号', () => {
    expect(reldb.escapeSqlString('it\'s')).toBe('it\'\'s')
  })

  it('应处理多个单引号', () => {
    expect(reldb.escapeSqlString('it\'\'s a \'test\'')).toBe('it\'\'\'\'s a \'\'test\'\'')
  })

  it('应处理空字符串', () => {
    expect(reldb.escapeSqlString('')).toBe('')
  })

  it('应不修改不含单引号的特殊字符', () => {
    expect(reldb.escapeSqlString('hello\nworld')).toBe('hello\nworld')
  })
})
