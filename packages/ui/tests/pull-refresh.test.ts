// @vitest-environment jsdom
import { createRawSnippet, flushSync, mount, unmount } from 'svelte'
import { expect, it, vi } from 'vitest'
import { PullRefresh, ui } from '../src/lib/index.js'

function touch(target: HTMLElement, name: string, clientY: number) {
  const event = new Event(name, { bubbles: true })
  Object.defineProperty(event, 'touches', {
    value: [
      { clientY },
    ],
  })
  target.dispatchEvent(event)
  flushSync()
}

it('下拉刷新失败会提示并复位指示器，下一次手势仍可刷新', async () => {
  const target = document.body.appendChild(document.createElement('div'))
  const refresh = vi.fn<() => Promise<void>>()
    .mockRejectedValueOnce(new Error('private server details'))
    .mockResolvedValueOnce(undefined)
  const component = mount(PullRefresh, {
    target,
    props: {
      'data-testid': 'pull-refresh',
      'onrefresh': refresh,
      'children': createRawSnippet(() => ({
        render: () => '<div>Records</div>',
      })),
    },
  })
  try {
    flushSync()
    const region = target.querySelector<HTMLElement>('[data-testid="pull-refresh"]')!
    const indicator = region.firstElementChild as HTMLElement
    function pull() {
      touch(region, 'touchstart', 0)
      touch(region, 'touchmove', 200)
      expect(indicator.style.height).toBe('100px')
      touch(region, 'touchend', 200)
    }
    pull()
    await vi.waitFor(() => expect(indicator.style.height).toBe('0px'))
    expect(ui.toast.items.at(-1)).toMatchObject({
      variant: 'error',
      traceId: expect.any(String),
    })
    expect(ui.toast.items.at(-1)?.message).not.toContain('private server details')
    pull()
    await vi.waitFor(() => expect(indicator.style.height).toBe('0px'))
    expect(refresh).toHaveBeenCalledTimes(2)
    expect(ui.toast.items).toHaveLength(1)
  }
  finally {
    ui.toast.clear()
    await unmount(component)
    target.remove()
  }
})
