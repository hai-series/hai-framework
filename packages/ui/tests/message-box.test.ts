// @vitest-environment jsdom
import { flushSync, mount, unmount } from 'svelte'
import { expect, it } from 'vitest'
import { MessageBoxContainer, ui } from '../src/lib/index.js'

it('命令式弹框按 showClose 控制关闭按钮并保留确认操作', async () => {
  const previous = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal')
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) { this.open = true },
  })
  const target = document.body.appendChild(document.createElement('div'))
  const component = mount(MessageBoxContainer, { target })
  try {
    const accepted = ui.messageBox.confirm({ message: 'Proceed?', confirmText: 'OK', showClose: false })
    flushSync()
    const dialog = document.querySelector('dialog[open]')!
    expect(dialog.querySelector('.hai-messagebox__close')).toBeNull()
    const confirmButton = [
      ...dialog.querySelectorAll('button'),
    ].find(button => button.textContent?.trim() === 'OK')!
    confirmButton.click()
    await expect(accepted).resolves.toBe(true)

    const dismissed = ui.messageBox.confirm('Proceed?')
    flushSync()
    document.querySelector<HTMLButtonElement>('dialog[open] .hai-messagebox__close')!.click()
    await expect(dismissed).resolves.toBe(false)
  }
  finally {
    for (const item of ui.messageBox.items)
      await ui.messageBox.handleClose(item)
    await unmount(component)
    target.remove()
    if (previous)
      Object.defineProperty(HTMLDialogElement.prototype, 'showModal', previous)
    else
      Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  }
})
