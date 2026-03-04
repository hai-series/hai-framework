import { describe, expect, it } from 'vitest'
import config from '../svelte.config.js'

describe('svelte.config.js alias', () => {
  it('points @h-ai/* aliases to package roots', () => {
    const alias = config.kit?.alias ?? {}

    expect(alias['@h-ai/ai']).toBe('../../packages/ai')
    expect(alias['@h-ai/cache']).toBe('../../packages/cache')
    expect(alias['@h-ai/core']).toBe('../../packages/core')
    expect(alias['@h-ai/crypto']).toBe('../../packages/crypto')
    expect(alias['@h-ai/reldb']).toBe('../../packages/db')
    expect(alias['@h-ai/iam']).toBe('../../packages/iam')
    expect(alias['@h-ai/kit']).toBe('../../packages/kit')
    expect(alias['@h-ai/storage']).toBe('../../packages/storage')
    expect(alias['@h-ai/ui']).toBe('../../packages/ui')
    expect(alias['@h-ai/ui/*']).toBe('../../packages/ui/*')
  })
})
