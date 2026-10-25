/** 渲染并执行 API 初始化模板，验证 HaiResult 关闭失败与功能条件分支。 */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { core } from '@h-ai/core'
import Handlebars from 'handlebars'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'

interface ApplicationLifecycle {
  initApp: () => Promise<void>
  closeApp: () => Promise<void>
}

const template = readFileSync(new URL('../templates/apps/api/apps/{{projectName}}-service/src/lib/server/init.ts.hbs', import.meta.url), 'utf8')

/** 执行实际生成代码；仅框架依赖替换为可控结果，不替换应用生命周期实现。 */
function instantiate(features: Record<string, boolean>) {
  const source = Handlebars.compile(template)({ projectName: 'lifecycle', features })
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true })
  expect(compiled.diagnostics?.filter(item => item.category === ts.DiagnosticCategory.Error)).toEqual([])
  const cacheClose = vi.fn(async () => ({ success: true }))
  const clients = new Map<string, { init: () => Promise<{ success: boolean }>, close: () => Promise<{ success: boolean }> }>()
  for (const name of ['ai', 'iam', 'reach', 'vecdb', 'storage', 'reldb', 'crypto'])
    clients.set(name, { init: vi.fn(async () => ({ success: true })), close: vi.fn(async () => ({ success: true })) })
  clients.set('cache', { init: vi.fn(async () => ({ success: true })), close: cacheClose })
  const exports: Partial<ApplicationLifecycle> = {}
  runInNewContext(compiled.outputText, {
    exports,
    require(name: string) {
      if (name === '@h-ai/core') {
        return { core: {
          module: core.module,
          init: () => undefined,
          logger: { info: vi.fn(), warn: vi.fn() },
          config: {
            validate: () => ({ success: true }),
            get: () => features.reach ? {} : undefined,
            getOrThrow: () => ({ transport: features.crypto ? {} : false, type: 'postgresql' }),
          },
        } }
      }
      return {
        [name.slice('@h-ai/'.length)]: clients.get(name.slice('@h-ai/'.length)),
        // 本文件验证资源编排；配置 Schema 的真实校验另由 production-state 和生成工程门禁覆盖。
        ...Object.fromEntries(['AIConfigSchema', 'IamConfigSchema', 'CacheConfigSchema', 'ReldbConfigSchema', 'StorageConfigSchema', 'VecdbConfigSchema', 'ReachConfigSchema'].map(key => [key, { parse: (value: unknown) => value }])),
      }
    },
  })
  if (typeof exports.initApp !== 'function' || typeof exports.closeApp !== 'function')
    throw new Error('Generated lifecycle exports missing')
  // 模板执行边界已检查两个导出均为函数；其 Promise 契约由生成源码和运行断言验证。
  return { application: exports as ApplicationLifecycle, cacheClose, clients }
}

describe('generated API lifecycle', () => {
  it.each([
    {},
    { cache: true },
    { db: true, cache: true, iam: true, reach: true, storage: true, vecdb: true, ai: true, crypto: true },
  ])('renders and closes selected feature branches %j', async (features) => {
    const { application } = instantiate(features)
    await application.initApp()
    await application.closeApp()
  })

  it('retains dependencies on returned cleanup failure and retries cleanup before reinit', async () => {
    const { application, cacheClose, clients } = instantiate({ cache: true, db: true })
    await application.initApp()
    cacheClose.mockResolvedValueOnce({ success: false })
    await expect(application.closeApp()).rejects.toMatchObject({ cause: { ext: { module: 'cache', phase: 'close' } } })
    expect(clients.get('reldb')!.close).not.toHaveBeenCalled()
    await application.initApp()
    expect(cacheClose).toHaveBeenCalledTimes(2)
    expect(clients.get('cache')!.init).toHaveBeenCalledTimes(2)
    await application.closeApp()
  })
})
