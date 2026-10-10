// @vitest-environment jsdom
import { flushSync, mount, unmount } from 'svelte'
import { describe, expect, it } from 'vitest'
import { UserProfile } from '../src/lib/components/scenes/iam/index.js'

describe('userProfile avatar policy', () => {
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
