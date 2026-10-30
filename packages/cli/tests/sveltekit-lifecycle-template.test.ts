/** 执行真实 SSR hooks 模板，验证 Node 适配器退出时触发模块清理。 */
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import Handlebars from 'handlebars'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'

const template = readFileSync(new URL('../templates/base/src/hooks.server.ts.hbs', import.meta.url), 'utf8')

function instantiate(closeApp: () => Promise<void>) {
  const source = Handlebars.compile(template)({ projectName: 'lifecycle', features: {}, hasI18n: false })
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, reportDiagnostics: true })
  expect(compiled.diagnostics?.filter(item => item.category === ts.DiagnosticCategory.Error)).toEqual([])
  const process = Object.assign(new EventEmitter(), { exitCode: undefined as number | undefined })
  const error = vi.fn()
  runInNewContext(compiled.outputText, {
    exports: {},
    require(name: string) {
      if (name === 'node:process')
        return process
      if (name === '$lib/server/init.js')
        return { initApp: vi.fn(), closeApp }
      if (name === '$lib/server/kit-config.js')
        return { getKitConfig: vi.fn() }
      if (name === '@h-ai/core')
        return { core: { logger: { error } } }
      if (name === '@h-ai/kit')
        return { kit: { sequence: vi.fn() } }
      throw new Error(`Unexpected lifecycle dependency: ${name}`)
    },
  })
  return { process, error }
}

describe('generated SvelteKit Node lifecycle', () => {
  it('停止 HTTP 服务后只释放一次模块，不把生命周期留给进程强杀', async () => {
    const closeApp = vi.fn(async () => {})
    const fixture = instantiate(closeApp)
    expect(closeApp).not.toHaveBeenCalled()
    fixture.process.emit('sveltekit:shutdown')
    await vi.waitFor(() => expect(closeApp).toHaveBeenCalledOnce())
    fixture.process.emit('sveltekit:shutdown')
    expect(closeApp).toHaveBeenCalledOnce()
    expect(fixture.error).not.toHaveBeenCalled()
    expect(fixture.process.exitCode).toBeUndefined()
  })

  it('释放失败报告错误并标记进程失败，不产生未处理 Promise 拒绝', async () => {
    const cause = new Error('Owned lifecycle cleanup failed')
    const fixture = instantiate(vi.fn(async () => {
      throw cause
    }))
    fixture.process.emit('sveltekit:shutdown')
    await vi.waitFor(() => expect(fixture.error).toHaveBeenCalledWith('Application shutdown failed', { error: cause }))
    expect(fixture.process.exitCode).toBe(1)
  })
})
