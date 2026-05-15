import { apiServiceContract } from '@h-ai/api-contract'
import { describe, expect, it } from 'vitest'
import { generateSpec } from '../src/openapi/generate-openapi.js'

describe('generateSpec', () => {
  it('produces an OpenAPI document with bearer security scheme', async () => {
    const spec = await generateSpec(apiServiceContract, {
      title: 'test-service',
      version: '0.0.1',
      apiPrefix: '/api/v1',
    })

    expect(spec.openapi.startsWith('3.')).toBe(true)
    expect(spec.info.title).toBe('test-service')
    expect(spec.info.version).toBe('0.0.1')
    expect(spec.servers).toEqual([{ url: '/api/v1' }])
    expect(spec.components?.securitySchemes?.bearerAuth).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    })
    expect(spec.paths).toBeDefined()
    expect(Object.keys(spec.paths ?? {}).length).toBeGreaterThan(0)
  })

  it('skips servers when apiPrefix not provided', async () => {
    const spec = await generateSpec(apiServiceContract, { title: 'no-prefix' })
    expect(spec.servers).toBeUndefined()
  })
})
