// @vitest-environment jsdom
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FeedbackRecorder from '../src/lib/components/scenes/app/FeedbackRecorder.svelte'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function button(target: ParentNode, text: string) {
  const found = [...target.querySelectorAll('button')].find(item => item.textContent?.trim() === text)
  expect(found).toBeDefined()
  return found!
}

describe('反馈短录屏', () => {
  it.each(['停止', '取消', '共享结束', '超时', '卸载'] as const)('%s释放共享流，只有有效录屏成为附件', async (action) => {
    if (action === '超时')
      vi.useFakeTimers()
    const track = Object.assign(new EventTarget(), { stop: vi.fn() })
    const getDisplayMedia = vi.fn(async () => ({ getTracks: () => [track], getVideoTracks: () => [track] }))
    vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia } })
    class Recorder {
      static isTypeSupported() {
        return true
      }

      state = 'inactive'
      ondataavailable?: (event: { data: Blob }) => void
      onstop?: () => void
      onerror?: () => void
      constructor(_stream: unknown, readonly options: MediaRecorderOptions) {}
      start() {
        this.state = 'recording'
      }

      stop() {
        this.state = 'inactive'
        // 原生结束事件异步发送；最终数据写出前不能关闭共享轨道。
        queueMicrotask(() => {
          const bytes = track.stop.mock.calls.length ? new Uint8Array() : new Uint8Array([0x1A, 0x45, 0xDF, 0xA3, 0, 0, 0, 0, 0, 0, 0, 0])
          this.ondataavailable?.({ data: new Blob([bytes]) })
          void this.onstop?.()
        })
      }
    }
    vi.stubGlobal('MediaRecorder', Recorder)
    const target = document.createElement('div')
    document.body.append(target)
    const onrecord = vi.fn(async (_file: File) => {})
    const onactive = vi.fn()
    const component = mount(FeedbackRecorder, { target, props: { onrecord, onactive } })
    let disposed = false
    try {
      flushSync()
      button(target, '录屏').click()
      flushSync()
      button(target, '开始录屏').click()
      await vi.waitFor(() => expect(onactive).toHaveBeenCalledWith(true))
      expect(getDisplayMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: false }))
      if (action === '卸载') {
        await unmount(component)
        disposed = true
      }
      else if (action === '共享结束') {
        track.dispatchEvent(new Event('ended'))
      }
      else if (action === '超时') {
        await vi.advanceTimersByTimeAsync(60_000)
      }
      else {
        button(document.body, action === '停止' ? '停止录屏' : '取消录屏').click()
      }
      await Promise.resolve()
      expect(track.stop).toHaveBeenCalledOnce()
      if (action === '停止' || action === '共享结束' || action === '超时') {
        expect(onrecord).toHaveBeenCalledOnce()
        expect(onrecord.mock.calls[0]![0]).toMatchObject({ type: 'video/webm', size: 12 })
      }
      else {
        expect(onrecord).not.toHaveBeenCalled()
      }
    }
    finally {
      if (!disposed)
        await unmount(component)
      target.remove()
    }
  })

  it('用户拒绝选择时保留反馈入口并显示可重试提示', async () => {
    vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia: vi.fn(async () => {
      throw new DOMException('Denied', 'NotAllowedError')
    }) } })
    vi.stubGlobal('MediaRecorder', class {
      static isTypeSupported() {
        return true
      }
    })
    const target = document.createElement('div')
    document.body.append(target)
    const onactive = vi.fn()
    const component = mount(FeedbackRecorder, { target, props: { onrecord: vi.fn(), onactive } })
    try {
      flushSync()
      button(target, '录屏').click()
      flushSync()
      button(target, '开始录屏').click()
      await vi.waitFor(() => expect(target.querySelector('[role="alert"]')?.textContent).toContain('录屏未完成'))
      expect(onactive).not.toHaveBeenCalled()
      expect(button(target, '开始录屏').disabled).toBe(false)
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })
})
