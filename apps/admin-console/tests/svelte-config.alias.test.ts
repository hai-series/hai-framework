import { describe, expect, it } from 'vitest'
import config from '../svelte.config.js'

describe('svelte.config.js alias', () => {
  it('points @hai/* aliases to package roots', () => {
    const alias = config.kit?.alias ?? {}

    expect(alias['@hai/ai']).toBe('../../packages/ai')
    expect(alias['@hai/cache']).toBe('../../packages/cache')
    expect(alias['@hai/core']).toBe('../../packages/core')
    expect(alias['@hai/crypto']).toBe('../../packages/crypto')
    expect(alias['@hai/db']).toBe('../../packages/db')
    expect(alias['@hai/iam']).toBe('../../packages/iam')
    expect(alias['@hai/kit']).toBe('../../packages/kit')
    expect(alias['@hai/storage']).toBe('../../packages/storage')
    expect(alias['@hai/ui']).toBe('../../packages/ui')
    expect(alias['@hai/ui/*']).toBe('../../packages/ui/*')
  })
})
