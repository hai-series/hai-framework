/** 应用关闭必须消费模块 HaiResult，清理失败后仍能再次关闭。 */
import { cache } from '@h-ai/cache'
import { core, err, ok } from '@h-ai/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { closeApp, initApp } from '../src/lib/server/init.js'

afterEach(async () => {
  vi.restoreAllMocks()
  await closeApp()
})

/** 在配置校验阶段停止启动，避免为关闭契约测试创建外部服务。 */
async function leaveFailedInitialization() {
  vi.spyOn(core, 'init').mockImplementation(() => undefined)
  vi.spyOn(core.config, 'validate').mockReturnValue(err({ code: 'test:invalid', message: 'injected config failure' }))
  await expect(initApp()).rejects.toThrow('Serv config invalid')
}

describe.sequential('application lifecycle cleanup', () => {
  it('reports returned module failure, tries other closers, and retries on another close', async () => {
    await leaveFailedInitialization()
    const close = vi.spyOn(cache, 'close')
      .mockResolvedValueOnce(err({ code: 'test:cleanup', message: 'injected cleanup failure' }))
      .mockResolvedValue(ok(undefined))
    await expect(closeApp()).rejects.toThrow(AggregateError)
    await expect(closeApp()).resolves.toBeUndefined()
    expect(close).toHaveBeenCalledTimes(2)
  })

  it('coalesces concurrent application close calls', async () => {
    await leaveFailedInitialization()
    const close = vi.spyOn(cache, 'close').mockResolvedValue(ok(undefined))
    await Promise.all([closeApp(), closeApp(), closeApp()])
    expect(close).toHaveBeenCalledTimes(1)
  })
})
