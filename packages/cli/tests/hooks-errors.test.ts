import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { core } from '@h-ai/core'
import ts from 'typescript'
import { expect, it, vi } from 'vitest'
import { renderTemplate } from '../src/cli-utils.js'
import { buildTemplateContext } from '../src/commands/cli-template-engine.js'

it('website 实际生成的请求错误处理器对外隐藏底层异常且保留可读错误', async () => {
  const template = await readFile(new URL('../templates/base/src/hooks.server.ts.hbs', import.meta.url), 'utf8')
  const context = buildTemplateContext({ name: 'public-errors', appType: 'website', features: [], packageManager: 'pnpm' })
  const rendered = renderTemplate(template, context)
  const compiled = ts.transpileModule(rendered, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  let onError: ((error: unknown, event: unknown) => Response) | undefined
  const hookExports: { handle?: (input: unknown) => Promise<unknown> } = {}
  const getKitConfig = vi.fn(() => ({ transport: false, access: false, trustedProxies: 'auto' }))
  const createHandle = vi.fn((options: { onError: typeof onError }) => {
    onError = options.onError
    return async () => new Response()
  })
  const logger = vi.spyOn(core.logger, 'error').mockImplementation(() => {})
  try {
    runInNewContext(compiled, {
      exports: hookExports,
      Response,
      require: (module: string) => {
        if (module === '@h-ai/core')
          return { core }
        if (module === '$lib/server/kit-config.js')
          return { getKitConfig }
        if (module === '@h-ai/kit') {
          return { kit: {
            createHandle,
            // 本用例隔离业务 Handle；完整组合、初始化与语言中间件由生成项目 E2E 验证。
            sequence: (...handles: Array<(input: unknown) => Promise<unknown>>) => handles.at(-1),
          } }
        }
        // 模块只装配Handle，不执行初始化或语言中间件。
        return {}
      },
    })
    expect(onError).toBeUndefined()
    expect(createHandle).not.toHaveBeenCalled()
    expect(hookExports.handle).toBeTypeOf('function')
    await hookExports.handle!({})
    await hookExports.handle!({})
    expect(getKitConfig).toHaveBeenCalledOnce()
    expect(createHandle).toHaveBeenCalledOnce()
    expect(onError).toBeTypeOf('function')
    const failure = new Error('Database password=private-secret at internal-db:5432')
    const response = onError!(failure, {})
    expect(response.status).toBe(500)
    expect(response.headers.get('content-type')).toBe('application/json')
    const payload = await response.json()
    expect(payload).toMatchObject({ success: false, error: { code: 'INTERNAL_ERROR', message: expect.any(String) } })
    expect(payload.error.message.trim().length).toBeGreaterThan(0)
    expect(JSON.stringify(payload)).not.toMatch(/private-secret|internal-db|password|Database/)
    expect(logger).toHaveBeenCalledWith('Request error:', { error: failure })
  }
  finally {
    logger.mockRestore()
  }
})
