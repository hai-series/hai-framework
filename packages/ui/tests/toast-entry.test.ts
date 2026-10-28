import { notifySuccess, toast } from '@h-ai/ui/toast'
import { afterEach, describe, expect, it } from 'vitest'

afterEach(() => toast.clear())

describe('通知状态的公开轻量入口', () => {
  it('无需加载界面 CSS 即可从包入口发送和移除通知', () => {
    const id = notifySuccess('保存完成', 0)
    expect(toast.items[0]?.id).toBe(id)
    expect(toast.items[0]?.message).toBe('保存完成')
    toast.remove(id)
    expect(toast.items).toEqual([])
  })
})
