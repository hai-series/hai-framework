import type { LogRecord } from '@h-ai/core'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('window', {
    Capacitor: {
      getPlatform: () => 'android',
      isNativePlatform: () => true,
    },
  })
  vi.doMock('@capacitor/core', () => ({
    Capacitor: {
      getPlatform: () => 'android',
      isNativePlatform: () => true,
    },
  }))
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
  vi.doMock('@capacitor/push-notifications', () => ({
    PushNotifications: {
      requestPermissions: async () => ({ receive: 'granted' }),
      addListener,
      register,
    },
  }))
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
  vi.doMock('@capacitor/push-notifications', () => ({
    PushNotifications: { addListener },
  }))
  const { capacitor } = await import('../src/capacitor-main.js')
  await capacitor.init()
  expect((await capacitor.push.listen({
    onReceived: vi.fn(),
    onActionPerformed: vi.fn(),
  })).success).toBe(false)
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
  vi.doMock('@capacitor/push-notifications', () => ({
    PushNotifications: {
      requestPermissions: async () => ({ receive: 'granted' }),
      addListener,
      register,
    },
  }))
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
  vi.doMock('@capacitor/push-notifications', () => ({
    PushNotifications: { requestPermissions, addListener },
  }))
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
  vi.doMock('@capacitor/push-notifications', () => ({
    PushNotifications: { addListener },
  }))
  const { capacitor } = await import('../src/capacitor-main.js')
  await capacitor.init()
  const pending = capacitor.push.listen({
    onReceived: vi.fn(),
  })
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
  vi.doMock('@capacitor/push-notifications', () => ({
    PushNotifications: { addListener },
  }))
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
  vi.doMock('@capacitor/push-notifications', () => ({
    PushNotifications: { addListener },
  }))
  const { capacitor } = await import('../src/capacitor-main.js')
  await capacitor.init()
  const result = await capacitor.push.listen({
    onReceived: vi.fn(),
    onActionPerformed: vi.fn(),
  })
  if (!result.success)
    throw new Error('Test listeners did not attach')
  expect(await result.data()).toMatchObject({
    success: false,
    error: { code: 'hai:capacitor:032' },
  })
  expect(await capacitor.close()).toEqual({ success: true, data: undefined })
  expect(first).toHaveBeenCalledTimes(2)
  expect(second).toHaveBeenCalledOnce()
  expect((await result.data()).success).toBe(true)
  expect(first).toHaveBeenCalledTimes(2)
})

it('web 插件不冒充原生推送成功，拒绝权限也不挂载监听', async () => {
  const requestPermissions = vi.fn(async () => ({ receive: 'denied' }))
  const addListener = vi.fn()
  vi.doMock('@capacitor/push-notifications', () => ({
    PushNotifications: { requestPermissions, addListener },
  }))
  const { capacitor } = await import('../src/capacitor-main.js')
  await capacitor.init()
  expect((await capacitor.push.register()).success).toBe(false)
  expect(requestPermissions).toHaveBeenCalledOnce()
  expect(addListener).not.toHaveBeenCalled()
  const { Capacitor } = await import('@capacitor/core')
  vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false)
  expect((await capacitor.push.register()).success).toBe(false)
  expect((await capacitor.push.listen({
    onReceived: vi.fn(),
  })).success).toBe(false)
  expect(requestPermissions).toHaveBeenCalledOnce()
})

it.each(['timeout', 'abort', 'close'] as const)('register %s 后及时失败，原生 remove 未完成时 close 仍等待', async (reason) => {
  vi.useFakeTimers()
  const removal = deferred<void>()
  const remove = vi.fn(() => removal.promise)
  const register = vi.fn(async () => {})
  vi.doMock('@capacitor/push-notifications', () => ({
    PushNotifications: {
      requestPermissions: async () => ({ receive: 'granted' }),
      addListener: vi.fn()
        .mockResolvedValueOnce({ remove })
        .mockResolvedValueOnce({
          remove: vi.fn(async () => {}),
        }),
      register,
    },
  }))
  const { capacitor } = await import('../src/index.js')
  await capacitor.init()
  const controller = new AbortController()
  const pending = capacitor.push.register({ signal: controller.signal })
  let result: Awaited<typeof pending> | undefined
  let closing: ReturnType<typeof capacitor.close> | undefined
  let closed = false
  void pending.then((value) => {
    result = value
  })
  try {
    await vi.waitFor(() => expect(register).toHaveBeenCalledOnce())
    if (reason === 'timeout')
      await vi.advanceTimersByTimeAsync(30_000)
    else if (reason === 'abort')
      controller.abort()
    else
      closing = capacitor.close()
    await vi.advanceTimersByTimeAsync(0)
    expect(result).toMatchObject({
      success: false,
      error: { code: 'hai:capacitor:030' },
    })
    expect(remove).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    closing ??= capacitor.close()
    void closing.then(() => {
      closed = true
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(closed).toBe(false)
    removal.resolve()
    expect((await closing).success).toBe(true)
    expect(remove).toHaveBeenCalledOnce()
  }
  finally {
    removal.resolve()
    await pending
    await closing
  }
})

it.each(['timeout', 'abort'] as const)('register 取得 token 后的清理仍受原始 %s 约束', async (reason) => {
  vi.useFakeTimers()
  const removal = deferred<void>()
  const remove = vi.fn(() => removal.promise)
  let registered: ((value: { value: string }) => void) | undefined
  const register = vi.fn(async () => {})
  vi.doMock('@capacitor/push-notifications', () => ({
    PushNotifications: {
      requestPermissions: async () => ({ receive: 'granted' }),
      addListener: vi.fn().mockImplementationOnce(async (_event: string, callback: typeof registered) => {
        registered = callback
        return { remove }
      }).mockResolvedValueOnce({
        remove: vi.fn(async () => {}),
      }),
      register,
    },
  }))
  const { capacitor } = await import('../src/index.js')
  await capacitor.init()
  const controller = new AbortController()
  const pending = capacitor.push.register({ signal: controller.signal })
  let result: Awaited<typeof pending> | undefined
  void pending.then((value) => {
    result = value
  })
  try {
    await vi.waitFor(() => expect(register).toHaveBeenCalledOnce())
    await vi.advanceTimersByTimeAsync(29_000)
    registered?.({ value: 'example-device-token' })
    await vi.advanceTimersByTimeAsync(0)
    expect(remove).toHaveBeenCalledOnce()
    expect(result).toBeUndefined()
    if (reason === 'abort')
      controller.abort()
    else
      await vi.advanceTimersByTimeAsync(1_000)
    await vi.advanceTimersByTimeAsync(0)
    expect(result).toMatchObject({
      success: false,
      error: { code: 'hai:capacitor:030' },
    })
    removal.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(await pending).toMatchObject({ success: false })
    expect(remove).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  }
  finally {
    removal.resolve()
    await pending
  }
})

it('register 等待真实清理完成后发布 token，正常清理不会被当作取消', async () => {
  vi.useFakeTimers()
  const removal = deferred<void>()
  const remove = vi.fn(() => removal.promise)
  let registered: ((value: { value: string }) => void) | undefined
  vi.doMock('@capacitor/push-notifications', () => ({
    PushNotifications: {
      requestPermissions: async () => ({ receive: 'granted' }),
      addListener: vi.fn().mockImplementationOnce(async (_event: string, callback: typeof registered) => {
        registered = callback
        return { remove }
      }).mockResolvedValueOnce({
        remove: vi.fn(async () => {}),
      }),
      register: async () => { registered?.({ value: 'example-device-token' }) },
    },
  }))
  const { capacitor } = await import('../src/index.js')
  await capacitor.init()
  const pending = capacitor.push.register()
  let result: Awaited<typeof pending> | undefined
  void pending.then((value) => {
    result = value
  })
  try {
    await vi.waitFor(() => expect(remove).toHaveBeenCalledOnce())
    expect(result).toBeUndefined()
    removal.resolve()
    expect(await pending).toEqual({
      success: true,
      data: { token: 'example-device-token' },
    })
    expect(vi.getTimerCount()).toBe(0)
  }
  finally {
    removal.resolve()
    await pending
  }
})

it('最后句柄完成清理后仍在收尾的 register 可以被 close 取消', async () => {
  let registered: ((value: { value: string }) => void) | undefined
  let closing: Promise<unknown> | undefined
  const { capacitor } = await import('../src/index.js')
  const remove = vi.fn(async () => {
    // 模拟原生完成回调排入微任务队列：删除已完成，注册的收尾等待尚未结束。
    void (async () => {
      for (let turn = 0; turn < 8; turn++)
        await Promise.resolve()
      closing = capacitor.close()
    })()
  })
  vi.doMock('@capacitor/push-notifications', () => ({
    PushNotifications: {
      requestPermissions: async () => ({ receive: 'granted' }),
      addListener: vi.fn().mockImplementationOnce(async (_event: string, callback: typeof registered) => {
        registered = callback
        return { remove }
      }).mockResolvedValueOnce({
        remove: vi.fn(async () => {}),
      }),
      register: async () => { registered?.({ value: 'example-device-token' }) },
    },
  }))
  await capacitor.init()
  const pending = capacitor.push.register()
  try {
    expect(await pending).toMatchObject({
      success: false,
      error: { code: 'hai:capacitor:030' },
    })
    expect(closing).toBeDefined()
    expect(capacitor.isInitialized).toBe(false)
    expect(remove).toHaveBeenCalledOnce()
  }
  finally {
    await pending
    await closing
  }
})

it.each(['timeout', 'abort', 'close'] as const)('listen %s 不等待卡住的清理，迟到句柄仍由原 scope 回收', async (reason) => {
  vi.useFakeTimers()
  const removal = deferred<void>()
  const attachment = deferred<{ remove: () => Promise<void> }>()
  const remove = vi.fn(() => removal.promise)
  const removeLate = vi.fn(async () => {})
  let received: ((notice: { id: string }) => void) | undefined
  const onReceived = vi.fn()
  const addListener = vi.fn().mockImplementationOnce(async (_event: string, callback: typeof received) => {
    received = callback
    return { remove }
  }).mockImplementationOnce(() => attachment.promise)
  vi.doMock('@capacitor/push-notifications', () => ({
    PushNotifications: { addListener },
  }))
  const { capacitor } = await import('../src/index.js')
  await capacitor.init()
  const controller = new AbortController()
  const pending = capacitor.push.listen({
    onReceived,
    onActionPerformed: vi.fn(),
  }, { signal: controller.signal })
  let result: Awaited<typeof pending> | undefined
  let closing: ReturnType<typeof capacitor.close> | undefined
  void pending.then((value) => {
    result = value
  })
  try {
    await vi.waitFor(() => expect(addListener).toHaveBeenCalledTimes(2))
    if (reason === 'timeout')
      await vi.advanceTimersByTimeAsync(30_000)
    else if (reason === 'abort')
      controller.abort()
    else
      closing = capacitor.close()
    await vi.advanceTimersByTimeAsync(0)
    expect(result).toMatchObject({
      success: false,
      error: { code: 'hai:capacitor:031' },
    })
    received?.({ id: 'queued-after-cancel' })
    expect(onReceived).not.toHaveBeenCalled()
    closing ??= capacitor.close()
    removal.resolve()
    expect((await closing).success).toBe(true)
    attachment.resolve({ remove: removeLate })
    await vi.waitFor(() => expect(removeLate).toHaveBeenCalledOnce())
    expect(remove).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  }
  finally {
    removal.resolve()
    attachment.resolve({ remove: removeLate })
    await pending
    await closing
  }
})

it('取消后后台移除失败仍保留句柄供 close 重试，并只记录安全诊断字段', async () => {
  vi.useFakeTimers()
  let completeRemoval!: () => void
  let failRemoval!: (cause: Error) => void
  const removal = new Promise<void>((resolve, reject) => {
    completeRemoval = resolve
    failRemoval = reject
  })
  const remove = vi.fn().mockReturnValueOnce(removal).mockResolvedValue(undefined)
  const removeOther = vi.fn(async () => {})
  const register = vi.fn(async () => {})
  vi.doMock('@capacitor/push-notifications', () => ({
    PushNotifications: {
      requestPermissions: async () => ({ receive: 'granted' }),
      addListener: vi.fn().mockResolvedValueOnce({ remove }).mockResolvedValueOnce({ remove: removeOther }),
      register,
    },
  }))
  const { capacitor } = await import('../src/index.js')
  const { core } = await import('@h-ai/core')
  await capacitor.init()
  const records: LogRecord[] = []
  const stop = core.logger.observe(record => records.push(record))
  const controller = new AbortController()
  const pending = capacitor.push.register({ signal: controller.signal })
  let result: Awaited<typeof pending> | undefined
  void pending.then((value) => {
    result = value
  })
  try {
    await vi.waitFor(() => expect(register).toHaveBeenCalledOnce())
    controller.abort()
    await vi.advanceTimersByTimeAsync(0)
    expect(result).toMatchObject({
      success: false,
      error: { code: 'hai:capacitor:030' },
    })
    // 在输出失败日志之前核对推送计时器，避免把 pretty 日志 worker 的计时器计入。
    expect(vi.getTimerCount()).toBe(0)
    failRemoval(Object.assign(new Error('Native removal failed token=PRIVATE_DEVICE_TOKEN'), { code: 'E_REMOVE' }))
    await vi.advanceTimersByTimeAsync(0)
    expect(records).toContainEqual(expect.objectContaining({
      level: 'warn',
      context: expect.objectContaining({ errorCode: 'hai:capacitor:032', causeCode: 'E_REMOVE' }),
    }))
    expect(JSON.stringify(records)).not.toContain('PRIVATE_DEVICE_TOKEN')
    expect((await capacitor.close()).success).toBe(true)
    expect(remove).toHaveBeenCalledTimes(2)
    expect(removeOther).toHaveBeenCalledOnce()
  }
  finally {
    completeRemoval()
    await pending
    stop()
  }
})
