import { describe, expect, it } from 'vitest'
import { createGuide } from '../src/lib/guide.svelte.js'

describe('guide server rendering boundary', () => {
  it('服务端创建实例不会读取 Cookie、DOM 或启动导览', async () => {
    const guide = createGuide({ tours: [{ id: 'intro', title: 'Tour', steps: [] }] })
    expect(guide.startIfNeeded('intro')).toBe(false)
    expect(await guide.start('intro')).toBe(false)
    expect(guide.pathname).toBe('')
    expect(guide.getProgress('intro')).toBeNull()
  })
})
