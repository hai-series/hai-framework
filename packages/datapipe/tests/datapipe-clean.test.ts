/**
 * datapipe-clean 单元测试
 *
 * 覆盖清洗功能：HTML 移除、URL 移除、Email 移除、空白标准化、自定义替换、组合场景。
 */

import { describe, expect, it } from 'vitest'
import { datapipe } from '../src/index.js'

describe('datapipe.clean', () => {
  // ─── HTML 移除 ───

  describe('removeHtml', () => {
    it('移除基本 HTML 标签', () => {
      const result = datapipe.clean('<p>Hello <strong>World</strong></p>')
      expect(result.success).toBe(true)
      expect(result.data).toBe('Hello World')
    })

    it('移除自闭合标签', () => {
      const result = datapipe.clean('Line 1<br/>Line 2<hr/>')
      expect(result.success).toBe(true)
      expect(result.data).toBe('Line 1Line 2')
    })

    it('移除嵌套标签', () => {
      const result = datapipe.clean('<div><ul><li>Item</li></ul></div>')
      expect(result.success).toBe(true)
      expect(result.data).toBe('Item')
    })

    it('removeHtml=false 保留 HTML', () => {
      const result = datapipe.clean('<p>Hello</p>', { removeHtml: false })
      expect(result.success).toBe(true)
      expect(result.data).toBe('<p>Hello</p>')
    })
  })

  // ─── URL 移除 ───

  describe('removeUrls', () => {
    it('移除 HTTP URL', () => {
      const result = datapipe.clean('Visit http://example.com for details', { removeUrls: true })
      expect(result.success).toBe(true)
      expect(result.data).toBe('Visit for details')
    })

    it('移除 HTTPS URL', () => {
      const result = datapipe.clean('Link: https://example.com/path?q=1', { removeUrls: true })
      expect(result.success).toBe(true)
      expect(result.data).toBe('Link:')
    })

    it('移除多个 URL', () => {
      const result = datapipe.clean('A http://a.com B https://b.com C', { removeUrls: true })
      expect(result.success).toBe(true)
      expect(result.data).toBe('A B C')
    })

    it('默认不移除 URL', () => {
      const result = datapipe.clean('Link: https://example.com')
      expect(result.success).toBe(true)
      expect(result.data).toContain('https://example.com')
    })
  })

  // ─── Email 移除 ───

  describe('removeEmails', () => {
    it('移除 Email 地址', () => {
      const result = datapipe.clean('Contact user@example.com for info', { removeEmails: true })
      expect(result.success).toBe(true)
      expect(result.data).toBe('Contact for info')
    })

    it('移除多个 Email', () => {
      const result = datapipe.clean('a@b.com and c@d.org', { removeEmails: true })
      expect(result.success).toBe(true)
      expect(result.data).toBe('and')
    })

    it('默认不移除 Email', () => {
      const result = datapipe.clean('user@example.com')
      expect(result.success).toBe(true)
      expect(result.data).toContain('user@example.com')
    })
  })

  // ─── 空白标准化 ───

  describe('normalizeWhitespace', () => {
    it('多空格合并为单空格', () => {
      const result = datapipe.clean('Hello    World')
      expect(result.success).toBe(true)
      expect(result.data).toBe('Hello World')
    })

    it('多空行合并为两行', () => {
      const result = datapipe.clean('Line 1\n\n\n\n\nLine 2')
      expect(result.success).toBe(true)
      expect(result.data).toBe('Line 1\n\nLine 2')
    })

    it('tab 合并', () => {
      const result = datapipe.clean('Col1\t\t\tCol2')
      expect(result.success).toBe(true)
      expect(result.data).toBe('Col1 Col2')
    })

    it('normalizeWhitespace=false 保留原有空白', () => {
      const result = datapipe.clean('A    B', { normalizeWhitespace: false })
      expect(result.success).toBe(true)
      expect(result.data).toBe('A    B')
    })
  })

  // ─── trim ───

  describe('trim', () => {
    it('默认去除首尾空白', () => {
      const result = datapipe.clean('  Hello World  ')
      expect(result.success).toBe(true)
      expect(result.data).toBe('Hello World')
    })

    it('trim=false 保留首尾空白', () => {
      const result = datapipe.clean('  Hello  ', { trim: false, normalizeWhitespace: false })
      expect(result.success).toBe(true)
      expect(result.data).toBe('  Hello  ')
    })
  })

  // ─── 自定义替换 ───

  describe('customReplacements', () => {
    it('单条自定义替换', () => {
      const result = datapipe.clean('Hello World', {
        customReplacements: [{ pattern: 'World', replacement: 'AI' }],
      })
      expect(result.success).toBe(true)
      expect(result.data).toBe('Hello AI')
    })

    it('多条自定义替换', () => {
      const result = datapipe.clean('foo bar baz', {
        customReplacements: [
          { pattern: 'foo', replacement: 'FOO' },
          { pattern: 'baz', replacement: 'BAZ' },
        ],
      })
      expect(result.success).toBe(true)
      expect(result.data).toBe('FOO bar BAZ')
    })

    it('正则模式自定义替换', () => {
      const result = datapipe.clean('Version 1.2.3 and 4.5.6', {
        customReplacements: [{ pattern: '\\d+\\.\\d+\\.\\d+', replacement: 'X.X.X' }],
      })
      expect(result.success).toBe(true)
      expect(result.data).toBe('Version X.X.X and X.X.X')
    })
  })

  // ─── 组合场景 ───

  describe('组合选项', () => {
    it('同时移除 HTML、URL、标准化空白', () => {
      const input = '<p>Visit   https://example.com   for   details</p>'
      const result = datapipe.clean(input, {
        removeHtml: true,
        removeUrls: true,
        normalizeWhitespace: true,
        trim: true,
      })
      expect(result.success).toBe(true)
      expect(result.data).toBe('Visit for details')
    })

    it('所有选项开启', () => {
      const input = '  <b>Contact</b> user@test.com at  https://t.co  \n\n\n\n  '
      const result = datapipe.clean(input, {
        removeHtml: true,
        removeUrls: true,
        removeEmails: true,
        normalizeWhitespace: true,
        trim: true,
      })
      expect(result.success).toBe(true)
      // HTML 移除 → URL 移除 → Email 移除 → 空白标准化 → trim
      expect(result.data).not.toContain('<b>')
      expect(result.data).not.toContain('https://')
      expect(result.data).not.toContain('@')
    })
  })

  // ─── 边界用例 ───

  describe('边界用例', () => {
    it('空字符串返回空字符串', () => {
      const result = datapipe.clean('')
      expect(result.success).toBe(true)
      expect(result.data).toBe('')
    })

    it('纯空白字符串 trim 后为空', () => {
      const result = datapipe.clean('   \n\n   ')
      expect(result.success).toBe(true)
      expect(result.data).toBe('')
    })

    it('无选项使用默认值', () => {
      const result = datapipe.clean('<div>Text</div>')
      expect(result.success).toBe(true)
      // 默认 removeHtml=true, normalizeWhitespace=true, trim=true
      expect(result.data).toBe('Text')
    })

    it('中文文本正常处理', () => {
      const result = datapipe.clean('<p>这是一段  中文   文本</p>')
      expect(result.success).toBe(true)
      expect(result.data).toBe('这是一段 中文 文本')
    })
  })
})
