import { describe, expect, it, vi } from 'vitest'
import { core, err, HaiCommonError, HaiConfigError, ok } from '../src/index.js'

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

  it.each([
    { locale: 'zh-CN', missing: '未设置必需的环境变量', invalid: '配置校验未通过', unknown: '配置项缺失或无效', action: '请' },
    { locale: 'en-US', missing: 'Required environment variables are not set', invalid: 'Configuration validation failed', unknown: 'Configuration is missing or invalid', action: 'Please' },
    { locale: 'ja-JP', missing: '必須の環境変数が設定されていません', invalid: '設定の検証に失敗しました', unknown: '設定が不足しているか無効です', action: 'してください' },
  ])('配置诊断用 $locale 说明原因和修复方式，且不暴露私密异常', async ({ locale, missing, invalid, unknown, action }) => {
    await core.i18n.runWithLocale(locale, async () => {
      for (const scenario of [
        { code: HaiConfigError.CONFIG_ENV_VAR_MISSING.code, expected: missing },
        { code: HaiConfigError.CONFIG_VALIDATION_ERROR.code, expected: invalid },
        { code: undefined, expected: unknown },
      ]) {
        const runtime = core.module.createRuntime([{ name: 'bootstrap', start: () => {
          throw Object.assign(new Error('PRIVATE_PASSWORD_SENTINEL'), {
            code: scenario.code,
            ext: { fields: ['HAI_ADMIN_DEFAULT_PASSWORD', 'HAI_ADMIN_DEFAULT_PASSWORD'], password: 'PRIVATE_PASSWORD_SENTINEL' },
          })
        }, close: () => {} }])
        const result = await runtime.start()
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(HaiCommonError.INIT_FAILED.code)
          expect(result.error.message).toContain(scenario.expected)
          expect(result.error.message).toContain(action)
          expect(result.error.message.match(/HAI_ADMIN_DEFAULT_PASSWORD/g)).toHaveLength(1)
          expect(JSON.stringify(result)).not.toContain('PRIVATE_PASSWORD_SENTINEL')
        }
      }
    })
  })

  it('返回的配置失败和抛出的 Schema 错误均显示校验原因', async () => {
    for (const start of [
      () => err({ ...HaiConfigError.CONFIG_VALIDATION_ERROR, message: 'PRIVATE_SENTINEL', ext: { fields: ['server.port'] } }),
      () => { throw Object.assign(new Error('PRIVATE_SENTINEL'), { issues: [{ path: ['server', 'port'], input: 'PRIVATE_SENTINEL' }] }) },
    ]) {
      const runtime = core.module.createRuntime([{ name: 'serv-config', start, close: () => {} }])
      const result = await runtime.start()
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toContain('配置校验未通过')
        expect(result.error.message).toContain('server.port')
        expect(JSON.stringify(result)).not.toContain('PRIVATE_SENTINEL')
      }
    }
  })
})
