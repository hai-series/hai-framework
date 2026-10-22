/**
 * 针对已构建公开入口做导入/浏览器打包冒烟；不初始化服务或执行完整业务测试。
 * @example `node scripts/module-api-smoke.mjs`
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { expandPackageExports } from './module-api-inventory.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(join(root, 'packages/ai/package.json'))
// 复用包构建器已经安装的 esbuild，不引入另一个版本或工作区外的工具。
const { build } = createRequire(require.resolve('tsup'))('esbuild')
const { compile, compileModule } = createRequire(join(root, 'packages/ui/package.json'))('svelte/compiler')
const browsers = new Map([
  ['core', ['.']],
  ['iam', ['.']],
  ['kit', ['.', './client']],
  ['ai', ['.', './client']],
  ['crypto', ['.']],
  ['api-client', ['.']],
  ['api-contract', ['.']],
  ['capacitor', ['.']],
  ['datapipe', ['.']],
  ['storage', ['./schemas']],
])

const hidden = new Map([
  ['ai', ['LLMProvider', 'AILLMFunctionsDeps', 'ContextDeps', 'EmbeddingProvider', 'sessionStoreKey', 'A2ATaskStore']],
  ['audit', ['createHelper']],
  ['cache', ['CacheProvider']],
  ['storage', ['StorageProvider']],
  ['reldb', ['ReldbProvider']],
  ['reach', ['ReachProvider']],
  ['ui', ['readStoredValue', 'writeStoredValue']],
])

/** 真实自引用消费已发布声明；负例防止内部类型或浏览器服务器实例重新泄漏。 */
function typeSmoke(directories, suffix, browser, generated) {
  const sources = directories.map(({ directory, manifest, base }) => {
    const source = [`import * as api from '${manifest.name}'`, 'export type PublishedApi = typeof api']
    for (const name of hidden.get(directory) ?? [])
      source.push('// @ts-expect-error Internal binding is not a public import', `import type { ${name} } from '${manifest.name}'`)
    if (directory === 'ai')
      source.push('import type { AIStoreProvider, AskOptions, ChatHistoryOptions, ChatRecord } from \'@h-ai/ai\'', 'export type Extensions = [AIStoreProvider, AskOptions, ChatHistoryOptions, ChatRecord]')
    if (directory === 'ai') {
      source.push('import { createAudioClient } from \'@h-ai/ai/client\'', 'export type AudioFactory = typeof createAudioClient')
      for (const name of ['AIClient', 'AIClientConfig', 'AIApiAdapter', 'A2AClientOperations', 'StreamProgress', 'StreamOptions', 'createAIClient', 'createA2AClient', 'parseSSE', 'collectStreamContent', 'createUnconfiguredAudioClient'])
        source.push('// @ts-expect-error Removed redundant legacy client binding', `import type { ${name} } from '@h-ai/ai/client'`)
    }
    if (directory === 'payment')
      source.push('import type { PaymentProvider } from \'@h-ai/payment\'', 'export type Extension = PaymentProvider')
    if (directory === 'kit') {
      source.push('// @ts-expect-error No implementation exists for this subpath', 'import * as absent from \'@h-ai/kit/vite\'')
      source.push('// @ts-expect-error Runtime helpers belong to the kit namespace or client subpath', 'api.createHandle({})')
      if (browser)
        source.push('// @ts-expect-error Server handle is unavailable in browser', 'api.kit.createHandle({})')
    }
    if (directory === 'ui')
      source.push('// @ts-expect-error Only explicit component barrels are public', 'import * as internal from \'@h-ai/ui/components/scenes/ai/highlight\'')
    if (browser && ['ai', 'iam'].includes(directory))
      source.push('// @ts-expect-error Server singleton is unavailable in browser', `api.${directory}`)
    if (browser && directory === 'ai')
      source.push('// @ts-expect-error Server constructors are unavailable in browser', 'api.McpServer', '// @ts-expect-error Server factories are unavailable in browser', 'api.createMcpServer')
    const file = join(base, `${suffix}-${browser ? 'browser' : 'node'}.ts`)
    // 写入失败也可能已经产生部分文件，先登记再落盘。
    generated.push(file)
    writeFileSync(file, `${source.join('\n')}\n`)
    return file
  })
  const program = ts.createProgram(sources, { noEmit: true, strict: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, customConditions: browser ? ['browser'] : [], allowArbitraryExtensions: true, types: [] })
  const diagnostics = ts.getPreEmitDiagnostics(program)
  if (diagnostics.length)
    throw new Error(ts.formatDiagnostics(diagnostics, { getCanonicalFileName: value => value, getCurrentDirectory: () => root, getNewLine: () => '\n' }))
}

/** 按 Node 条件顺序选取 import/default；browser/svelte 仅由对应构建器选择。 */
function select(entries, subpath, browser = false) {
  return entries.find(entry => entry.subpath === subpath
    && !entry.conditions.includes('types')
    && entry.conditions.every(condition => ['import', 'default', ...(browser ? ['browser', 'svelte'] : ['node'])].includes(condition)))
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
        return { contents: result.js.code, loader: 'js', resolveDir: dirname(path) }
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

const temporary = mkdtempSync(join(tmpdir(), 'hai-api-smoke-'))
const generated = []
const generatedDirectories = [{ directory: temporary, parent: tmpdir() }]
const failures = []
let imports = 0
let bundles = 0
try {
  const directories = []
  for (const directory of readdirSync(join(root, 'packages'))) {
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
  for (const browser of [false, true]) {
    try {
      typeSmoke(directories, basename(temporary), browser, generated)
    }
    catch (error) {
      failures.push(`${browser ? 'Browser' : 'Node'} public declarations: ${error.message}`)
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
        await build({ entryPoints: [select(entries, '.').file], outfile, bundle: true, format: 'esm', platform: 'node', conditions: ['svelte'], tsconfigRaw: {}, banner: { js: 'import { createRequire as createSmokeRequire } from \'node:module\'; const require = createSmokeRequire(import.meta.url);' }, plugins: [sveltePlugin('server')], loader: { '.css': 'empty' }, logLevel: 'silent' })
        child(base, [outfile])
        child(base, ['--input-type=module', '--eval', 'await import(\'@h-ai/ui/auto-import\'); await import(\'@h-ai/ui/vite\')'])
      }
      else {
        const paths = [...new Set(entries.filter(entry => select(entries, entry.subpath) === entry
          && entry.target.endsWith('.js') && !(directory === 'kit' && entry.subpath === './client')).map(entry => `${manifest.name}${entry.subpath.slice(1)}`))]
        child(base, ['--input-type=module', '--eval', `for (const name of ${JSON.stringify(paths)}) await import(name)`])
      }
      imports++
    }
    catch (error) {
      failures.push(`${manifest.name} Node import: ${error.message}`)
    }
    const paths = directory === 'ui'
      ? [...new Set(entries.filter(entry => !entry.subpath.startsWith('./styles/') && !['./auto-import', './vite'].includes(entry.subpath)).map(entry => entry.subpath))]
      : browsers.get(directory) ?? []
    for (const subpath of paths) {
      try {
        const entry = select(entries, subpath, true)
        if (!entry)
          throw new Error('No browser import target')
        const result = await build({ entryPoints: [entry.file], bundle: true, write: false, format: 'esm', platform: 'browser', conditions: ['browser', 'svelte'], tsconfigRaw: {}, metafile: true, plugins: [sveltePlugin('client')], logLevel: 'silent',
          // $app 由 SvelteKit 提供，不能当作 Node polyfill；全部普通依赖仍完整打包。
          external: ['$app/navigation', '$app/state'], loader: { '.css': 'empty' } })
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
      rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
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
process.stdout.write(`API smoke: ${imports}/21 package imports; ${bundles} browser entries\n`)
