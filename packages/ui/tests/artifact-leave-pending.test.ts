// @vitest-environment jsdom
import type { ArtifactDocument, WorkspaceLeaveGuard } from '../src/lib/components/scenes/tools/workspace-types.js'
import { flushSync, mount, unmount } from 'svelte'
import { expect, it, vi } from 'vitest'
import ArtifactWorkspace from '../src/lib/components/scenes/tools/ArtifactWorkspace.svelte'
import { uiM } from '../src/lib/messages.js'

it('首次创建未完成且没有已加载文档时，确认离开取消等待并避免第二次原生提示', async () => {
  const target = document.body.appendChild(document.createElement('div'))
  const show = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal')
  const close = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close')
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value() { this.open = true },
  })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value() { this.open = false },
  })
  const pending = Promise.withResolvers<ArtifactDocument>()
  let submittedSignal: AbortSignal | undefined
  let guard: WorkspaceLeaveGuard | undefined
  const component = mount(ArtifactWorkspace, {
    target,
    props: {
      artifacts: [],
      onread: async () => { throw new Error('There is no loaded artifact') },
      onleaveguard: (value) => { guard = value },
      oncreate: (_input, signal) => {
        submittedSignal = signal
        return pending.promise
      },
    },
  })
  try {
    flushSync()
    const findButton = (text: string) => [
      ...target.querySelectorAll('button'),
    ].find(button => button.textContent?.trim() === text)!
    findButton(uiM('artifact_new')).click()
    flushSync()
    const title = target.querySelector<HTMLInputElement>('form input')!
    title.value = 'My first artifact'
    title.dispatchEvent(new Event('input', { bubbles: true }))
    target.querySelector('form')!.requestSubmit()
    await vi.waitFor(() => expect(submittedSignal).toBeDefined())
    const pendingUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(pendingUnload)
    expect(pendingUnload.defaultPrevented).toBe(true)

    const allowed = guard!()
    flushSync()
    findButton(uiM('artifact_discard')).click()
    expect(await allowed).toBe(true)
    const confirmedUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(confirmedUnload)
    expect(confirmedUnload.defaultPrevented).toBe(false)
    expect(submittedSignal!.aborted).toBe(true)
  }
  finally {
    await unmount(component)
    pending.resolve({
      id: 'late',
      title: 'Late response',
      kind: 'markdown',
      version: 1,
      content: '# Late response',
    })
    if (show)
      Object.defineProperty(HTMLDialogElement.prototype, 'showModal', show)
    else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
    if (close)
      Object.defineProperty(HTMLDialogElement.prototype, 'close', close)
    else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
    target.remove()
  }
})
