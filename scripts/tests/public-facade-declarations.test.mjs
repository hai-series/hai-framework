import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { expect, it } from 'vitest'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function emitConsumer(name, source, browser = false) {
  // 虚拟消费文件只从安装后的公共入口解析，不使用工作区源码 paths 或内部构建路径。
  const filename = resolve(root, `scripts/tests/fixtures/public-facade-${name}.ts`)
  const options = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
    types: ['node'],
    strict: true,
    declaration: true,
    emitDeclarationOnly: true,
    noEmitOnError: true,
    // 只验证消费者契约；依赖自身的声明校验由各包 typecheck 负责。
    skipLibCheck: true,
    customConditions: browser
      ? ['browser']
      : [],
  }
  const host = ts.createCompilerHost(options)
  const readSource = host.getSourceFile.bind(host)
  const fileExists = host.fileExists.bind(host)
  host.fileExists = path => resolve(path) === filename || fileExists(path)
  host.getSourceFile = (path, languageVersion, onError, shouldCreateNewSourceFile) => resolve(path) === filename
    ? ts.createSourceFile(path, source, languageVersion, true)
    : readSource(path, languageVersion, onError, shouldCreateNewSourceFile)
  const program = ts.createProgram([filename], options, host)
  const emitted = []
  const result = program.emit(undefined, (path, text) => emitted.push({ path, text }))
  const diagnostics = [
    ...ts.getPreEmitDiagnostics(program),
    ...result.diagnostics,
  ]
  expect(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: path => path,
    getCurrentDirectory: () => root,
    getNewLine: () => '\n',
  })).toBe('')
  expect(result.emitSkipped).toBe(false)
  const declarations = emitted.filter(file => file.path.endsWith('.d.ts'))
  expect(declarations).toHaveLength(1)
  expect(declarations[0].text).not.toMatch(/node_modules|\.pnpm|@h-ai\/(?:kit|serv)\/dist\//)
  return { program, filename }
}

it('emits downstream server declarations through serv and kit public namespaces', () => {
  const { program, filename } = emitConsumer('server', `
import type { KitFunctions } from '@h-ai/kit'
import type { ServContext, ServFunctions } from '@h-ai/serv'
import { apiContract } from '@h-ai/api-contract'
import { ok } from '@h-ai/core'
import { kit } from '@h-ai/kit'
import { serv } from '@h-ai/serv'
import { z } from 'zod'

const checkedKit: KitFunctions = kit
const checkedServ: ServFunctions = serv
export const kitFacade = checkedKit
export const servFacade = checkedServ
export const inferredKitFacade = kit
export const inferredServFacade = serv
export const parseRequest = serv.parseRequestContext
export const authContext = serv.buildAuthContextFactory
export const implementContract = serv.implement
export const login = kit.auth.login
export const loginWithOtp = kit.auth.loginWithOtp
export const loginWithLdap = kit.auth.loginWithLdap
export const loginWithApiKey = kit.auth.loginWithApiKey
export const registerAndLogin = kit.auth.registerAndLogin
export const logout = kit.auth.logout
export const setBrowserToken = kit.auth.setBrowserToken
export const clearBrowserToken = kit.auth.clearBrowserToken
export const setLocale = kit.i18n.setLocale
export const rateLimit = kit.middleware.rateLimit
export const createCacheRateLimitStore = kit.middleware.createCacheRateLimitStore
export const createMemoryRateLimitStore = kit.middleware.createMemoryRateLimitStore

const contract = apiContract.create({
  ping: apiContract.route({ method: 'GET', path: '/ping' }).output(apiContract.haiResultSchema(z.string())),
})
export const procedures = serv.implement(contract).context<ServContext>().route('ping', () => ok('ready')).build()
`)
  const checker = program.getTypeChecker()
  const file = program.getSourceFile(filename)
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement))
      continue
    const name = statement.moduleSpecifier.text
    if (name !== '@h-ai/kit' && name !== '@h-ai/serv')
      continue
    const exports = checker.getExportsOfModule(checker.getSymbolAtLocation(statement.moduleSpecifier)).map(symbol => symbol.name)
    const helpers = name === '@h-ai/serv'
      ? ['parseRequestContext', 'buildAuthContextFactory', 'implement']
      : [
          'login',
          'logout',
          'setBrowserToken',
          'clearBrowserToken',
          'rateLimitMiddleware',
          'setAllModulesLocale',
        ]
    for (const helper of helpers)
      expect(exports).not.toContain(helper)
  }
}, 30_000)

it('emits downstream browser declarations and exposes only browser-safe kit capabilities', () => {
  emitConsumer('browser', `
import type { BrowserKitFunctions } from '@h-ai/kit'
import { kit } from '@h-ai/kit'

const checked: BrowserKitFunctions = kit
export const checkedFacade = checked
export const kitFacade = kit
export const setBrowserToken = kit.auth.setBrowserToken
export const clearBrowserToken = kit.auth.clearBrowserToken
export const setLocale = kit.i18n.setLocale
// @ts-expect-error 服务端认证不属于浏览器入口。
kit.auth.login
// @ts-expect-error 服务端限流不属于浏览器入口。
kit.middleware
`, true)
}, 30_000)
