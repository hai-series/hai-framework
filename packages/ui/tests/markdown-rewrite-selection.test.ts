// @vitest-environment jsdom
import type { MarkdownRewriteRequest, MarkdownSelectionSnapshot } from '../src/lib/components/scenes/ai/document-types.js'
import { flushSync, mount, unmount } from 'svelte'
import { describe, expect, it, vi } from 'vitest'
import AiDocumentEditor from '../src/lib/components/scenes/ai/AiDocumentEditor.svelte'
import { renderMarkdownDocument } from '../src/lib/components/scenes/ai/document-parse.js'
import { readMarkdownSelection } from '../src/lib/components/scenes/tools/artifact-markdown.js'

function render(content: string) {
  const host = document.createElement('article')
  host.innerHTML = renderMarkdownDocument(content, { enableHighlight: false, showCopyButton: false }).blocks.map(block => block.kind === 'html'
    ? block.html
    : '<div class="hai-md-mermaid"></div>').join('')
  return host
}

function snapshot(host: HTMLElement, block: Element, start = 0, end = block.textContent?.length ?? 0): MarkdownSelectionSnapshot {
  const prefix = document.createRange()
  prefix.selectNodeContents(host)
  prefix.setEndBefore(block)
  const offset = prefix.toString().length
  return {
    start: offset + start,
    end: offset + end,
    text: (block.textContent ?? '').slice(start, end),
  }
}

describe('可视 Markdown 改写选区的精确源码映射', () => {
  it('编辑器选区工具条把实际纯文本偏移交给宿主，以便映射加粗和链接源码', async () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
    const rectangle = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect')
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(40, 100, 200, 20),
    })
    const target = document.body.appendChild(document.createElement('div'))
    const onrewrite = vi.fn<(request: MarkdownRewriteRequest) => void>()
    const content = 'Hello **world** and [today](https://example.com).'
    const component = mount(AiDocumentEditor, {
      target,
      props: {
        content,
        showOutline: false,
        showToolbar: false,
        enableHighlight: false,
        onrewrite,
        rewriteActions: [
          { id: 'shorten', label: 'Shorten' },
        ],
      },
    })
    try {
      flushSync()
      const article = target.querySelector('article')!
      const range = document.createRange()
      range.selectNodeContents(article.querySelector('p')!)
      window.getSelection()!.removeAllRanges()
      window.getSelection()!.addRange(range)
      article.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
      await vi.waitFor(() => expect(target.querySelector('.hai-ai-doc-selection-toolbar button')).not.toBeNull())
      target.querySelector<HTMLButtonElement>('.hai-ai-doc-selection-toolbar button')!.click()
      await vi.waitFor(() => expect(onrewrite).toHaveBeenCalledOnce())
      const request = onrewrite.mock.calls[0]![0]
      expect(request.selectionSnapshot).toMatchObject({ start: 0, end: 22, text: 'Hello world and today.' })
      expect(readMarkdownSelection(content, article, request.selectionSnapshot!)).toEqual({ success: true, selectedText: content })
    }
    finally {
      await unmount(component)
      target.remove()
      window.getSelection()?.removeAllRanges()
      vi.unstubAllGlobals()
      if (rectangle)
        Object.defineProperty(Range.prototype, 'getBoundingClientRect', rectangle)
      else Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect')
    }
  })

  it('跨完整加粗和链接的段落选区返回原始 Markdown，而非可视纯文本', () => {
    const source = '# Introduction\n\nHello **world** and [today](https://example.com "Reference").\n\n```ts\nconst unchanged = true\n```\n'
    const host = render(source)
    const paragraph = host.querySelector('p')!
    expect(readMarkdownSelection(source, host, snapshot(host, paragraph))).toEqual({ success: true, selectedText: 'Hello **world** and [today](https://example.com "Reference").' })
    const range = snapshot(host, paragraph, 6, 21)
    expect(readMarkdownSelection(source, host, range)).toEqual({ success: true, selectedText: '**world** and [today](https://example.com "Reference")' })
  })

  it('相同可视文字通过快照定位实际块，不查找第一个匹配段落', () => {
    const source = 'Hello **world**.\n\nHello [world](https://example.com).\n'
    const host = render(source)
    const second = host.querySelectorAll('p')[1]!
    expect(readMarkdownSelection(source, host, snapshot(host, second))).toEqual({ success: true, selectedText: 'Hello [world](https://example.com).' })
  })

  it('保留 CRLF 和原始链接写法，标题只投影正文范围', () => {
    const source = '## Hello **world** and [today](<https://example.com> "Title")\r\n\r\nText.\r\n'
    const host = render(source)
    expect(readMarkdownSelection(source, host, snapshot(host, host.querySelector('h2')!))).toEqual({ success: true, selectedText: 'Hello **world** and [today](<https://example.com> "Title")' })
  })

  it('拒绝切断格式标记、跨块、复杂块或过期快照，不猜测替换范围', () => {
    const source = 'Hello **world** today.\n\nNext paragraph.\n\n```ts\nconst value = 1\n```\n'
    const host = render(source)
    const first = host.querySelector('p')!
    expect(readMarkdownSelection(source, host, snapshot(host, first, 1, 8)).success).toBe(false)
    expect(readMarkdownSelection(source, host, { start: 0, end: host.textContent!.length, text: host.textContent! }).success).toBe(false)
    expect(readMarkdownSelection(source, host, snapshot(host, host.querySelector('pre')!)).success).toBe(false)
    expect(readMarkdownSelection(source, host, {
      ...snapshot(host, first),
      text: 'Stale selection',
    }).success).toBe(false)
    first.querySelector('strong')!.replaceWith(Object.assign(document.createElement('em'), { textContent: 'world' }))
    expect(readMarkdownSelection(source, host, snapshot(host, first)).success).toBe(false)
  })
})
