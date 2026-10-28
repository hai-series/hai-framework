// @vitest-environment jsdom
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EncryptedInput } from '../src/lib/components/scenes/crypto/index.js'
import { toast } from '../src/lib/toast.svelte.js'

afterEach(() => toast.clear())

describe('encryptedInput', () => {
  it('乱序、清空和卸载后不接受旧结果，失败可见', async () => {
    const pending: Array<{ resolve: (value: string) => void, reject: (error: Error) => void }> = []
    const onencrypt = () => new Promise<string>((resolve, reject) => pending.push({ resolve, reject }))
    const target = document.createElement('div')
    document.body.append(target)
    const component = mount(EncryptedInput, { target, props: { showEncrypted: true, onencrypt } })
    let unmounted = false
    async function input(value: string) {
      const element = target.querySelector('input')!
      element.value = value
      element.dispatchEvent(new Event('input', { bubbles: true }))
      flushSync()
      await Promise.resolve()
    }
    try {
      flushSync()
      await input('first')
      await input('second')
      pending[1]!.resolve('cipher-second')
      await vi.waitFor(() => expect(target.querySelector('code')?.textContent).toContain('cipher-second'))
      pending[0]!.resolve('cipher-first')
      await Promise.resolve()
      flushSync()
      expect(target.querySelector('code')?.textContent).toContain('cipher-second')
      await input('third')
      expect(target.querySelector('code')).toBeNull()
      await input('')
      pending[2]!.resolve('stale')
      await Promise.resolve()
      flushSync()
      expect(target.querySelector('code')).toBeNull()
      await input('reject')
      pending[3]!.reject(new Error('failure'))
      await vi.waitFor(() => expect(toast.items.at(-1)?.variant).toBe('error'))
      expect(target.querySelector('[role="alert"]')).toBeNull()
      expect(target.querySelector('code')).toBeNull()
      await input('unmount')
      await unmount(component)
      unmounted = true
      pending[4]!.resolve('late')
      await Promise.resolve()
      expect(target.textContent).toBe('')
    }
    finally {
      if (!unmounted)
        await unmount(component)
      target.remove()
    }
  })

  it('未配置加密时中文输入不会产生伪密文', async () => {
    const target = document.createElement('div')
    document.body.append(target)
    const component = mount(EncryptedInput, { target, props: { showEncrypted: true } })
    try {
      flushSync()
      const input = target.querySelector('input')!
      input.value = '中文 🔐'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      flushSync()
      expect(toast.items.at(-1)?.variant).toBe('warning')
      expect(target.querySelector('code')).toBeNull()
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })
})
