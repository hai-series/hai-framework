import { describe, expect, it } from 'vitest'
import { convertPostgresPlaceholders } from '../src/providers/reldb-provider-postgres.js'

describe('reldb postgres placeholder convert', () => {
  it('应按顺序替换真实参数占位符', () => {
    const sql = 'SELECT * FROM users WHERE id = ? AND status = ?'
    const converted = convertPostgresPlaceholders(sql, 2)
    expect(converted).toBe('SELECT * FROM users WHERE id = $1 AND status = $2')
  })

  it('应跳过字符串、注释和 dollar-quoted 中的 ?', () => {
    const sql = `
      SELECT '?' AS s1, $$?$$ AS s2, $tag$?$tag$ AS s3
      -- comment ?
      /* block ? */
      FROM users
      WHERE id = ?
    `
    const converted = convertPostgresPlaceholders(sql, 1)
    expect(converted).toContain('WHERE id = $1')
    expect(converted).toContain('SELECT \'?\' AS s1')
    expect(converted).toContain('$$?$$ AS s2')
    expect(converted).toContain('$tag$?$tag$ AS s3')
    expect(converted).toContain('-- comment ?')
    expect(converted).toContain('/* block ? */')
  })

  it('应跳过 PostgreSQL JSON ? 操作符并保留参数占位符', () => {
    const sql = `SELECT * FROM docs WHERE payload ? 'name' AND tags ?| array['a'] AND id = ?`
    const converted = convertPostgresPlaceholders(sql, 1)
    expect(converted).toBe(`SELECT * FROM docs WHERE payload ? 'name' AND tags ?| array['a'] AND id = $1`)
  })

  it('应只替换 placeholderCount 指定数量的占位符', () => {
    const sql = 'SELECT * FROM users WHERE id = ? AND org_id = ?'
    const converted = convertPostgresPlaceholders(sql, 1)
    expect(converted).toBe('SELECT * FROM users WHERE id = $1 AND org_id = ?')
  })

  it('LIMIT/OFFSET 等场景应正常替换', () => {
    const sql = 'SELECT * FROM users ORDER BY id DESC LIMIT ? OFFSET ?'
    const converted = convertPostgresPlaceholders(sql, 2)
    expect(converted).toBe('SELECT * FROM users ORDER BY id DESC LIMIT $1 OFFSET $2')
  })
})
