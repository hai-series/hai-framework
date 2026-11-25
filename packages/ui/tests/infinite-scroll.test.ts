// @vitest-environment jsdom
import { createRawSnippet, flushSync, mount, unmount } from 'svelte'
import { describe, expect, it, vi } from 'vitest'
import { InfiniteScroll } from '../src/lib/components/compounds/index.js'

describe('无限滚动', () => {
  it.each(['list', 'parent', 'page'] as const)('在 %s 滚动到底部时加载下一页，并在请求期间忽略重复事件', async (scope) => {
    const parent = document.body.appendChild(document.createElement('div'))
    const pending = Promise.withResolvers<void>()
    const load = vi.fn(() => pending.promise)
    const component = mount(InfiniteScroll, {
      target: parent,
      props: {
        'data-testid': 'infinite-list',
        'threshold': 25,
        'onloadmore': load,
        'children': createRawSnippet(() => ({
          render: () => '<div>Records</div>',
        })),
      },
    })
    try {
      flushSync()
      const list = parent.querySelector<HTMLElement>('[data-testid="infinite-list"]')!
      const scrollTarget = scope === 'list'
        ? list
        : scope === 'parent'
          ? parent
          : document
      const viewportBottom = scope === 'parent'
        ? 300
        : window.innerHeight
      let remaining = 80
      Object.defineProperties(list, {
        clientHeight: { value: 200 },
        scrollHeight: {
          value: scope === 'list'
            ? 500
            : 200,
        },
        scrollTop: {
          get: () => scope === 'list'
            ? 300 - remaining
            : 0,
        },
      })
      vi.spyOn(list, 'getBoundingClientRect').mockImplementation(() => (
        new DOMRect(0, viewportBottom + remaining - 200, 100, 200)
      ))
      Object.defineProperty(parent, 'clientHeight', { value: 300 })
      vi.spyOn(parent, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 300))

      scrollTarget.dispatchEvent(new Event('scroll'))
      expect(load).not.toHaveBeenCalled()
      remaining = 10
      list.firstElementChild!.dispatchEvent(new Event('scroll'))
      expect(load).not.toHaveBeenCalled()
      scrollTarget.dispatchEvent(new Event('scroll'))
      scrollTarget.dispatchEvent(new Event('scroll'))
      expect(load).toHaveBeenCalledTimes(1)
    }
    finally {
      pending.resolve()
      await unmount(component)
      parent.remove()
    }
  })
})
