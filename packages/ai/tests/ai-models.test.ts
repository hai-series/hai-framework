/**
 * models/build.mjs 模型清单测试
 *
 * 验证模型服务基础设施的清单扫描与校验：首批模型齐备、Schema 校验、provides 单/多能力、字段约束。
 * 仅覆盖 Node 侧构建工具的可测试部分（不涉及 Docker / 权重下载）。
 */

import { describe, expect, it } from 'vitest'
import { listImageNames, listImages, validateManifest } from '../models/build.mjs'

/** 合法清单基线（供逐项改写测试字段约束） */
function baseManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    name: 'sample',
    version: '1',
    image: 'hai-ai/sample',
    provides: ['audio.transcribe'],
    protocol: 'whisper',
    devices: ['cpu'],
    port: 8000,
    health: '/health',
    ...overrides,
  }
}

describe('models build.mjs 清单', () => {
  it('列出首批三个模型', () => {
    const names = listImageNames()
    expect(names).toContain('faster-whisper-large-v3')
    expect(names).toContain('indextts-2.5')
    expect(names).toContain('qwen3-4b')
  })

  it('全部清单通过 Schema 校验且字段完整', () => {
    const images = listImages()
    expect(images.length).toBeGreaterThanOrEqual(3)
    for (const manifest of images) {
      expect(manifest.provides.length).toBeGreaterThanOrEqual(1)
      expect(manifest.protocol).toBeTruthy()
      expect(manifest.devices.length).toBeGreaterThanOrEqual(1)
      expect(manifest.health.startsWith('/')).toBe(true)
      expect(manifest.port).toBeGreaterThan(0)
    }
  })

  it('whisper 清单声明 audio.transcribe / whisper', () => {
    const whisper = listImages().find(m => m.name === 'faster-whisper-large-v3')
    expect(whisper?.provides).toEqual(['audio.transcribe'])
    expect(whisper?.protocol).toBe('whisper')
    expect(whisper?.devices).toEqual(['cpu', 'gpu'])
  })

  it('indextts 清单声明 audio.synthesize / indextts', () => {
    const indextts = listImages().find(m => m.name === 'indextts-2.5')
    expect(indextts?.provides).toEqual(['audio.synthesize'])
    expect(indextts?.protocol).toBe('indextts')
  })

  it('qwen 清单声明 llm.chat / openai', () => {
    const qwen = listImages().find(m => m.name === 'qwen3-4b')
    expect(qwen?.provides).toEqual(['llm.chat'])
    expect(qwen?.protocol).toBe('openai')
  })

  it('非法清单（缺字段）校验失败', () => {
    const result = validateManifest({ schemaVersion: 1, name: 'x' })
    expect(result.success).toBe(false)
  })

  it('provides 支持一个或多个能力', () => {
    expect(validateManifest(baseManifest({ provides: ['audio.transcribe'] })).success).toBe(true)
    expect(validateManifest(baseManifest({ provides: ['audio.transcribe', 'audio.synthesize'] })).success).toBe(true)
  })

  it('空 provides 校验失败', () => {
    expect(validateManifest(baseManifest({ provides: [] })).success).toBe(false)
  })

  it('health 必须以 / 开头', () => {
    expect(validateManifest(baseManifest({ health: 'health' })).success).toBe(false)
  })

  it('devices 仅接受 cpu / gpu', () => {
    expect(validateManifest(baseManifest({ devices: ['tpu'] })).success).toBe(false)
  })
})
