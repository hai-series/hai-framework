/**
 * =============================================================================
 * @hai/ui - Toast 状态管理测试
 * =============================================================================
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 由于 toast 使用 Svelte 5 Runes，需要模拟环境
// 这里测试 toast 的核心逻辑

describe('toastState', () => {
  let ToastState: any
  let toast: any

  beforeEach(async () => {
    vi.useFakeTimers()
    // 动态导入以确保每次测试获得新实例
    vi.resetModules()
    const module = await import('../src/lib/toast.svelte.js')
    toast = module.toast
  })

  afterEach(() => {
    vi.useRealTimers()
    toast?.clear?.()
  })

  it('应该添加 Toast', () => {
    const id = toast.add({ message: '测试消息', variant: 'info' })
    expect(id).toBeDefined()
    expect(typeof id).toBe('string')
  })

  it('应该移除 Toast', () => {
    const id = toast.add({ message: '测试消息', variant: 'info', duration: 0 })
    expect(toast.items.length).toBe(1)

    toast.remove(id)
    expect(toast.items.length).toBe(0)
  })

  it('应该清空所有 Toast', () => {
    toast.add({ message: '消息1', variant: 'info', duration: 0 })
    toast.add({ message: '消息2', variant: 'success', duration: 0 })
    toast.add({ message: '消息3', variant: 'error', duration: 0 })
    expect(toast.items.length).toBe(3)

    toast.clear()
    expect(toast.items.length).toBe(0)
  })

  it('应该支持 success 快捷方法', () => {
    const id = toast.success('操作成功')
    expect(id).toBeDefined()
    expect(toast.items[0].variant).toBe('success')
    expect(toast.items[0].message).toBe('操作成功')
  })

  it('应该支持 error 快捷方法', () => {
    const id = toast.error('操作失败')
    expect(id).toBeDefined()
    expect(toast.items[0].variant).toBe('error')
  })

  it('应该支持 warning 快捷方法', () => {
    const id = toast.warning('警告信息')
    expect(id).toBeDefined()
    expect(toast.items[0].variant).toBe('warning')
  })

  it('应该支持 info 快捷方法', () => {
    const id = toast.info('提示信息')
    expect(id).toBeDefined()
    expect(toast.items[0].variant).toBe('info')
  })

  it('应该自动关闭 Toast', () => {
    toast.add({ message: '测试消息', variant: 'info', duration: 3000 })
    expect(toast.items.length).toBe(1)

    vi.advanceTimersByTime(3000)
    expect(toast.items.length).toBe(0)
  })

  it('应该支持自定义持续时间', () => {
    toast.success('消息', 5000)
    expect(toast.items.length).toBe(1)

    vi.advanceTimersByTime(3000)
    expect(toast.items.length).toBe(1) // 还没到时间

    vi.advanceTimersByTime(2000)
    expect(toast.items.length).toBe(0) // 现在应该关闭了
  })

  it('应该设置默认位置', () => {
    toast.add({ message: '测试', variant: 'info' })
    expect(toast.items[0].position).toBe('top-right')
  })

  it('应该设置默认 dismissible', () => {
    toast.add({ message: '测试', variant: 'info' })
    expect(toast.items[0].dismissible).toBe(true)
  })

  it('duration 为 0 时不应自动关闭', () => {
    toast.add({ message: '测试', variant: 'info', duration: 0 })
    expect(toast.items.length).toBe(1)

    vi.advanceTimersByTime(10000)
    expect(toast.items.length).toBe(1) // 仍然存在
  })
})
