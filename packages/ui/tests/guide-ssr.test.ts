import { ui } from '@h-ai/ui'
import { describe, expect, it } from 'vitest'

describe('guide server rendering boundary', () => {
  it('服务端创建实例不会读取 Cookie、DOM 或启动导览', async () => {
    const guide = ui.createGuide({
      tours: [
        { id: 'intro', title: 'Tour', steps: [] },
      ],
    })
    expect(guide.startIfNeeded('intro')).toBe(false)
    expect(await guide.start('intro')).toBe(false)
    expect(guide.pathname).toBe('')
    expect(guide.getProgress('intro')).toBeNull()
  })
})
