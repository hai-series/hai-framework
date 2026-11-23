import { ui } from '@h-ai/ui'
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { readArtifactTable } from '../src/lib/components/scenes/tools/artifact-data.js'
import { captureMarkdownEdit } from '../src/lib/components/scenes/tools/artifact-markdown.js'
import { prepareHtmlPreview } from '../src/lib/components/scenes/tools/artifact-preview.js'
import { buildToolInput, describeToolFields, toolResourceOptions } from '../src/lib/components/scenes/tools/tool-form.js'

describe('产物工作台的内容保留', () => {
  it('编辑普通段落时逐字保留代码、Mermaid、HTML 和未编辑块', () => {
    const content = '# 标题\n\n原来的 **正文**。\n\n```ts\nconst n = 1\n```\n\n```mermaid\ngraph TD; A-->B\n```\n\n<div>原始 HTML</div>\n'
    const host = document.createElement('article')
    host.innerHTML = ui.renderMarkdownDocument(content).blocks.map(block => block.kind === 'html'
      ? block.html
      : '<div class="hai-md-mermaid"></div>').join('')
    const editing = captureMarkdownEdit(content, host)
    host.querySelector('p')!.firstChild!.textContent = '新的 '
    const result = editing.read()
    expect(result.success).toBe(true)
    if (result.success)
      expect(result.content).toBe(content.replace('原来的 **正文**。', '新的 **正文**。'))
    expect(host.querySelector('.hai-md-code-block')?.getAttribute('contenteditable')).toBe('false')
  })

  it('保留 CRLF 和未知结构，拒绝会丢失原文的回写', () => {
    const content = '# 标题\r\n\r\n正文。\r\n'
    const host = document.createElement('article')
    host.innerHTML = ui.renderMarkdownDocument(content).blocks.filter(block => block.kind === 'html').map(block => block.html).join('')
    const editing = captureMarkdownEdit(content, host)
    expect(editing.read()).toEqual({ success: true, content })
    host.querySelector('p')!.textContent = '更新。'
    expect(editing.read()).toEqual({ success: true, content: '# 标题\r\n\r\n更新。\r\n' })
    host.append(document.createElement('iframe'))
    expect(editing.read().success).toBe(false)
  })

  it('修改段落时保留链接说明、行内代码空格，并转义新输入的列表标记', () => {
    const content = 'Before [Docs](https://example.invalid/ "Helpful") and `  x  `.\n'
    const host = document.createElement('article')
    host.innerHTML = ui.renderMarkdownDocument(content).blocks.filter(block => block.kind === 'html').map(block => block.html).join('')
    const editing = captureMarkdownEdit(content, host)
    host.querySelector('p')!.firstChild!.textContent = '- After '
    const result = editing.read()
    expect(result.success).toBe(true)
    if (!result.success)
      return
    expect(result.content).toMatch(/^\\- After/)
    const parsed = document.createElement('div')
    parsed.innerHTML = ui.renderMarkdownDocument(result.content).blocks.filter(block => block.kind === 'html').map(block => block.html).join('')
    expect(parsed.querySelector('a')?.title).toBe('Helpful')
    expect(parsed.querySelector('p > code')?.textContent).toBe(' x ')
    expect(parsed.querySelector('ul')).toBeNull()
  })

  it('受保护的原始 HTML 文本被修改时明确失败，不静默还原为原文', () => {
    const content = '正文\n\n<div>不可静默丢失的原始 HTML</div>\n'
    const host = document.createElement('article')
    host.innerHTML = ui.renderMarkdownDocument(content).blocks.filter(block => block.kind === 'html').map(block => block.html).join('')
    const editing = captureMarkdownEdit(content, host)
    const raw = [...host.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent?.includes('不可静默'))!
    raw.textContent = '用户改过的 HTML 文字'
    expect(editing.read().success).toBe(false)
  })

  it('无效表格的重复行 ID 不交给 keyed each 渲染', () => {
    expect(readArtifactTable(JSON.stringify({
      table_columns: [
        { key: 'name', label: 'Name', type: 'text' },
      ],
      table_rows: [
        { row_id: 'same' },
        { row_id: 'same' },
      ],
    }))).toBeUndefined()
  })
})

describe('交互 HTML 预览', () => {
  it('优先安装离线 CSP，保留内联交互，移除刷新和 base 跳转', () => {
    const content = '<html><head><base href="https://private.invalid/"><meta http-equiv="refresh" content="0;url=https://private.invalid/"></head><body><button onclick="this.textContent=42">Run</button><script>window.count=1</script></body></html>'
    const preview = prepareHtmlPreview(content)
    const document = new DOMParser().parseFromString(preview, 'text/html')
    expect(document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')).toContain('connect-src \'none\'')
    expect(document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')).toContain('script-src \'unsafe-inline\'')
    expect(document.querySelector('base')).toBeNull()
    expect(document.querySelector('meta[http-equiv="refresh"]')).toBeNull()
    expect(document.querySelector('button')?.getAttribute('onclick')).toBe('this.textContent=42')
    expect(preview.indexOf('Content-Security-Policy')).toBeLessThan(preview.indexOf('window.count'))
  })
})

describe('工具参数表单', () => {
  const schema = {
    type: 'object',
    required: ['prompt', 'count'],
    properties: {
      prompt: { type: 'string', title: 'Prompt', minLength: 1 },
      count: { type: 'integer', default: 2, minimum: 1 },
      transparent: { type: 'boolean', default: false },
      size: {
        type: 'string',
        enum: ['small', 'large'],
        default: 'small',
      },
      options: { type: 'object' },
    },
  }

  it('读取简单字段、默认值与必填项，复杂参数留在高级入口', () => {
    expect(describeToolFields(schema).map(field => [field.name, field.required, field.kind])).toEqual([
      ['prompt', true, 'string'],
      ['count', true, 'integer'],
      ['transparent', false, 'boolean'],
      ['size', false, 'enum'],
      ['options', false, 'json'],
    ])
    const result = buildToolInput(schema, {
      prompt: 'A product image',
      count: '3',
      transparent: false,
      size: 'large',
      options: '{"seed":7}',
    })
    expect(result).toEqual({
      success: true,
      input: {
        prompt: 'A product image',
        count: 3,
        transparent: false,
        size: 'large',
        options: { seed: 7 },
      },
    })
  })

  it('拒绝空的必填数字、非整数和非法 JSON，保留 boolean false', () => {
    expect(buildToolInput(schema, { prompt: 'image', count: '', transparent: false }).success).toBe(false)
    expect(buildToolInput(schema, { prompt: 'image', count: '1.5' }).success).toBe(false)
    expect(buildToolInput(schema, { prompt: 'image', count: '2', options: '{bad}' }).success).toBe(false)
    expect(buildToolInput(schema, { prompt: 'image' })).toEqual({
      success: true,
      input: {
        prompt: 'image',
        count: 2,
        transparent: false,
        size: 'small',
      },
    })
  })

  it('字符串的 required 只要求字段存在，保留显式空串以及数字零和 false', () => {
    const schema = {
      required: ['replacement'],
      properties: {
        replacement: { type: 'string' },
        count: { type: 'integer' },
        enabled: { type: 'boolean' },
      },
    }
    expect(buildToolInput(schema, { replacement: '', count: 0, enabled: false })).toEqual({
      success: true,
      input: { replacement: '', count: 0, enabled: false },
    })
    expect(buildToolInput(schema, {}).success).toBe(false)
  })

  it('资源格式进入专用字段，并把手工多 ID 兜底转换为数组', () => {
    const schema = {
      properties: {
        fileId: { type: 'string', format: 'artifact-id', contentMediaType: 'application/pdf' },
        referenceIds: {
          type: 'array',
          format: 'artifact-ids',
          contentMediaType: 'image/*',
          items: { type: 'string' },
        },
      },
    }
    expect(describeToolFields(schema).map(field => field.kind)).toEqual(['resource', 'resources'])
    expect(buildToolInput(schema, { fileId: 'report-id', referenceIds: 'image-a\nimage-b' })).toEqual({
      success: true,
      input: {
        fileId: 'report-id',
        referenceIds: ['image-a', 'image-b'],
      },
    })
  })

  it('资源选项过滤 MIME 并保留未知手工 ID，多选限制仍验证', () => {
    expect(toolResourceOptions([
      { id: 'photo', title: 'Photo', mediaType: 'image/png' },
      { id: 'report', title: 'Report', mediaType: 'application/pdf' },
      { id: 'unknown', title: 'Unknown type' },
    ], 'image/*', ['manual-photo'])).toEqual([
      { value: 'photo', label: 'Photo', description: 'image/png' },
      { value: 'manual-photo', label: 'manual-photo' },
    ])
    const schema = {
      properties: {
        ids: {
          type: 'array',
          format: 'artifact-ids',
          minItems: 1,
          maxItems: 2,
        },
      },
    }
    expect(buildToolInput(schema, { ids: [] }).success).toBe(false)
    expect(buildToolInput(schema, {
      ids: [42],
    }).success).toBe(false)
    expect(buildToolInput(schema, { ids: 'a,b,c' }).success).toBe(false)
  })
})
