import { describe, expect, it } from 'vitest'
import config from '../svelte.config.js'

describe('svelte.config.js', () => {
  it('uses adapter-static for SPA output', () => {
    expect(config.kit?.adapter).toBeDefined()
  })

  it('points @h-ai/ui alias to package root', () => {
    const alias = config.kit?.alias ?? {}
    expect(alias['@h-ai/ui']).toContain('packages/ui')
  })

  it('enables Svelte 5 runes', () => {
    expect(config.compilerOptions?.runes).toBe(true)
  })
})
