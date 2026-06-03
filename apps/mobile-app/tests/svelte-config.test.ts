import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import config from '../svelte.config.js'

const svelteConfigSource = readFileSync(new URL('../svelte.config.js', import.meta.url), 'utf-8')

describe('svelte.config.js', () => {
  it('keeps adapter handling out of svelte.config.js', () => {
    expect(config.kit?.adapter).toBeUndefined()
  })

  it('does not override @h-ai/ui workspace package resolution', () => {
    const alias = config.kit?.alias ?? {}
    expect(alias['@h-ai/ui']).toBeUndefined()
  })

  it('enables Svelte 5 runes', () => {
    expect(config.compilerOptions?.runes).toBe(true)
  })

  it('keeps svelte.config.js free of direct SvelteKit references', () => {
    expect(svelteConfigSource).not.toContain('import(\'@sveltejs/kit\')')
    expect(svelteConfigSource).not.toContain('sveltekit()')
  })

  it('enables @h-ai/ui component auto import', () => {
    const preprocessors = Array.isArray(config.preprocess)
      ? config.preprocess
      : [config.preprocess]

    expect(preprocessors.some(preprocessor => preprocessor?.name === 'auto-import-hai-ui')).toBe(true)
  })
})
