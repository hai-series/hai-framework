import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import capacitorConfig from '../capacitor.config.js'
import config from '../svelte.config.js'

const dockerfile = readFileSync(new URL('../images/app.Dockerfile', import.meta.url), 'utf-8')

describe('svelte.config.js', () => {
  it('uses the same static assets for native packaging and the container', () => {
    expect(config.kit?.adapter?.name).toBe('@sveltejs/adapter-static')
    const source = dockerfile.match(/COPY --from=build \/workspace\/apps\/mobile-app\/(\S+) \/usr\/share\/nginx\/html/)
    expect(source?.[1]).toBe(capacitorConfig.webDir)
  })

  it('does not override @h-ai/ui workspace package resolution', () => {
    const alias = config.kit?.alias ?? {}
    expect(alias['@h-ai/ui']).toBeUndefined()
  })

  it('enables Svelte 5 runes', () => {
    expect(config.compilerOptions?.runes).toBe(true)
  })

  it('enables @h-ai/ui component auto import', () => {
    const preprocessors = Array.isArray(config.preprocess)
      ? config.preprocess
      : [config.preprocess]

    expect(preprocessors.some(preprocessor => preprocessor?.name === 'auto-import-hai-ui')).toBe(true)
  })
})
