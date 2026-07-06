import { describe, expect, it } from 'vitest'
import { stripMermaidSvgStyleElements } from '../src/lib/components/scenes/ai/mermaid-render.js'

describe('mermaid render helpers', () => {
  it('removes style elements from rendered SVG before injecting into editable preview', () => {
    expect(stripMermaidSvgStyleElements('<svg><style>.node{color:red}</style><g>图</g></svg>'))
      .toBe('<svg><g>图</g></svg>')
  })
})
