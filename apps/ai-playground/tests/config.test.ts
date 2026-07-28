/**
 * AI Playground YAML 配置契约测试
 *
 * 验证应用确实扫描 config 目录，且 `_core.yml` 的日志等级和 `_ai.yml`
 * 的厂商配置均可被核心配置系统解析。
 */

import { AIConfigSchema } from '@h-ai/ai'
import { core } from '@h-ai/core'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

describe('ai Playground YAML config', () => {
  beforeAll(() => {
    vi.stubEnv('AI_API_KEY', 'test-llm-key')
    vi.stubEnv('AI_IMAGE_API_KEY', 'test-image-key')
  })

  afterAll(() => {
    vi.unstubAllEnvs()
    core.logger.setLevel('info')
  })

  it('loads _core.yml logging and validates _ai.yml', () => {
    core.init({ configDir: './config' })

    expect(core.logger.getLevel()).toBe('debug')
    const validated = core.config.validate('ai', AIConfigSchema)
    const parsed = AIConfigSchema.safeParse(core.config.getOrThrow('ai'))
    expect(validated.success, parsed.success ? undefined : JSON.stringify(parsed.error.issues)).toBe(true)
    if (validated.success) {
      expect(validated.data.image?.generateModel).toBe('image')
      expect(validated.data.image?.models?.[0]).toMatchObject({
        provider: 'pollinations',
        model: 'zimage',
      })
    }
  })
})
