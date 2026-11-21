// @vitest-environment jsdom
import { flushSync, mount, unmount } from 'svelte'
import { describe, expect, it, vi } from 'vitest'
import ScheduleInput from '../src/lib/components/compounds/ScheduleInput.svelte'
import ScheduleInputHarness from './fixtures/ScheduleInputHarness.svelte'

function host() {
  const target = document.createElement('div')
  document.body.append(target)
  return target
}

describe('scheduleInput', () => {
  it('shows a visible error and invalid state for an invalid Cron value', async () => {
    const target = host()
    const component = mount(ScheduleInput, {
      target,
      props: {
        config: {
          kind: 'schedule',
          timezone: 'Asia/Shanghai',
          precision: 'minute',
          allowCron: true,
        },
        value: 'not a cron expression',
        required: true,
      },
    })

    try {
      flushSync()
      expect(target.querySelector<HTMLInputElement>('[data-cron-manual-input]')?.getAttribute('aria-invalid')).toBe('true')
      expect(target.querySelector<HTMLInputElement>('input[aria-hidden="true"]')?.checkValidity()).toBe(false)
      expect(target.querySelector('p.text-error')?.textContent).toContain('Cron')
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })

  it('fails closed when allowCron is disabled without rewriting the Cron value', async () => {
    const target = host()
    const component = mount(ScheduleInputHarness, { target })

    try {
      flushSync()
      expect(target.querySelector('[data-valid]')?.textContent).toBe('true')
      expect(target.querySelector('[data-schedule]')?.textContent).toBe('0 10 * * *')
      expect(target.querySelector('[data-cron-manual-input]')).not.toBeNull()

      target.querySelector<HTMLButtonElement>('[data-toggle-cron]')!.click()
      flushSync()

      expect(target.querySelector('[data-cron-manual-input]')).toBeNull()
      expect(target.querySelector('[data-schedule]')?.textContent).toBe('0 10 * * *')
      expect(target.querySelector('[data-change-count]')?.textContent).toBe('0')
      expect(target.querySelector('[data-valid]')?.textContent).toBe('false')
      expect(target.querySelector<HTMLInputElement>('input[aria-hidden="true"]')?.checkValidity()).toBe(false)
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })

  it('writes canonical Beijing date-time values when the time fields change', async () => {
    const target = host()
    const onchange = vi.fn()
    const component = mount(ScheduleInput, {
      target,
      props: {
        value: '2026-11-23T10:05:00+08:00',
        onchange,
      },
    })

    try {
      flushSync()
      const hour = target.querySelector<HTMLInputElement>('[id$="-hour"]')!
      hour.value = '11'
      hour.dispatchEvent(new Event('input', { bubbles: true }))
      flushSync()

      expect(onchange).toHaveBeenLastCalledWith('2026-11-23T11:05:00+08:00')
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })
})
