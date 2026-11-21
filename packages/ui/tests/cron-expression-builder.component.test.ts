// @vitest-environment jsdom
import { flushSync, mount, unmount } from 'svelte'
import { describe, expect, it, vi } from 'vitest'
import CronExpressionBuilder from '../src/lib/components/compounds/CronExpressionBuilder.svelte'

function host() {
  const target = document.createElement('div')
  document.body.append(target)
  return target
}

describe('cronExpressionBuilder', () => {
  it('opens its configuration panel and writes visual mode changes through onchange', async () => {
    const target = host()
    const onchange = vi.fn()
    const component = mount(CronExpressionBuilder, {
      target,
      props: {
        id: 'schedule-cron',
        name: 'schedule',
        value: '0 10 * * *',
        onchange,
      },
    })

    try {
      flushSync()
      const input = target.querySelector<HTMLInputElement>('[data-cron-manual-input]')!
      expect(input.value).toBe('0 10 * * *')
      expect(target.querySelector('[data-cron-config-panel]')).toBeNull()

      input.focus()
      flushSync()
      expect(target.querySelector('[data-cron-config-panel]')).not.toBeNull()

      target.querySelector<HTMLButtonElement>('[data-cron-mode="minute"]')!.click()
      flushSync()
      expect(input.value).toBe('*/5 * * * *')
      expect(target.querySelector<HTMLInputElement>('input[type="hidden"][name="schedule"]')?.value).toBe('*/5 * * * *')
      expect(onchange).toHaveBeenLastCalledWith('*/5 * * * *')
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })

  it('preserves manual custom expressions and prevents changes while disabled', async () => {
    const target = host()
    const onchange = vi.fn()
    const component = mount(CronExpressionBuilder, {
      target,
      props: {
        value: '0 0 L * *',
        disabled: true,
        onchange,
      },
    })

    try {
      flushSync()
      const input = target.querySelector<HTMLInputElement>('[data-cron-manual-input]')!
      expect(input.value).toBe('0 0 L * *')
      expect(input.disabled).toBe(true)
      input.dispatchEvent(new Event('focus', { bubbles: true }))
      flushSync()
      expect(target.querySelector('[data-cron-config-panel]')).toBeNull()
      expect(onchange).not.toHaveBeenCalled()
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })
})
