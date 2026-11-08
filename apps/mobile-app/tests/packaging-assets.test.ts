import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import capacitorConfig from '../capacitor.config.js'

const dockerfile = readFileSync(new URL('../images/web.Dockerfile', import.meta.url), 'utf-8')

describe('mobile packaging assets', () => {
  it('uses the same static assets for native packaging and the container', () => {
    const source = dockerfile.match(/COPY --from=build \/workspace\/apps\/mobile-app\/(\S+) \/usr\/share\/nginx\/html/)
    expect(source?.[1]).toBe(capacitorConfig.webDir)
  })
})
