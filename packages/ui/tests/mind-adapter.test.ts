import { describe, expect, it } from 'vitest'
import { fromMindElixirData, toMindElixirData } from '../src/lib/components/scenes/ai/mind/mind-adapter.js'

describe('mind Elixir adapter', () => {
  it('round trips only stable project fields and preserves order', () => {
    const original = {
      kind: 'mind/v1' as const,
      layout: 'right' as const,
      root: {
        id: 'root',
        text: 'Plan',
        children: [
          { id: 'child', text: 'Build', children: [] },
        ],
      },
    }
    const engineData = toMindElixirData(original)
    expect(engineData.nodeData).toEqual({
      id: 'root',
      topic: 'Plan',
      children: [
        { id: 'child', topic: 'Build', children: [] },
      ],
    })
    expect(fromMindElixirData({
      nodeData: { ...engineData.nodeData, expanded: false },
    }, 'right')).toEqual(original)
  })

  it('rejects engine nodes without stable ids', () => {
    expect(() => fromMindElixirData({
      nodeData: { topic: 'No id' },
    }, 'right')).toThrow(TypeError)
  })

  it.each([
    ['right', 1],
    ['left', 0],
    ['both', 2],
  ] as const)('maps the %s layout to the engine direction', (layout, direction) => {
    const data = {
      kind: 'mind/v1' as const,
      layout,
      root: { id: 'r', text: 'Plan', children: [] },
    }
    expect(toMindElixirData(data).direction).toBe(direction)
  })
})
