// @vitest-environment jsdom
import { flushSync, mount, tick, unmount } from 'svelte'
import { describe, expect, it, vi } from 'vitest'
import { UserProfile } from '../src/lib/components/scenes/iam/index.js'

describe('userProfile avatar policy', () => {
  it('保存被拒绝时保留编辑器与草稿，取消恢复服务端用户值', async () => {
    const target = document.createElement('div')
    document.body.append(target)
    const component = mount(UserProfile, {
      target,
      props: {
        user: { username: 'original' },
        editable: true,
        fields: ['username'],
        onsubmit: () => false,
      },
    })
    try {
      flushSync()
      target.querySelector<HTMLButtonElement>('button')!.click()
      flushSync()
      const input = target.querySelector<HTMLInputElement>('input[name=username]')!
      input.value = 'unsaved'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      const submit = target.querySelector<HTMLButtonElement>('button[type=submit]')!
      target.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      flushSync()
      await vi.waitFor(() => {
        flushSync()
        expect(submit.disabled).toBe(false)
      })
      expect(target.querySelector<HTMLInputElement>('input[name=username]')?.value).toBe('unsaved')
      target.querySelector<HTMLButtonElement>('button[type=button]')!.click()
      flushSync()
      expect(target.querySelector('input[name=username]')).toBeNull()
      expect(target.textContent).toContain('original')
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })
  it('明确保存成功后退出编辑', async () => {
    const target = document.createElement('div')
    document.body.append(target)
    const component = mount(UserProfile, {
      target,
      props: {
        user: { username: 'saved' },
        editable: true,
        fields: ['username'],
        onsubmit: () => true,
      },
    })
    try {
      flushSync()
      target.querySelector<HTMLButtonElement>('button')!.click()
      flushSync()
      target.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await vi.waitFor(() => {
        flushSync()
        expect(target.querySelector('input[name=username]')).toBeNull()
      })
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })
  it('保存抛错时保留编辑器并恢复可重试状态', async () => {
    const target = document.createElement('div')
    document.body.append(target)
    const component = mount(UserProfile, {
      target,
      props: {
        user: { username: 'saved' },
        editable: true,
        fields: ['username'],
        onsubmit: async () => { throw new Error('Fixture rejected') },
      },
    })
    try {
      flushSync()
      target.querySelector<HTMLButtonElement>('button')!.click()
      flushSync()
      target.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await tick()
      await tick()
      flushSync()
      expect(target.querySelector('input[name=username]')).not.toBeNull()
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })
  it('使用业务指定的头像提示与类型，未上传头像时显示用户姓名缩写', async () => {
    const target = document.createElement('div')
    document.body.append(target)
    const component = mount(UserProfile, {
      target,
      props: {
        user: { username: 'maya', displayName: 'Maya Lin' },
        editable: true,
        alwaysEditable: true,
        fields: ['avatar'],
        avatarAccept: 'image/png,image/jpeg,image/webp',
        avatarHint: 'PNG, JPEG or WebP, up to 512 KB',
      },
    })
    try {
      flushSync()
      expect(target.querySelector('input[type="file"]')?.getAttribute('accept')).toBe('image/png,image/jpeg,image/webp')
      expect(target.textContent).toContain('PNG, JPEG or WebP, up to 512 KB')
      expect(target.textContent).not.toContain('2MB')
      expect(target.querySelector('.avatar')?.textContent).toContain('ML')
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })
})
