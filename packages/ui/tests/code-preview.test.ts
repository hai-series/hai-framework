/**
 * =============================================================================
 * @h-ai/ui - AI 代码预览安全测试
 * =============================================================================
 * 验证内置代码预览的默认安全边界与显式风险开关。
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import {
  createBuiltInCodePreview,
  resolvePreviewSandbox,
} from '../src/lib/components/scenes/ai/code-preview.js'

describe('createBuiltInCodePreview', () => {
  it('默认应仅允许 Markdown 内置预览', () => {
    const markdownPreview = createBuiltInCodePreview(
      {
        blockId: 'code-1',
        code: '# demo',
        language: 'markdown',
        sourceKind: 'code',
      },
      {
        previewTitle: 'Preview',
      },
    )

    const htmlPreview = createBuiltInCodePreview(
      {
        blockId: 'code-2',
        code: '<div>demo</div>',
        language: 'html',
        sourceKind: 'code',
      },
      {
        previewTitle: 'Preview',
      },
    )

    expect(markdownPreview).toEqual({
      kind: 'markdown',
      title: 'Preview',
      content: '# demo',
    })
    expect(htmlPreview).toBeUndefined()
  })

  it('显式开启风险开关后才允许 HTML / JS / CSS 预览', () => {
    const htmlPreview = createBuiltInCodePreview(
      {
        blockId: 'code-3',
        code: '<div>demo</div>',
        language: 'html',
        sourceKind: 'code',
      },
      {
        allowUnsafeCodePreview: true,
        previewTitle: 'Preview',
      },
    )

    const cssPreview = createBuiltInCodePreview(
      {
        blockId: 'code-4',
        code: '.demo { color: red; }',
        language: 'css',
        sourceKind: 'code',
      },
      {
        allowUnsafeCodePreview: true,
        previewTitle: 'Preview',
      },
    )

    expect(htmlPreview).toMatchObject({
      kind: 'html',
      title: 'Preview',
      content: '<div>demo</div>',
      allowScripts: true,
    })
    expect(cssPreview).toMatchObject({
      kind: 'html',
      title: 'Preview',
    })
    expect(cssPreview?.allowScripts).toBeUndefined()
  })

  it('javascript 预览应转义闭合 script 标签，避免破坏预览文档结构', () => {
    const preview = createBuiltInCodePreview(
      {
        blockId: 'code-5',
        code: 'console.log("x")\n</script><script>alert(1)</script>',
        language: 'javascript',
        sourceKind: 'code',
      },
      {
        allowUnsafeCodePreview: true,
        previewTitle: 'Preview',
      },
    )

    expect(preview?.kind).toBe('html')
    expect(preview?.content).toContain('<\\/script>')
    expect(preview?.allowScripts).toBe(true)
  })
})

describe('resolvePreviewSandbox', () => {
  it('默认应返回最严格的 sandbox', () => {
    expect(resolvePreviewSandbox(undefined)).toBe('')
    expect(resolvePreviewSandbox(false)).toBe('')
  })

  it('仅在显式声明时放开脚本执行', () => {
    expect(resolvePreviewSandbox(true)).toBe('allow-scripts')
  })
})
