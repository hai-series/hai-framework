/**
 * =============================================================================
 * @h-ai/ui - Toast 状态管理测试
 * =============================================================================
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 由于 toast 使用 Svelte 5 Runes，需要模拟环境
// 这里测试 toast 的核心逻辑

/** Toast 模块类型 */
type ToastModule = typeof import('../src/lib/toast.svelte.js')

describe('toastState', () => {
  let toast: ToastModule['toast']

  beforeEach(async () => {
    // 动态导入以确保每次测试获得新实例
    // 注意：必须先完成模块导入，再启用 fake timers，避免导入流程被假时钟阻塞
    vi.resetModules()
    const module = await import('../src/lib/toast.svelte.js') as ToastModule
    toast = module.toast
    vi.useFakeTimers()
  })

  afterEach(() => {
    // 先清理状态，再恢复真实时钟
    toast?.clear?.()
    vi.useRealTimers()
  })

  it('应该添加 Toast', () => {
    const id = toast.add({ message: '测试消息', variant: 'info' })
    expect(id).toBeDefined()
    expect(typeof id).toBe('string')
  })

  it('长空白消息保留可读内容，多个追踪标记按原有规则移除', () => {
    vi.useRealTimers()
    const start = performance.now()
    toast.add({ message: `${' '.repeat(262144)}操作失败`, duration: 0 })
    expect(toast.items[0].message).toBe('操作失败')
    expect(performance.now() - start).toBeLessThan(1000)
    toast.add({ message: '失败 (traceId: first) \t(traceId: second)；请重试', duration: 0 })
    expect(toast.items[1]).toMatchObject({ message: '失败；请重试', traceId: 'first' })
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

  it.each(['success', 'error', 'warning', 'info'] as const)('快捷方法 %s 保留消息、类型和停留时间', (variant) => {
    const id = toast[variant]('操作结果', 4500)
    expect(id).toEqual(expect.any(String))
    expect(toast.items[0]).toMatchObject({ id, message: '操作结果', variant, duration: 4500 })
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
    expect(toast.items[0].position).toBe('bottom-right')
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

  it('多个提示按顺序计时，等待中的提示不会提前过期', () => {
    toast.success('第一条', 1000)
    toast.info('第二条', 2000)
    vi.advanceTimersByTime(1000)
    expect(toast.items.map(item => item.message)).toEqual(['第二条'])
    vi.advanceTimersByTime(1999)
    expect(toast.items[0].message).toBe('第二条')
    vi.advanceTimersByTime(1)
    expect(toast.items).toEqual([])
  })

  it('关闭当前提示立即展示下一条，移除等待项不重置当前计时', () => {
    const first = toast.info('第一条', 0)
    const second = toast.info('第二条', 2000)
    const third = toast.info('第三条', 500)
    vi.advanceTimersByTime(10000)
    expect(toast.items).toHaveLength(3)
    toast.remove(first)
    vi.advanceTimersByTime(1500)
    toast.remove(third)
    vi.advanceTimersByTime(500)
    expect(toast.items.find(item => item.id === second)).toBeUndefined()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('清空时同时取消队列和计时器，新提示可正常计时', () => {
    toast.success('第一条', 1000)
    toast.info('第二条', 1000)
    toast.clear()
    expect(vi.getTimerCount()).toBe(0)
    toast.info('新提示', 2000)
    vi.advanceTimersByTime(1000)
    expect(toast.items[0].message).toBe('新提示')
    vi.advanceTimersByTime(1000)
    expect(toast.items).toEqual([])
  })

  it('兼容已有格式且保留恢复建议，显式编号优先且拒绝非法编号', () => {
    toast.add({ message: '提交失败 (traceId: request-1)；请稍后重试', traceId: 'request-2', variant: 'warning', duration: 0 })
    expect(toast.items[0]).toMatchObject({ message: '提交失败；请稍后重试', traceId: 'request-2' })
    toast.add({ message: '请求失败', traceId: '<script>private</script>' })
    expect(toast.items[1].traceId).toBeUndefined()
  })

  it('暂停保留剩余时长，关闭暂停项后下一个提示仍正常计时', () => {
    const id = toast.error('第一条', 2000)
    toast.warning('第二条', 1000)
    vi.advanceTimersByTime(500)
    toast.pause(id)
    vi.advanceTimersByTime(10000)
    expect(toast.items).toHaveLength(2)
    toast.resume(id)
    vi.advanceTimersByTime(1499)
    expect(toast.items[0].id).toBe(id)
    toast.pause(id)
    toast.remove(id)
    toast.resume(id)
    vi.advanceTimersByTime(1000)
    expect(toast.items).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('toast notify helpers', () => {
  let mod: typeof import('../src/lib/toast.svelte.js')

  beforeEach(async () => {
    vi.resetModules()
    mod = await import('../src/lib/toast.svelte.js')
    vi.useFakeTimers()
  })

  afterEach(() => {
    mod?.toast?.clear?.()
    vi.useRealTimers()
  })

  it('notifySuccess 弹出成功提示', () => {
    mod.notifySuccess('保存成功')
    expect(mod.toast.items[0].variant).toBe('success')
    expect(mod.toast.items[0].message).toBe('保存成功')
  })

  it('notifyError 隐藏底层 Error，将追踪编号与可读文案分开', () => {
    mod.notifyError(new Error('SQL private details'), '保存失败')
    expect(mod.toast.items[0].variant).toBe('error')
    expect(mod.toast.items[0].message).toBe('保存失败')
    expect(mod.toast.items[0].traceId).toMatch(/^[\w.:-]+$/)
    expect(mod.toast.items[0].message).not.toContain('SQL')
  })

  it('notifyError 非 Error 且为空时使用兜底文案', () => {
    mod.notifyError(undefined, '未知错误')
    expect(mod.toast.items[0].message).toBe('未知错误')
  })

  it('保留异常 cause 中的业务原因和服务端追踪标识', () => {
    const cause = { code: 'hai:feedback:004', message: '反馈已更新，请刷新后重试', httpStatus: 409, traceId: 'request-feedback-1' }
    mod.notifyError(new Error('Feedback callback failed', { cause }), '操作失败')
    expect(mod.toast.items[0]).toMatchObject({ message: '反馈已更新，请刷新后重试', traceId: 'request-feedback-1' })
  })

  it('包装后的服务端异常仍隐藏内部细节，循环 cause 不会阻塞提示', () => {
    mod.notifyError(new Error('Internal wrapper', { cause: { code: 'app:db', message: 'SQL private statement', httpStatus: 500, traceId: 'request-db-1' } }), '操作失败')
    expect(mod.toast.items[0].message).not.toContain('SQL')
    expect(mod.toast.items[0].traceId).toBe('request-db-1')
    const circular = new Error('Private detail')
    circular.cause = circular
    const message = mod.errorMessage(circular, '请联系管理员')
    expect(message).toMatch(/^请联系管理员 \(traceId: [\w.:-]+\)$/)
  })

  it('notifyError 接受字符串文案', () => {
    mod.notifyError('直接文案')
    expect(mod.toast.items[0].message).toBe('直接文案')
  })

  it('异常即使携带 traceId 仍隐藏原文，只保留关联编号', () => {
    mod.notifyError(new Error('SQL private details (traceId: req-api)'), '保存失败')
    expect(mod.toast.items[0]).toMatchObject({ message: '保存失败', traceId: 'req-api' })
  })

  it('安全的本地化字符串保留 traceId 且不重复追加', () => {
    mod.notifyError('请求失败 (traceId: req-api)', '兜底')
    expect(mod.toast.items[0]).toMatchObject({ message: '请求失败', traceId: 'req-api' })
  })

  it('notifyInfo 与 notifyWarning 变体正确', () => {
    mod.notifyInfo('信息')
    mod.notifyWarning('警告')
    expect(mod.toast.items[0].variant).toBe('info')
    expect(mod.toast.items[1].variant).toBe('warning')
  })
})
