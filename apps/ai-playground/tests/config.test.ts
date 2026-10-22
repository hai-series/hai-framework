/**
 * AI Playground YAML 配置契约测试
 *
 * 验证应用确实扫描 config 目录，且 `_core.yml` 的日志等级和 `_ai.yml`
 * 的厂商配置均可被核心配置系统解析。
 */

import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { AIConfigSchema } from '@h-ai/ai'
import { CacheConfigSchema } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { ReldbConfigSchema } from '@h-ai/reldb'
import { VecdbConfigSchema } from '@h-ai/vecdb'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

describe('ai Playground YAML config', () => {
  beforeAll(() => {
    vi.stubEnv('AI_API_KEY', 'test-llm-key')
    vi.stubEnv('HAI_AI_IMAGE_POLLINATIONS_APIKEY', 'test-image-key')
    vi.stubEnv('HAI_AI_IMAGE_MAXIMAGEBYTES', '1024')
    vi.stubEnv('HAI_AI_IMAGE_MAXIMAGES', '2')
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
      expect(validated.data.image).toMatchObject({ maxImageBytes: 1024, maxImages: 2 })
      expect(validated.data.image?.models?.[0]).toMatchObject({
        provider: 'pollinations',
        model: 'zimage',
      })
    }
  })

  it('实际.env.prod被YAML消费为共享DB/Redis/Qdrant，凭据只由私有环境提供', () => {
    const profile = parseEnv(readFileSync('.env.prod', 'utf8'))
    expect(profile).not.toHaveProperty('HAI_DB_PASSWORD')
    expect(profile).not.toHaveProperty('HAI_AI_LLM_APIKEY')
    for (const [name, value] of Object.entries(profile))
      vi.stubEnv(name, value)
    core.init({ configDir: './config' })
    expect(core.config.validate('db', ReldbConfigSchema)).toMatchObject({ success: true, data: { type: 'postgresql', host: 'db' } })
    expect(core.config.validate('cache', CacheConfigSchema)).toMatchObject({ success: true, data: { type: 'redis', host: 'cache' } })
    expect(core.config.validate('vecdb', VecdbConfigSchema)).toMatchObject({ success: true, data: { type: 'qdrant', url: 'http://vecdb:6333' } })
  })
})
