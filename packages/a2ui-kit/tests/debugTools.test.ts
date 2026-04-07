import { describe, expect, it } from 'vitest'

import { buildPreviewSurface, resolveDynamicValue } from '../src/debugPreview'
import { A2UI_DEBUG_PRESETS, deriveA2UiDebugState, formatJson } from '../src/debugTools'

describe('deriveA2UiDebugState', () => {
  it('accepts valid direct A2UI messages', () => {
    const input = JSON.stringify([
      {
        version: 'v0.10',
        createSurface: {
          surfaceId: 'demo',
          catalogId: '',
        },
      },
      {
        version: 'v0.10',
        updateComponents: {
          surfaceId: 'demo',
          components: [
            { id: 'root', component: 'Text', text: 'hello' },
          ],
        },
      },
      {
        version: 'v0.10',
        beginRendering: {
          surfaceId: 'demo',
          root: 'root',
        },
      },
    ])

    const result = deriveA2UiDebugState('messages', input)

    expect(result.isJsonValid).toBe(true)
    expect(result.error).toBeNull()
    expect(result.renderedMessages).toHaveLength(3)
    expect(result.pipeline).toContain('renderer')
  })

  it('flags legal-looking messages that still cannot render', () => {
    const input = JSON.stringify([
      {
        version: 'v0.10',
        beginRendering: {
          id: 'missing-surface-id',
        },
      },
    ])

    const result = deriveA2UiDebugState('messages', input)

    expect(result.isJsonValid).toBe(true)
    expect(result.error).toMatch(/surfaceId|root/i)
  })

  it('extracts messages from outputs with a double-encoded systemResponse', () => {
    const messages = [
      {
        version: 'v0.10',
        beginRendering: {
          id: 'double-encoded',
        },
      },
    ]
    const input = JSON.stringify({
      systemResponse: JSON.stringify(messages),
    })

    const result = deriveA2UiDebugState('outputs', input)

    expect(result.isJsonValid).toBe(true)
    expect(result.error).toBeNull()
    expect(result.extractedMessages).toEqual(messages)
    expect(result.renderedMessages).toEqual(messages)
  })

  it('reports invalid JSON cleanly', () => {
    const result = deriveA2UiDebugState('outputs', '{"systemResponse": ')

    expect(result.isJsonValid).toBe(false)
    expect(result.renderedMessages).toEqual([])
    expect(result.error).toMatch(/JSON/i)
  })
})

describe('formatJson', () => {
  it('pretty prints valid JSON and preserves invalid JSON', () => {
    expect(formatJson('{"a":1}')).toBe('{\n  "a": 1\n}')
    expect(formatJson('{oops')).toBe('{oops')
  })
})

describe('a2UI_DEBUG_PRESETS', () => {
  it('ships renderable message presets', () => {
    const presets = A2UI_DEBUG_PRESETS.filter(preset => preset.mode === 'messages')

    for (const preset of presets) {
      const result = deriveA2UiDebugState('messages', preset.input)
      expect(result.error, preset.id).toBeNull()
      expect(result.renderedMessages.length, preset.id).toBeGreaterThan(0)
    }
  })
})

describe('buildPreviewSurface', () => {
  it('builds a renderable preview surface from chart/table presets', () => {
    const tablePreset = A2UI_DEBUG_PRESETS.find(preset => preset.id === 'messages-table')
    expect(tablePreset).toBeDefined()

    const surface = buildPreviewSurface(JSON.parse(tablePreset!.input))

    expect(surface).not.toBeNull()
    expect(surface?.rootId).toBe('root')
    expect(surface?.components.get('tbl')?.component).toBe('Table')
  })

  it('resolves bound values from updateDataModel payloads', () => {
    const surface = buildPreviewSurface([
      {
        version: 'v0.10',
        createSurface: { surfaceId: 'bound', catalogId: '' },
      },
      {
        version: 'v0.10',
        updateDataModel: { surfaceId: 'bound', data: { title: '调试标题' } },
      },
      {
        version: 'v0.10',
        updateComponents: {
          surfaceId: 'bound',
          components: [
            { id: 'root', component: 'Text', text: { path: '/title' } },
          ],
        },
      },
      {
        version: 'v0.10',
        beginRendering: { surfaceId: 'bound', root: 'root' },
      },
    ])

    expect(surface).not.toBeNull()
    const root = surface?.components.get('root')
    expect(resolveDynamicValue(root?.text, surface!)).toBe('调试标题')
  })
})
