import { describe, expect, it } from 'vitest'

describe('desktop-app', () => {
  it('should be configured as SPA mode', async () => {
    const layout = await import('../src/routes/+layout.ts')
    expect(layout.ssr).toBe(false)
    expect(layout.prerender).toBe(true)
  })
})
