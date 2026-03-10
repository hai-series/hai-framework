import { describe, expect, it } from 'vitest'
import config from '../svelte.config.js'

describe('svelte.config.js alias', () => {
  it('points @h-ai/* aliases to package sources', () => {
    const alias = config.kit?.alias ?? {}

    // 有 browser/node 双入口的包由 haiResolvePlugin 条件解析，不在此处声明
    // 只验证在 svelte.config.js 中显式声明的别名
    expect(alias['@h-ai/audit']).toContain('packages/audit')
    expect(alias['@h-ai/cache']).toContain('packages/cache')
    expect(alias['@h-ai/crypto']).toContain('packages/crypto')
    expect(alias['@h-ai/reldb']).toContain('packages/reldb')
    expect(alias['@h-ai/kit']).toContain('packages/kit')
    expect(alias['@h-ai/reach']).toContain('packages/reach')
    expect(alias['@h-ai/ui']).toContain('packages/ui')
    expect(alias['@h-ai/ui/*']).toBe('../../packages/ui/*')
  })
})
