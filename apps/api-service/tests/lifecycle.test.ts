/** 应用关闭必须消费模块 HaiResult，清理失败后仍能再次关闭。 */
import { ai } from '@h-ai/ai'
import { cache } from '@h-ai/cache'
import { core, err, ok } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { reach } from '@h-ai/reach'
import { reldb } from '@h-ai/reldb'
import { storage } from '@h-ai/storage'
import { vecdb } from '@h-ai/vecdb'
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
  await expect(initApp()).rejects.toThrow('startup and cleanup failed')
}

describe.sequential('application lifecycle cleanup', () => {
  it('reports returned module failure, tries other closers, and retries on another close', async () => {
    const close = vi.spyOn(cache, 'close')
      .mockResolvedValueOnce(err({ code: 'test:cleanup', message: 'injected cleanup failure' }))
      .mockResolvedValue(ok(undefined))
    await leaveFailedInitialization()
    await expect(closeApp()).resolves.toBeUndefined()
    expect(close).toHaveBeenCalledTimes(2)
  })

  it('coalesces concurrent application close calls', async () => {
    const close = vi.spyOn(cache, 'close')
      .mockResolvedValueOnce(err({ code: 'test:cleanup', message: 'injected cleanup failure' }))
      .mockResolvedValue(ok(undefined))
    await leaveFailedInitialization()
    await Promise.all([closeApp(), closeApp(), closeApp()])
    expect(close).toHaveBeenCalledTimes(2)
  })

  it('rolls back DB/cache after vector startup failure', async () => {
    const calls: string[] = []
    vi.spyOn(core, 'init').mockImplementation(() => undefined)
    vi.spyOn(core.config, 'validate').mockReturnValue(ok(undefined))
    vi.spyOn(core.config, 'getOrThrow').mockReturnValue({ type: 'postgresql', transport: false })
    vi.spyOn(reldb, 'init').mockImplementation(async () => {
      calls.push('db.init')
      return ok(undefined)
    })
    vi.spyOn(cache, 'init').mockImplementation(async () => {
      calls.push('cache.init')
      return ok(undefined)
    })
    vi.spyOn(vecdb, 'init').mockImplementation(async () => {
      calls.push('vecdb.init')
      return err({ code: 'test:vector', message: 'injected vector startup failure' })
    })
    for (const [name, module] of [['ai', ai], ['storage', storage], ['iam', iam], ['reach', reach], ['vecdb', vecdb], ['cache', cache], ['db', reldb]] as const) {
      vi.spyOn(module, 'close').mockImplementation(async () => {
        calls.push(`${name}.close`)
        return ok(undefined)
      })
    }
    await expect(initApp()).rejects.toThrow('VecDB initialization failed')
    expect(calls).toEqual(['db.init', 'cache.init', 'vecdb.init', 'ai.close', 'storage.close', 'iam.close', 'reach.close', 'vecdb.close', 'cache.close', 'db.close'])
    await closeApp()
    expect(calls.filter(call => call === 'db.close')).toHaveLength(1)
  })
})
