import { describe, expect, it, vi } from 'vitest'
import { core, err, HaiCommonError, ok } from '../src/index.js'

describe('core.module.createRuntime', () => {
  it('并发启动只执行一次，关闭等待启动并按相反顺序释放', async () => {
    const calls: string[] = []
    let finish!: () => void
    const runtime = core.module.createRuntime([
      { name: 'db', start: async () => {
        calls.push('start db')
        await new Promise<void>(resolve => finish = resolve)
        return ok(undefined)
      }, close: () => {
        calls.push('close db')
      } },
      { name: 'app', start: () => {
        calls.push('start app')
      }, close: () => {
        calls.push('close app')
      } },
    ])
    const first = runtime.start()
    const second = runtime.start()
    const closed = runtime.close()
    expect(calls).toEqual(['start db'])
    finish()
    expect((await first).success).toBe(true)
    expect((await second).success).toBe(true)
    expect((await closed).success).toBe(true)
    expect(runtime.isInitialized).toBe(false)
    expect(calls).toEqual(['start db', 'start app', 'close app', 'close db'])
  })

  it('失败模块及已启动依赖均回滚，不调用后续模块', async () => {
    const calls: string[] = []
    const later = vi.fn()
    const runtime = core.module.createRuntime([
      { name: 'db', start: () => ok(undefined), close: () => {
        calls.push('db')
      } },
      { name: 'feedback', start: () => err(HaiCommonError.INTERNAL_ERROR, 'PRIVATE_CONFIG_SENTINEL'), close: () => {
        calls.push('feedback')
      } },
      { name: 'later', start: later, close: () => {} },
    ])
    const result = await runtime.start()
    expect(result).toMatchObject({ success: false, error: { ext: { module: 'feedback', phase: 'start' } } })
    expect(JSON.stringify(result)).not.toContain('PRIVATE_CONFIG_SENTINEL')
    expect(calls).toEqual(['feedback', 'db'])
    expect(later).not.toHaveBeenCalled()
  })

  it('关闭失败保留依赖和清理义务，后续重试成功后才能重新启动', async () => {
    const closeDb = vi.fn()
    const closeApp = vi.fn().mockResolvedValueOnce(err(HaiCommonError.INTERNAL_ERROR, 'close failed')).mockResolvedValue(ok(undefined))
    const runtime = core.module.createRuntime([
      { name: 'db', start: () => ok(undefined), close: closeDb },
      { name: 'app', start: () => ok(undefined), close: closeApp },
    ])
    expect((await runtime.start()).success).toBe(true)
    expect(await runtime.close()).toMatchObject({ success: false, error: { ext: { module: 'app', phase: 'close' } } })
    expect(closeDb).not.toHaveBeenCalled()
    expect((await runtime.close()).success).toBe(true)
    expect(closeDb).toHaveBeenCalledOnce()
    expect(closeApp).toHaveBeenCalledTimes(2)
    expect((await runtime.start()).success).toBe(true)
    expect((await runtime.close()).success).toBe(true)
  })

  it('禁用模块不获取资源，配置异常仅暴露安全字段路径', async () => {
    const unused = vi.fn()
    const runtime = core.module.createRuntime([
      { name: 'unused', enabled: () => false, start: unused, close: unused },
      { name: 'storage', start: () => {
        throw Object.assign(new Error('PRIVATE_SENTINEL'), { issues: [{ path: ['credentials', 'key'], input: 'PRIVATE_SENTINEL' }] })
      }, close: () => {} },
    ])
    const result = await runtime.start()
    expect(result).toMatchObject({ success: false, error: { ext: { module: 'storage', fields: ['credentials.key'] } } })
    if (!result.success)
      expect(result.error.message).toContain('credentials.key')
    expect(JSON.stringify(result)).not.toContain('PRIVATE_SENTINEL')
    expect(unused).not.toHaveBeenCalled()
  })

  it('管理员配置失败的简短错误也包含字段名和领域错误码', async () => {
    const runtime = core.module.createRuntime([{ name: 'bootstrap', start: () => {
      throw Object.assign(new Error('PRIVATE_PASSWORD_SENTINEL'), { code: 'hai:iam:020', ext: { fields: ['HAI_ADMIN_DEFAULT_PASSWORD'] } })
    }, close: () => {} }])
    const result = await runtime.start()
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.message).toContain('HAI_ADMIN_DEFAULT_PASSWORD')
      expect(result.error.message).toContain('hai:iam:020')
      expect(result.error.message).not.toContain('PRIVATE_PASSWORD_SENTINEL')
    }
  })
})
