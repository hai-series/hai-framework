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
      const hour = target.querySelector<HTMLInputElement>('[data-schedule-hour] input')!
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

  it.each([
    [undefined, '', '[data-schedule-hour] input'],
    [
      {
        kind: 'schedule',
        timezone: 'Asia/Shanghai',
        precision: 'minute',
        allowCron: true,
      } as const,
      'invalid cron',
      '[data-cron-manual-input]',
    ],
  ])('associates the field ID and native validation focus with the visible control', async (config, value, selector) => {
    const target = host()
    const component = mount(ScheduleInput, {
      target,
      props: {
        config,
        value,
        id: 'when',
        name: 'scheduled_at',
        required: true,
      },
    })
    try {
      flushSync()
      const active = target.querySelector<HTMLInputElement>(selector)
      const proxy = target.querySelector<HTMLInputElement>('input[name="scheduled_at"]')
      expect(target.querySelector('#when')).toBe(active)
      expect(proxy?.checkValidity()).toBe(false)
      expect(document.activeElement).toBe(active)
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })

  it('checks a just-expired value before a native form hands the request to the host', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-02T04:00:55Z'))
    const target = host()
    const form = document.createElement('form')
    target.append(form)
    const submit = vi.fn()
    const component = mount(ScheduleInput, {
      target: form,
      props: { value: '2030-01-02T12:01:00+08:00', name: 'scheduled_at', required: true },
    })
    try {
      flushSync()
      form.addEventListener('submit', submit)
      expect(form.checkValidity()).toBe(true)
      vi.setSystemTime(new Date('2030-01-02T04:01:05Z'))
      // 模拟后台计时器尚未执行，校验仍必须以提交时刻为准。
      expect(form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }))).toBe(false)
      expect(submit).not.toHaveBeenCalled()
      expect(form.checkValidity()).toBe(false)
    }
    finally {
      await unmount(component)
      target.remove()
      vi.useRealTimers()
    }
  })
})
