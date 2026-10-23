import { afterEach, beforeEach, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('window', { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true } })
  vi.doMock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true } }))
})

afterEach(async () => {
  const { capacitor } = await import('../src/capacitor-main.js')
  await capacitor.close()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('register 部分 addListener 失败也释放已经挂载的 handle', async () => {
  let active = 0
  const remove = vi.fn(async () => {
    active--
  })
  const addListener = vi.fn()
    .mockImplementationOnce(async () => {
      active++
      return { remove }
    })
    .mockRejectedValueOnce(new Error('Second listener failed'))
  const register = vi.fn()
  vi.doMock('@capacitor/push-notifications', () => ({ PushNotifications: { requestPermissions: async () => ({ receive: 'granted' }), addListener, register } }))
  const { capacitor } = await import('../src/capacitor-main.js')
  expect((await capacitor.init()).success).toBe(true)
  expect((await capacitor.push.register()).success).toBe(false)
  expect(active).toBe(0)
  expect(remove).toHaveBeenCalledOnce()
  expect(register).not.toHaveBeenCalled()
})

/** 控制插件挂载/权限的真实完成顺序，而不是依赖墙钟等待。 */
function deferred<T>(): { promise: Promise<T>, resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

it('listen 第二个监听器失败会回收第一个，不发布半完成 cleanup', async () => {
  let active = 0
  const remove = vi.fn(async () => {
    active--
  })
  const addListener = vi.fn().mockImplementationOnce(async () => {
    active++
    return { remove }
  }).mockRejectedValueOnce(new Error('Second attachment failed'))
  vi.doMock('@capacitor/push-notifications', () => ({ PushNotifications: { addListener } }))
  const { capacitor } = await import('../src/capacitor-main.js')
  await capacitor.init()
  expect((await capacitor.push.listen({ onReceived: vi.fn(), onActionPerformed: vi.fn() })).success).toBe(false)
  expect(active).toBe(0)
  expect(remove).toHaveBeenCalledOnce()
})

it.each(['timeout', 'abort', 'close'] as const)('%s 后迟到的注册句柄立即移除，不再原生 register', async (reason) => {
  vi.useFakeTimers()
  const attachment = deferred<{ remove: () => Promise<void> }>()
  let active = 0
  const remove = vi.fn(async () => {
    active--
  })
  const addListener = vi.fn(() => attachment.promise)
  const register = vi.fn()
  vi.doMock('@capacitor/push-notifications', () => ({ PushNotifications: { requestPermissions: async () => ({ receive: 'granted' }), addListener, register } }))
  const { capacitor } = await import('../src/capacitor-main.js')
  await capacitor.init()
  const controller = new AbortController()
  const pending = capacitor.push.register({ signal: controller.signal })
  await vi.waitFor(() => expect(addListener).toHaveBeenCalledOnce())
  if (reason === 'timeout')
    await vi.advanceTimersByTimeAsync(30_000)
  else if (reason === 'abort')
    controller.abort()
  else
    expect((await capacitor.close()).success).toBe(true)
  expect((await pending).success).toBe(false)
  active++
  attachment.resolve({ remove })
  await vi.waitFor(() => expect(remove).toHaveBeenCalledOnce())
  expect(active).toBe(0)
  expect(addListener).toHaveBeenCalledOnce()
  expect(register).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it('权限请求超时后不会在迟到授权时挂载监听器', async () => {
  vi.useFakeTimers()
  const permission = deferred<{ receive: string }>()
  const requestPermissions = vi.fn(() => permission.promise)
  const addListener = vi.fn()
  vi.doMock('@capacitor/push-notifications', () => ({ PushNotifications: { requestPermissions, addListener } }))
  const { capacitor } = await import('../src/capacitor-main.js')
  await capacitor.init()
  const pending = capacitor.push.register()
  await vi.waitFor(() => expect(requestPermissions).toHaveBeenCalledOnce())
  await vi.advanceTimersByTimeAsync(30_000)
  expect((await pending).success).toBe(false)
  permission.resolve({ receive: 'granted' })
  await vi.advanceTimersByTimeAsync(0)
  expect(addListener).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it('listen 挂载超时后迟到句柄也会释放', async () => {
  vi.useFakeTimers()
  const attachment = deferred<{ remove: () => Promise<void> }>()
  const remove = vi.fn(async () => {})
  const addListener = vi.fn(() => attachment.promise)
  vi.doMock('@capacitor/push-notifications', () => ({ PushNotifications: { addListener } }))
  const { capacitor } = await import('../src/capacitor-main.js')
  await capacitor.init()
  const pending = capacitor.push.listen({ onReceived: vi.fn() })
  await vi.waitFor(() => expect(addListener).toHaveBeenCalledOnce())
  await vi.advanceTimersByTimeAsync(30_000)
  expect((await pending).success).toBe(false)
  attachment.resolve({ remove })
  await vi.waitFor(() => expect(remove).toHaveBeenCalledOnce())
  expect(vi.getTimerCount()).toBe(0)
})

it('cleanup/close 幂等且立即屏蔽已排队的旧回调，信号可终止建立后的监听', async () => {
  let callback: ((payload: { id: string }) => void) | undefined
  let active = 0
  const remove = vi.fn(async () => {
    active--
  })
  const addListener = vi.fn(async (_event: string, handler: typeof callback) => {
    callback = handler
    active++
    return { remove }
  })
  vi.doMock('@capacitor/push-notifications', () => ({ PushNotifications: { addListener } }))
  const { capacitor } = await import('../src/capacitor-main.js')
  await capacitor.init()
  const onReceived = vi.fn()
  const controller = new AbortController()
  const result = await capacitor.push.listen({ onReceived }, { signal: controller.signal })
  if (!result.success)
    throw new Error('Test listener did not attach')
  callback?.({ id: 'before-close' })
  expect(onReceived).toHaveBeenCalledOnce()
  controller.abort()
  callback?.({ id: 'queued-after-close' })
  expect((await result.data()).success).toBe(true)
  expect((await result.data()).success).toBe(true)
  expect((await capacitor.close()).success).toBe(true)
  expect(onReceived).toHaveBeenCalledOnce()
  expect(remove).toHaveBeenCalledOnce()
  expect(active).toBe(0)
})

it('remove 失败报告结果、保留句柄重试且不重复移除已经成功的句柄', async () => {
  const first = vi.fn().mockRejectedValueOnce(new Error('Native removal failed')).mockResolvedValue(undefined)
  const second = vi.fn(async () => {})
  const addListener = vi.fn().mockResolvedValueOnce({ remove: first }).mockResolvedValueOnce({ remove: second })
  vi.doMock('@capacitor/push-notifications', () => ({ PushNotifications: { addListener } }))
  const { capacitor } = await import('../src/capacitor-main.js')
  await capacitor.init()
  const result = await capacitor.push.listen({ onReceived: vi.fn(), onActionPerformed: vi.fn() })
  if (!result.success)
    throw new Error('Test listeners did not attach')
  expect(await result.data()).toMatchObject({ success: false, error: { code: 'hai:capacitor:032' } })
  expect(await capacitor.close()).toEqual({ success: true, data: undefined })
  expect(first).toHaveBeenCalledTimes(2)
  expect(second).toHaveBeenCalledOnce()
  expect((await result.data()).success).toBe(true)
  expect(first).toHaveBeenCalledTimes(2)
})

it('web 插件不冒充原生推送成功，拒绝权限也不挂载监听', async () => {
  const requestPermissions = vi.fn(async () => ({ receive: 'denied' }))
  const addListener = vi.fn()
  vi.doMock('@capacitor/push-notifications', () => ({ PushNotifications: { requestPermissions, addListener } }))
  const { capacitor } = await import('../src/capacitor-main.js')
  await capacitor.init()
  expect((await capacitor.push.register()).success).toBe(false)
  expect(requestPermissions).toHaveBeenCalledOnce()
  expect(addListener).not.toHaveBeenCalled()
  const { Capacitor } = await import('@capacitor/core')
  vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false)
  expect((await capacitor.push.register()).success).toBe(false)
  expect((await capacitor.push.listen({ onReceived: vi.fn() })).success).toBe(false)
  expect(requestPermissions).toHaveBeenCalledOnce()
})
