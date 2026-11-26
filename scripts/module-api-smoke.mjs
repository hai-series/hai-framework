/**
 * 针对已构建公开入口做导入/浏览器打包冒烟；不初始化服务或执行完整业务测试。
 * @example `node scripts/module-api-smoke.mjs --package capacitor`
 */
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'
import { expandPackageExports } from './module-api-inventory.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
if (process.argv.length > 2 && (process.argv.length !== 4 || process.argv[2] !== '--package'))
  throw new Error('Usage: node scripts/module-api-smoke.mjs [--package <package-directory>]')
const packageFilter = process.argv[3]
const require = createRequire(join(root, 'packages/ai/package.json'))
// 复用包构建器已经安装的 esbuild，不引入另一个版本或工作区外的工具。
const { build } = createRequire(require.resolve('tsup'))('esbuild')
const { compile, compileModule } = createRequire(join(root, 'packages/ui/package.json'))('svelte/compiler')
const servCapabilityFactories = [
  'createContractHandler',
  'createAiStreamingProcedures',
  'createAiMemoryWriteProcedures',
  'createAiMediaProcedures',
  'createIamManagementProcedures',
  'createStorageTransferProcedures',
  'createPaymentCloseOrderProcedures',
]
const removedServFactories = [
  'createAiExtensionProcedures',
  'createIamExtensionProcedures',
  'createStorageExtensionProcedures',
  'createPaymentExtensionProcedures',
]
const removedServSubpaths = ['ai', 'iam', 'storage', 'feedback'].map(feature => `@h-ai/serv/features/${feature}`)
const removedKitSubpaths = ['@h-ai/kit/a2a', '@h-ai/kit/crypto']
const movedKitMethods = ['resolveText', 'resolveOptions', 'matchPermission']
const browsers = new Map([
  [
    'core',
    ['.'],
  ],
  [
    'iam',
    ['.'],
  ],
  [
    'kit',
    ['.', './client'],
  ],
  [
    'ai',
    ['.', './client'],
  ],
  [
    'crypto',
    ['.'],
  ],
  [
    'api-client',
    ['.'],
  ],
  [
    'api-contract',
    ['.', './feedback'],
  ],
  [
    'capacitor',
    ['.'],
  ],
  [
    'datapipe',
    ['.'],
  ],
  [
    'tools',
    ['.'],
  ],
  [
    'storage',
    ['.', './client', './schemas'],
  ],
  [
    'reldb',
    ['./schemas'],
  ],
])

const hidden = new Map([
  [
    'ai',
    [
      'LLMProvider',
      'AILLMFunctionsDeps',
      'ContextDeps',
      'EmbeddingProvider',
      'sessionStoreKey',
      'A2ATaskStore',
    ],
  ],
  [
    'audit',
    ['createHelper'],
  ],
  [
    'cache',
    ['CacheProvider'],
  ],
  [
    'capacitor',
    [
      'createCapacitorTokenStorage',
      'safeGetPreference',
      'safeSetPreference',
      'safeRemovePreference',
    ],
  ],
  [
    'storage',
    ['StorageProvider'],
  ],
  [
    'reldb',
    ['ReldbProvider'],
  ],
  [
    'reach',
    ['ReachProvider'],
  ],
  [
    'feedback',
    [
      'FeedbackReportRepository',
      'createFeedbackOperations',
    ],
  ],
  [
    'ui',
    ['readStoredValue', 'writeStoredValue'],
  ],
])

/** 真实自引用消费已发布声明；负例防止内部类型或浏览器服务器实例重新泄漏。 */
function typeSmoke(directories, suffix, browser, generated, { nodeWithoutDom = false, withoutFeedback = false } = {}) {
  const sources = directories.map(({ directory, manifest, base }) => {
    const source = [`import * as api from '${manifest.name}'`, 'export type PublishedApi = typeof api']
    for (const name of hidden.get(directory) ?? [])
      source.push('// @ts-expect-error Internal binding is not a public import', `import type { ${name} } from '${manifest.name}'`)
    if (directory === 'ai')
      source.push('import type { AIStoreProvider, AskOptions, ChatHistoryOptions, ChatRecord } from \'@h-ai/ai\'', 'export type Extensions = [AIStoreProvider, AskOptions, ChatHistoryOptions, ChatRecord]')
    if (directory === 'ai') {
      if (!browser) {
        source.push('export const makeAgentHttp = api.ai.a2a.createHttpHandler')
      }
      for (const name of [
        'AgentEvent',
        'Message',
        'Part',
        'SendMessageRequest',
        'Task',
        'TaskArtifactUpdateEvent',
        'TaskStatus',
        'TaskStatusUpdateEvent',
        'McpServer',
        'SSEServerTransport',
        'StdioServerTransport',
        'StreamableHTTPServerTransport',
      ])
        source.push('// @ts-expect-error SDK 运行值只通过 ai 暴露', `api.${name}`)
      if (!browser)
        source.push('export const message: api.Message = api.ai.Message.fromJSON({ role: "ROLE_USER", messageId: "example", parts: [{ text: "Hello" }] })')
      source.push('import { ai as audioAi } from \'@h-ai/ai/client\'', 'export type AudioFactory = typeof audioAi.createAudioClient')
      for (const name of [
        'AIClient',
        'AIClientConfig',
        'AIApiAdapter',
        'A2AClientOperations',
        'StreamProgress',
        'StreamOptions',
        'createAIClient',
        'createA2AClient',
        'parseSSE',
        'collectStreamContent',
        'createUnconfiguredAudioClient',
      ])
        source.push('// @ts-expect-error Removed redundant legacy client binding', `import type { ${name} } from '@h-ai/ai/client'`)
    }
    if (directory === 'reldb') {
      source.push('import { ReldbConfigSchema, MysqlSslConfigSchema } from \'@h-ai/reldb/schemas\'', 'export const database = ReldbConfigSchema.parse({ type: \'mysql\', database: \'app\', ssl: {} })', 'export const tls = MysqlSslConfigSchema.parse({})')
      source.push('// @ts-expect-error Pure schemas do not export the server singleton', 'import { reldb } from \'@h-ai/reldb/schemas\'')
    }
    if (directory === 'payment')
      source.push('import type { PaymentProvider } from \'@h-ai/payment\'', 'export type Extension = PaymentProvider')
    if (directory === 'serv') {
      source.push('export const procedureFactories = [api.serv.createAiProcedures, api.serv.createIamProcedures, api.serv.createStorageProcedures, api.serv.createFeedbackProcedures]')
      for (const factory of servCapabilityFactories)
        source.push(`export const ${factory} = api.serv.${factory}`)
      for (const name of removedServFactories)
        source.push('// @ts-expect-error 按实际能力公开工厂', `api.serv.${name}`)
      for (const [index, specifier] of removedServSubpaths.entries()) {
        source.push(
          '// @ts-expect-error Serv 的运行能力从根入口导入',
          `import type * as retiredServFeature${index} from '${specifier}'`,
        )
      }
    }
    if (directory === 'capacitor')
      source.push('export const nativeTokens: import("@h-ai/api-client").TokenStorage = api.capacitor.createTokenStorage()', 'export const preferences: api.PreferencesOperations = api.capacitor.preferences')
    if (directory === 'crypto') {
      source.push('export const limits = api.crypto.transport.resolveBodyLimits(2048)', 'export const protocol = api.crypto.transport.protocol', 'export const invalidRing = api.crypto.transport.parseServerKeyRing(null)', 'export function publicKeyLength(input: unknown) { return api.crypto.asymmetric.isValidPublicKey(input) ? input.length : 0 }')
      for (const removed of [
        'createCacheTransportKeyStore',
        'parseTransportServerKeyRing',
        'resolveTransportBodyLimits',
        'readTransportBody',
        'createTransportBodyPolicy',
        'authenticateTransportRequest',
        'createTransportErrorResponse',
        'isValidSM2PublicKey',
        'TRANSPORT_PROTOCOL',
        'TRANSPORT_BODY_LIMITS',
        'TRANSPORT_PLAINTEXT_RANGE',
        'TRANSPORT_TIME_LIMITS',
      ])
        source.push('// @ts-expect-error 运行能力只从 crypto 命名空间调用，不保留包级别名', `api.${removed}`)
    }
    if (directory === 'core') {
      source.push('const onInput = api.core.async.debounce((value: string, count: number) => value.repeat(count), 100)', 'const onScroll = api.core.async.throttle((position: number) => position + 1, 100)', 'onInput("sample", 2); onScroll(1)')
      source.push('// @ts-expect-error 防抖包装保留回调参数类型', 'onInput(2, "sample")', '// @ts-expect-error 节流包装不接受缺失的必需参数', 'onScroll()')
      source.push('export const policy = api.RequestAccessConfigSchema.parse(false)', 'export const rateLimit = api.HttpRateLimitConfigSchema.parse(false)')
      source.push(
        'const pool: api.WorkerPool<string, number> = api.core.worker.createPool(new URL("file:///opt/app/report-worker.mjs"), { maxWorkers: 1, maxQueuedJobs: 2 })',
        'export const pendingWorkerResult: Promise<api.HaiResult<number>> = pool.run("sample")',
        '// @ts-expect-error 任务输入类型由 WorkerPool 契约约束',
        'pool.run(5)',
      )
      source.push('// @ts-expect-error 请求检查执行函数统一注册在 core.access', 'api.createRequestCheck(false)')
      if (browser) {
        source.push('// @ts-expect-error 浏览器没有 Node 访问策略执行能力', 'api.core.access', 'api.core.worker.createPool(() => new Worker(new URL("/worker.js", "https://example.test"), { type: "module" }), { maxWorkers: 1, maxQueuedJobs: 0 })')
      }
      else {
        source.push(
          'export const access: api.AccessFunctions = api.core.access',
          'export const decision = access.createRequestCheck(policy)(\'/api/example\', \'GET\')',
          'const rateLimitStore: api.RateLimitStore = access.createMemoryRateLimitStore()',
          'export const evaluateRateLimit = access.createRateLimiter({ store: rateLimitStore })',
        )
      }
    }
    if (directory === 'kit') {
      source.push('import { kit as browserKit } from \'@h-ai/kit/client\'', 'export const browserClient = browserKit.client.create({ auth: true })')
      source.push('// @ts-expect-error SvelteKit client entry must exclude server methods with the default conditions too', 'browserKit.createHandle({})')
      source.push(
        'export const articleTitle: string = api.kit.crud.resolveText(() => "Article title")',
        'export const articleOptions: ReturnType<typeof api.kit.crud.resolveOptions> = browserKit.crud.resolveOptions(() => [{ label: "Published", value: true }])',
        'export const showReportLink: boolean = api.kit.guard.matchPermission("reports:read", ["reports:*"])',
        'export const browserShowReportLink: boolean = browserKit.guard.matchPermission("reports:read", ["reports:*"])',
        '// @ts-expect-error 浏览器只匹配用于展示的权限，不运行服务端守卫',
        'browserKit.guard.require',
      )
      for (const name of movedKitMethods) {
        source.push('// @ts-expect-error 原有顶层方法已归入实际子命名空间', `api.kit.${name}`)
        source.push('// @ts-expect-error 浏览器入口也只在对应子命名空间公开方法', `browserKit.${name}`)
      }
      for (const [index, specifier] of removedKitSubpaths.entries())
        source.push('// @ts-expect-error A2A 与加密从 Kit 根入口导入', `import type * as retiredKitFeature${index} from '${specifier}'`)
      source.push('export const publicKit: api.KitPublicConfig = { transport: false }')
      source.push('export function readonlyClientPaths(crypto: api.ClientTransportConfig["crypto"]) { return api.kit.client.create({ transport: { crypto, excludePaths: ["/api/public"] as const } }) }')
      if (!browser) {
        source.push('export function configuredHost(crypto: api.HookCryptoConfig["crypto"], serverKeyRing: api.TransportEncryptionOptions["serverKeyRing"], keyStore: api.TransportEncryptionOptions["keyStore"]) { const config = api.kit.resolveConfig({ transport: {} }); if (config.transport !== false) return api.kit.createHandle({ http: { ...config.http, rateLimit: false }, transport: { ...config.transport, crypto, serverKeyRing, keyStore } }) }')
        source.push(
          'export const mountAgent = api.kit.createHandle({ a2a: false })',
          '// @ts-expect-error A2A HTTP handler is created by AI',
          'api.kit.a2a',
          'export const transportEncryption = api.kit.crypto.transportEncryptionMiddleware',
          'export const requireReport = api.kit.guard.require',
        )
      }
      source.push('// @ts-expect-error No implementation exists for this subpath', 'import * as absent from \'@h-ai/kit/vite\'')
      source.push('// @ts-expect-error Runtime helpers belong to the kit namespace or client subpath', 'api.createHandle({})')
      if (browser) {
        source.push(
          '// @ts-expect-error Server handle is unavailable in browser',
          'api.kit.createHandle({})',
          '// @ts-expect-error 服务端授权守卫不能在浏览器运行',
          'api.kit.guard.require',
          '// @ts-expect-error 服务端协议不属于浏览器入口',
          'api.kit.a2a',
          '// @ts-expect-error 服务端加密中间件不属于浏览器入口',
          'api.kit.crypto',
        )
      }
    }
    if (directory === 'ui') {
      source.push('// @ts-expect-error Only explicit component barrels are public', 'import * as internal from \'@h-ai/ui/components/scenes/ai/highlight\'')
      source.push('import { ui as toastUi } from \'@h-ai/ui/toast\'')
      source.push('api.ui.toast.remove(api.ui.notifySuccess("Saved", 0))', 'toastUi.toast.remove(toastUi.notifySuccess("Saved", 0))')
      source.push('// @ts-expect-error 内部 Toast 计时器不属于公开契约', 'toastUi.toast.deadline')
      source.push('// @ts-expect-error 通知方法只通过 ui 暴露', 'api.notifySuccess("Saved")')
    }
    if (directory === 'storage') {
      source.push('const storageClient: import("@h-ai/storage/client").ClientOperations = api.storage.client', 'const mime: string = storageClient.getMimeType("report.txt")')
      for (const name of [
        'uploadWithPresignedUrl',
        'downloadWithPresignedUrl',
        'downloadAndSave',
        'getMimeType',
        'getFileExtension',
        'formatFileSize',
      ])
        source.push('// @ts-expect-error 客户端操作只从 storage.client 访问', `api.${name}`)
      for (const name of [
        'init',
        'close',
        'file',
        'dir',
        'presign',
        'checksum',
        'config',
        'isInitialized',
      ]) {
        if (browser)
          source.push('// @ts-expect-error 浏览器门面不提供 Node 存储能力', `api.storage.${name}`)
        else
          source.push(`export const serverStorage_${name} = api.storage.${name}`)
      }
    }
    if (browser && directory === 'iam')
      source.push('// @ts-expect-error Server singleton is unavailable in browser', `api.${directory}`)
    if (browser && directory === 'ai')
      source.push('// @ts-expect-error Server lifecycle is unavailable in browser', 'api.ai.init({})', '// @ts-expect-error Server constructors are unavailable in browser', 'api.ai.McpServer', '// @ts-expect-error Server factories are unavailable in browser', 'api.ai.createMcpServer')
    const file = join(base, `${suffix}-${browser ? 'browser' : 'node'}.ts`)
    // 写入失败也可能已经产生部分文件，先登记再落盘。
    generated.push(file)
    writeFileSync(file, `${source.join('\n')}\n`)
    return file
  })
  const options = {
    noEmit: true,
    strict: true,
    skipLibCheck: !(nodeWithoutDom || withoutFeedback),
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    customConditions: browser
      ? ['browser']
      : [],
    allowArbitraryExtensions: true,
    types: nodeWithoutDom
      ? ['node']
      : [],
    ...(nodeWithoutDom
      ? {
          lib: ['lib.es2022.d.ts'],
        }
      : {}),
  }
  const host = ts.createCompilerHost(options)
  if (withoutFeedback) {
    // 工作区安装了 Feedback 开发依赖；此消费者只安装 Kit 及其必需依赖。
    host.resolveModuleNameLiterals = (literals, containingFile, redirectedReference, compilerOptions, sourceFile) => literals.map((literal) => {
      if (literal.text === '@h-ai/feedback' || literal.text.startsWith('@h-ai/feedback/'))
        return { resolvedModule: undefined }
      const mode = ts.getModeForUsageLocation(sourceFile, literal, compilerOptions)
      return ts.resolveModuleName(literal.text, containingFile, compilerOptions, host, undefined, redirectedReference, mode)
    })
  }
  const program = ts.createProgram(sources, options, host)
  const diagnostics = ts.getPreEmitDiagnostics(program)
  if (diagnostics.length) {
    throw new Error(ts.formatDiagnostics(diagnostics, {
      getCanonicalFileName: value => value,
      getCurrentDirectory: () => root,
      getNewLine: () => '\n',
    }))
  }
}

/** 按 Node 条件顺序选取 import/default；browser/svelte 仅由对应构建器选择。 */
function select(entries, subpath, browser = false) {
  return entries.find(entry => entry.subpath === subpath
    && !entry.conditions.includes('types')
    && entry.conditions.every(condition => [
      'import',
      'default',
      ...(browser
        ? ['browser', 'svelte']
        : ['node']),
    ].includes(condition)))
}

/** Svelte 的组件和 Rune 模块先经真实编译器转换，不把内部模块外置来伪装浏览器兼容。 */
function sveltePlugin(generate) {
  return {
    name: 'svelte-api-smoke',
    setup(build) {
      build.onLoad({ filter: /\.svelte(?:\.js)?$/ }, ({ path }) => {
        const source = readFileSync(path, 'utf8')
        const result = path.endsWith('.svelte')
          ? compile(source, { filename: path, generate, css: 'injected' })
          : compileModule(source, { filename: path, generate })
        return {
          contents: result.js.code,
          loader: 'js',
          resolveDir: dirname(path),
        }
      })
    },
  }
}

/** 单次公开包导入放在隔离进程；超时或非零退出都属于失败。 */
function child(directory, args) {
  const result = spawnSync(process.execPath, args, { cwd: directory, encoding: 'utf8', timeout: 60_000 })
  if (result.error || result.status !== 0)
    throw new Error(`${directory}: ${result.error?.message ?? result.stderr ?? result.stdout}`)
}

/** 仅安装入门依赖的应用也须能打包；隔离提升的可选插件，实际验证 Vite 的 optional peer 解析。 */
async function capacitorConsumerSmoke(base, manifest, temporary) {
  const consumer = join(temporary, 'capacitor-consumer')
  const copiedPackage = join(consumer, 'node_modules/@h-ai/capacitor')
  mkdirSync(copiedPackage, { recursive: true })
  cpSync(join(base, 'dist'), join(copiedPackage, 'dist'), { recursive: true })
  writeFileSync(join(copiedPackage, 'package.json'), JSON.stringify(manifest))
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ type: 'module', private: true }))
  writeFileSync(join(consumer, 'index.html'), '<script type="module" src="/main.js"></script>')
  writeFileSync(join(consumer, 'main.js'), 'import { capacitor } from "@h-ai/capacitor"; globalThis.nativeBridge = { capacitor, tokens: capacitor.createTokenStorage() }')
  for (const name of ['@h-ai/core', '@capacitor/core', '@capacitor/preferences']) {
    const destination = join(consumer, 'node_modules', name)
    mkdirSync(dirname(destination), { recursive: true })
    symlinkSync(realpathSync(join(root, 'node_modules', name)), destination, 'junction')
  }
  // Vite 是实际移动端消费者已声明的依赖，不为脚本额外安装构建器。
  const consumerRequire = createRequire(join(root, 'apps/mobile-app/package.json'))
  const { build: buildConsumer } = await import(pathToFileURL(consumerRequire.resolve('vite')).href)
  await buildConsumer({
    root: consumer,
    configFile: false,
    logLevel: 'silent',
    build: { write: false, minify: false },
  })
}

const temporary = mkdtempSync(join(tmpdir(), 'hai-api-smoke-'))
const generated = []
const generatedDirectories = [
  {
    directory: temporary,
    parent: tmpdir(),
  },
]
const failures = []
let imports = 0
let bundles = 0
const directories = []
try {
  for (const directory of readdirSync(join(root, 'packages'))) {
    if (packageFilter && directory !== packageFilter)
      continue
    const base = join(root, 'packages', directory)
    let manifest
    try {
      manifest = JSON.parse(readFileSync(join(base, 'package.json'), 'utf8'))
    }
    catch {
      continue
    }
    directories.push({ directory, manifest, base })
  }
  if (!directories.length)
    throw new Error(`No package found for ${packageFilter}`)
  for (const browser of [false, true]) {
    try {
      typeSmoke(directories, basename(temporary), browser, generated)
    }
    catch (error) {
      failures.push(`${browser ? 'Browser' : 'Node'} public declarations: ${error.message}`)
    }
  }
  if (directories.some(({ directory }) => directory === 'core')) {
    try {
      typeSmoke(directories.filter(({ directory }) => directory === 'core'), `${basename(temporary)}-core-only`, false, generated, { nodeWithoutDom: true })
    }
    catch (error) {
      failures.push(`Core Node declarations without DOM types: ${error.message}`)
    }
  }
  const kitPackages = directories.filter(({ directory }) => directory === 'kit')
  if (kitPackages.length) {
    for (const browser of [false, true]) {
      try {
        typeSmoke(kitPackages, `${basename(temporary)}-kit-only`, browser, generated, { withoutFeedback: true })
      }
      catch (error) {
        failures.push(`${browser ? 'Browser' : 'Node'} Kit declarations without optional Feedback peer: ${error.message}`)
      }
    }
  }
  for (const { directory, manifest, base } of directories) {
    const entries = expandPackageExports(base, manifest.exports ?? {})
    try {
      if (directory === 'cli') {
        child(base, ['./dist/index.js', '--help'])
        child(base, ['./dist/index.js', '--version'])
      }
      else if (directory === 'ui') {
        // esbuild 还会生成 CSS 等旁路产物；包内隔离目录保留依赖解析并统一回收。
        const outputDirectory = mkdtempSync(join(base, `${basename(temporary)}-`))
        generatedDirectories.push({ directory: outputDirectory, parent: base })
        const outfile = join(outputDirectory, 'index.mjs')
        await build({
          entryPoints: [select(entries, '.').file],
          outfile,
          bundle: true,
          format: 'esm',
          platform: 'node',
          conditions: ['svelte'],
          tsconfigRaw: {},
          banner: { js: 'import { createRequire as createSmokeRequire } from \'node:module\'; const require = createSmokeRequire(import.meta.url);' },
          plugins: [
            sveltePlugin('server'),
          ],
          loader: { '.css': 'empty' },
          logLevel: 'silent',
        })
        child(base, [outfile])
        child(base, ['--input-type=module', '--eval', 'await import(\'@h-ai/ui/auto-import\'); await import(\'@h-ai/ui/vite\')'])
      }
      else {
        const paths = [
          ...new Set(entries.filter(entry => select(entries, entry.subpath) === entry
            && entry.target.endsWith('.js') && !(directory === 'kit' && entry.subpath === './client')).map(entry => `${manifest.name}${entry.subpath.slice(1)}`)),
        ]
        child(base, ['--input-type=module', '--eval', `for (const name of ${JSON.stringify(paths)}) await import(name)`])
        if (directory === 'core')
          child(base, ['--input-type=module', '--eval', 'const api = await import(\'@h-ai/core\'); if (\'createRequestCheck\' in api || !api.core.access.createRequestCheck(false)(\'/api/example\', \'GET\').allowed) throw new Error(\'Core access registration mismatch\')'])
        if (directory === 'capacitor')
          child(base, ['--input-type=module', '--eval', 'const api = await import("@h-ai/capacitor"); if (typeof api.capacitor.createTokenStorage !== "function" || ["createCapacitorTokenStorage", "safeGetPreference", "safeSetPreference", "safeRemovePreference"].some(name => name in api)) throw new Error("Capacitor public exports mismatch")'])
        if (directory === 'serv') {
          child(base, ['--input-type=module', '--eval', `
            import assert from 'node:assert/strict'
            const { serv } = await import('@h-ai/serv')
            for (const factory of ${JSON.stringify(servCapabilityFactories)})
              assert.equal(typeof serv[factory], 'function', factory)
            for (const factory of ${JSON.stringify(removedServFactories)})
              assert.equal(factory in serv, false, factory)
            for (const specifier of ${JSON.stringify(removedServSubpaths)})
              await assert.rejects(import(specifier), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' })
          `])
        }
        if (directory === 'kit') {
          child(base, ['--input-type=module', '--eval', `
            import assert from 'node:assert/strict'
            const { kit } = await import('@h-ai/kit')
            assert.equal(kit.crud.resolveText(() => 'Article title'), 'Article title')
            assert.deepEqual(kit.crud.resolveOptions(undefined), [])
            assert.ok(kit.guard.matchPermission('reports:read', ['reports:*']))
            assert.equal('a2a' in kit, false)
            assert.equal(typeof kit.crypto.transportEncryptionMiddleware, 'function')
            for (const method of ${JSON.stringify(movedKitMethods)})
              assert.equal(method in kit, false, method)
            for (const specifier of ${JSON.stringify(removedKitSubpaths)})
              await assert.rejects(import(specifier), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' })
          `])
        }
      }
      imports++
    }
    catch (error) {
      failures.push(`${manifest.name} Node import: ${error.message}`)
    }
    if (directory === 'capacitor') {
      try {
        await capacitorConsumerSmoke(base, manifest, temporary)
        bundles++
      }
      catch (error) {
        failures.push(`${manifest.name} minimal Vite consumer: ${error.message}`)
      }
    }
    const paths = directory === 'ui'
      ? [
          ...new Set(entries.filter(entry => !entry.subpath.startsWith('./styles/') && !['./auto-import', './vite'].includes(entry.subpath)).map(entry => entry.subpath)),
        ]
      : browsers.get(directory) ?? []
    for (const subpath of paths) {
      try {
        const entry = select(entries, subpath, true)
        if (!entry)
          throw new Error('No browser import target')
        const result = await build({
          entryPoints: [entry.file],
          bundle: true,
          write: false,
          format: 'esm',
          platform: 'browser',
          conditions: ['browser', 'svelte'],
          tsconfigRaw: {},
          metafile: true,
          plugins: [
            sveltePlugin('client'),
          ],
          logLevel: 'silent',
          // $app 由 SvelteKit 提供，不能当作 Node polyfill；全部普通依赖仍完整打包。
          external: ['$app/navigation', '$app/state'],
          loader: { '.css': 'empty' },
        })
        const builtins = Object.keys(result.metafile.inputs).filter(path => path.startsWith('node:'))
        if (builtins.length)
          throw new Error(`Node builtins in browser graph: ${builtins.join(', ')}`)
        bundles++
      }
      catch (error) {
        failures.push(`${manifest.name}${subpath.slice(1)} browser bundle: ${error.message}`)
      }
    }
  }
}
finally {
  for (const file of generated) {
    try {
      rmSync(file, { force: true })
    }
    catch (error) {
      failures.push(`Temporary file cleanup ${file}: ${error.message}`)
    }
  }
  for (const { directory, parent } of generatedDirectories.reverse()) {
    try {
      const target = resolve(directory)
      if (dirname(target) !== resolve(parent) || !basename(target).startsWith('hai-api-smoke-')) {
        failures.push(`Temporary directory cleanup ${directory}: Unexpected temporary directory`)
        continue
      }
      rmSync(target, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100,
      })
    }
    catch (error) {
      // 继续清理其余资源，同时保留前面的导入/构建错误。
      failures.push(`Temporary directory cleanup ${directory}: ${error.message}`)
    }
  }
}
if (failures.length) {
  process.stderr.write(`${failures.join('\n')}\n`)
  process.exitCode = 1
}
process.stdout.write(`API smoke: ${imports}/${directories.length} package imports; ${bundles} browser entries\n`)
