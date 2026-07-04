import { describe, expect, it } from 'vitest'
import {
  createMermaidSourceSignature,
  getMermaidHostRenderAction,
  isCurrentMermaidRenderToken,
} from '../src/lib/components/scenes/ai/mermaid-host-sync.js'

describe('mermaid host sync', () => {
  it('重新渲染源码已变化的 ready/error host', () => {
    expect(
      getMermaidHostRenderAction({
        status: 'ready',
        renderedSignature: 'old',
        nextSignature: 'new',
      }),
    ).toEqual({ shouldRender: true, token: 'new' })

    expect(
      getMermaidHostRenderAction({
        status: 'error',
        renderedSignature: 'old',
        nextSignature: 'new',
      }),
    ).toEqual({ shouldRender: true, token: 'new' })
  })

  it('源码变化时允许新的渲染覆盖仍在进行的旧渲染', () => {
    expect(
      getMermaidHostRenderAction({
        status: 'rendering',
        renderedSignature: 'old',
        nextSignature: 'new',
      }),
    ).toEqual({ shouldRender: true, token: 'new' })
  })

  it('跳过同一份源码的 ready/rendering host', () => {
    expect(
      getMermaidHostRenderAction({
        status: 'ready',
        renderedSignature: 'same',
        nextSignature: 'same',
      }),
    ).toEqual({ shouldRender: false })

    expect(
      getMermaidHostRenderAction({
        status: 'rendering',
        renderedSignature: 'same',
        nextSignature: 'same',
      }),
    ).toEqual({ shouldRender: false })
  })

  it('用源码签名阻止旧的异步渲染结果覆盖新内容', () => {
    expect(isCurrentMermaidRenderToken('current', 'current')).toBe(true)
    expect(isCurrentMermaidRenderToken('old', 'current')).toBe(false)
  })

  it('源码签名包含源码正文而不只包含 block id', () => {
    const previous = createMermaidSourceSignature('hai-md-code-1', 'mindmap')
    const next = createMermaidSourceSignature('hai-md-code-1', 'mindmap\n  root((A))')

    expect(previous).not.toBe(next)
  })
})
