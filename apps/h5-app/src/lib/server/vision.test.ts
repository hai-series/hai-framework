import { describe, expect, it } from 'vitest'
import { parseVisionAnalysis } from './vision'

describe('parseVisionAnalysis', () => {
  it('parses valid JSON result', () => {
    const result = parseVisionAnalysis(JSON.stringify({
      summary: '图片里有一杯咖啡',
      details: ['桌面场景', '光线充足'],
      tags: ['咖啡', '桌面'],
      confidence: 0.91,
    }))

    expect(result.summary).toBe('图片里有一杯咖啡')
    expect(result.details).toEqual(['桌面场景', '光线充足'])
    expect(result.tags).toEqual(['咖啡', '桌面'])
    expect(result.confidence).toBe(0.91)
  })

  it('falls back for plain text response', () => {
    const result = parseVisionAnalysis('这是一张普通文本回复')
    expect(result.summary).toBe('这是一张普通文本回复')
    expect(result.details).toEqual([])
    expect(result.tags).toEqual([])
    expect(result.confidence).toBe(0.6)
  })

  it('clamps confidence into 0..1 range', () => {
    const high = parseVisionAnalysis('{"summary":"ok","confidence":9}')
    const low = parseVisionAnalysis('{"summary":"ok","confidence":-4}')
    expect(high.confidence).toBe(1)
    expect(low.confidence).toBe(0)
  })
})
