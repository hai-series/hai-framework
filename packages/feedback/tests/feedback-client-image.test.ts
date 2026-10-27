// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { captureFeedbackScreenshot } from '../src/client/feedback-client-image.js'

const capture = vi.hoisted(() => vi.fn())
vi.mock('html2canvas', () => ({ default: capture }))

it('已取消或DOM超过预算时不进入昂贵的截图引擎', async () => {
  capture.mockClear()
  const controller = new AbortController()
  controller.abort()
  await expect(captureFeedbackScreenshot(controller.signal)).rejects.toBeDefined()
  expect(capture).not.toHaveBeenCalled()
  document.body.innerHTML = '<span></span>'.repeat(10001)
  await expect(captureFeedbackScreenshot()).rejects.toThrow('Screenshot document budget exceeded')
  expect(capture).not.toHaveBeenCalled()
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

it('普通控件保留外观并隐藏内容，密码和私密容器继续遮挡，原页面不变', async () => {
  document.body.innerHTML = '<input id="normal" style="background:rgb(255,255,255);border:1px solid red" value="private-normal-value"><input type="password" value="private-password"><div contenteditable="true">private-editable-value</div><div data-feedback-private><input value="private-child-value"></div>'
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  let clonedBody = ''
  capture.mockImplementation(async (_element: HTMLElement, options: { onclone: (clone: Document) => void }) => {
    const frame = document.createElement('iframe')
    document.body.append(frame)
    const clone = frame.contentDocument!
    clone.body.innerHTML = document.body.innerHTML.replace(/<iframe[\s\S]*?<\/iframe>/, '')
    options.onclone(clone)
    clonedBody = clone.body.innerHTML
    const replacements = clone.body.children
    expect((replacements[0] as HTMLElement).style.backgroundColor).toBe('rgb(255, 255, 255)')
    expect(replacements[0]!.textContent).toBe('••••')
    expect((replacements[1] as HTMLElement).style.backgroundColor).toBe('rgb(17, 17, 17)')
    expect(replacements[2]!.textContent).toBe('••••')
    expect(replacements[3]!.children).toHaveLength(0)
    frame.remove()
    return { toBlob: (callback: (blob: Blob) => void) => callback({ arrayBuffer: async () => new Uint8Array([1]).buffer } as Blob), width: 1, height: 1 }
  })
  await captureFeedbackScreenshot()
  expect(clonedBody).not.toContain('private-')
  expect((document.querySelector('#normal') as HTMLInputElement).value).toBe('private-normal-value')
  expect(document.querySelector('[contenteditable]')!.textContent).toBe('private-editable-value')
})
