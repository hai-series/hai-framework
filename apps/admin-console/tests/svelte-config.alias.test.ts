import { describe, expect, it } from 'vitest'
import config from '../svelte.config.js'

describe('svelte.config.js alias', () => {
  it('keeps only app local aliases', () => {
    const alias = config.kit?.alias ?? {}

    expect(alias.$components).toBe('./src/lib/components')
    expect(alias.$stores).toBe('./src/lib/stores')
    expect(alias.$utils).toBe('./src/lib/utils')
    expect(alias['@h-ai/kit']).toBeUndefined()
    expect(alias['@h-ai/ui']).toBeUndefined()
  })
})
