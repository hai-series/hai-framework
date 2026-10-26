// @vitest-environment jsdom
import { flushSync, mount, unmount } from 'svelte'
import { expect, it, vi } from 'vitest'
import { ReauthenticationDialog } from '../src/lib/components/scenes/iam/index.js'
import { uiM } from '../src/lib/messages.js'

it('再鉴别对话框只提交当前密码，取消/关闭后不保留凭据', async () => {
  const target = document.createElement('div')
  document.body.append(target)
  const submit = vi.fn(async () => {})
  const cancel = vi.fn()
  const component = mount(ReauthenticationDialog, { target, props: { 'open': true, 'onsubmit': submit, 'onclose': cancel, 'data-testid': 'sensitive-confirmation' } })
  try {
    flushSync()
    const input = document.querySelector<HTMLInputElement>('[data-testid="reauthentication-password"] input')!
    expect(target.querySelector('[data-testid="sensitive-confirmation"]')?.contains(input)).toBe(true)
    expect(input.type).toBe('password')
    input.value = 'Current-example-123!'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector<HTMLFormElement>('[data-testid="reauthentication-form"]')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await vi.waitFor(() => expect(submit).toHaveBeenCalledWith('Current-example-123!'))
    await vi.waitFor(() => {
      flushSync()
      expect(input.value).toBe('')
    })
    input.value = 'Canceled-example-456!'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    flushSync()
    const cancelButton = [...target.querySelectorAll('button')].find(button => button.textContent?.trim() === uiM('confirm_cancel'))
    expect(cancelButton).toBeDefined()
    cancelButton!.click()
    flushSync()
    expect(cancel).toHaveBeenCalledOnce()
    expect(input.value).toBe('')
    expect(submit).toHaveBeenCalledOnce()
  }
  finally {
    await unmount(component)
    target.remove()
  }
})
