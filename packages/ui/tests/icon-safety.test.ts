import { describe, expect, it } from 'vitest'
import { sanitizeInlineSvg } from '../src/lib/internal/icon-safety.js'

describe('sanitizeInlineSvg', () => {
  it('保留简单的内联 SVG', () => {
    const svg = '<svg viewBox="0 0 24 24"><path d="M1 1h2" /></svg>'
    expect(sanitizeInlineSvg(svg)).toBe(svg)
  })

  it.each([
    '<svg><script>alert(1)</script></svg>',
    '<svg><style>@import url(https://example.com/x.css)</style></svg>',
    '<svg><use href="https://example.com/icon.svg#x" /></svg>',
    '<svg><path style="fill:url(https://example.com/x)" /></svg>',
    '<svg onload="alert(1)"><path /></svg>',
  ])('拒绝带可执行或外部资源能力的 SVG', (svg) => {
    expect(sanitizeInlineSvg(svg)).toBe('')
  })
})
