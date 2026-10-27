import { mkdtemp, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { ESLint } from 'eslint'
import ts from 'typescript'
import { expect, it } from 'vitest'
import { buildTemplateContext, generateFromTemplates } from '../src/commands/cli-template-engine.js'

it.each(['admin', 'api', 'fullstack'] as const)('%s 生成工程将本地产物身份接入实际编译与反馈初始化', async (appType) => {
  const directory = await mkdtemp(path.join(process.cwd(), '.tmp-build-metadata-template-'))
  try {
    await generateFromTemplates(directory, buildTemplateContext({ name: 'metadata-sample', appType, frontends: ['web', 'app', 'desktop'], features: ['feedback'], packageManager: 'pnpm' }))
    const read = (file: string) => readFile(path.join(directory, file), 'utf8')
    expect(await read('scripts/build-metadata.ts')).toContain('resolveBuildMetadata')
    const targets = appType === 'admin'
      ? ['vite.config.ts']
      : appType === 'api'
        ? ['apps/metadata-sample-serv/tsup.config.ts']
        : ['packages/metadata-sample-serv/tsup.config.ts', ...['web', 'app', 'desktop'].map(target => `apps/metadata-sample-${target}/vite.config.ts`)]
    for (const target of targets) {
      const config = await read(target)
      expect(config).toContain('__HAI_BUILD_METADATA__')
      expect(config).toContain('resolveBuildMetadata')
      expect(config).toContain('import.meta.url')
      await verifyMetadataOutput(config, path.join(directory, target))
    }
    const runtime = appType === 'admin' ? 'src/lib/server/init.ts' : appType === 'api' ? 'apps/metadata-sample-serv/src/lib/server/init.ts' : 'packages/metadata-sample-serv/src/server/runtime.ts'
    expect(await read(runtime)).toContain('...buildMetadata')
    const dockerfiles = appType === 'fullstack' ? ['images/serv.Dockerfile', 'images/web.Dockerfile'] : [appType === 'api' ? 'images/serv.Dockerfile' : 'images/web.Dockerfile']
    for (const file of dockerfiles) {
      const dockerfile = await read(file)
      expect(dockerfile).toContain('ARG HAI_BUILD_ID=')
      expect(dockerfile).toContain('ARG HAI_BUILD_COMMIT=unknown')
      expect(dockerfile).toContain('HAI_BUILD_ID="$HAI_BUILD_ID" HAI_BUILD_COMMIT="$HAI_BUILD_COMMIT"')
    }
    if (appType === 'fullstack') {
      const workspace = await read('packages/metadata-sample-shared/src/lib/components/AdminWorkspace.svelte')
      expect(workspace).toContain('initializeBrowserFeedback(buildMetadata)')
      expect(workspace).not.toContain('initializeBrowserFeedback(store.info?.version)')
      const client = await read('packages/metadata-sample-shared/src/lib/api/feedback-client.ts')
      expect(client).toContain('...metadata')
      for (const target of ['web', 'app', 'desktop']) {
        const app = await read(`apps/metadata-sample-${target}/src/App.svelte`)
        expect(app).toContain('{buildMetadata}')
        expect(await read(`apps/metadata-sample-${target}/src/build-metadata.ts`)).toContain('__HAI_BUILD_METADATA__')
      }
    }
    const eslint = new ESLint({ cwd: directory, overrideConfigFile: path.join(directory, 'eslint.config.js') })
    const sourceFiles = [
      ...targets,
      'scripts/build-metadata.ts',
      ...(appType === 'fullstack' ? ['web', 'app', 'desktop'].flatMap(target => [`apps/metadata-sample-${target}/src/App.svelte`, `apps/metadata-sample-${target}/src/build-metadata.ts`]) : []),
    ]
    const linted = await eslint.lintFiles(sourceFiles)
    expect(linted.flatMap(result => result.messages.filter(message => message.severity === 2).map(message => `${path.relative(directory, result.filePath)}:${message.line} ${message.ruleId} ${message.message}`))).toEqual([])
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 30_000)

/** 执行静态生成配置的输出钩子，旁证必须与实际 define 共用同一 tuple；不运行构建、不写 dist。 */
async function verifyMetadataOutput(source: string, configPath: string): Promise<void> {
  interface BuildConfig {
    define: Record<string, string>
    plugins?: unknown[]
    onSuccess?: () => Promise<void>
  }
  const expected = { appVersion: '10.20.30', buildId: 'unit-artifact-build', commit: 'a'.repeat(40) }
  const emitted: Array<{ fileName: string, source: string }> = []
  const written: Array<{ destination: URL, body: string }> = []
  const sandbox = {
    config: undefined as BuildConfig | undefined,
    process: { env: {}, cwd: () => path.dirname(configPath) },
    URL,
    path,
    fileURLToPath,
    resolveBuildMetadata: (directory: string) => {
      expect(path.resolve(directory)).toBe(path.dirname(configPath))
      return expected
    },
    defineConfig: (input: unknown) => typeof input === 'function' ? input({ mode: 'production', command: 'build' }) : input,
    writeFile: async (destination: URL, body: string) => { written.push({ destination, body }) },
    sveltekit: () => ({}),
    svelte: () => ({}),
    paraglideVitePlugin: () => ({}),
    tailwindcss: () => ({}),
    haiOptimizeExclude: [],
    haiPrebundledDeps: [],
  }
  const executable = source.replace(/^import[^\n]*\n/gm, '').replace('export default', 'config =').replaceAll('import.meta.url', JSON.stringify(pathToFileURL(configPath).href))
  runInNewContext(ts.transpileModule(executable, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText, sandbox)
  const config = sandbox.config
  expect(config).toBeDefined()
  if (!config)
    throw new Error('The generated build configuration was not evaluated')
  expect(JSON.parse(config.define.__HAI_BUILD_METADATA__!)).toEqual(expected)
  if (config.onSuccess) {
    await config.onSuccess()
    expect(written).toHaveLength(1)
    expect(fileURLToPath(written[0]!.destination)).toBe(path.join(path.dirname(configPath), 'dist/build-metadata.json'))
    expect(JSON.parse(written[0]!.body)).toEqual(expected)
  }
  else {
    const plugin = config.plugins?.[0]
    const hook = plugin && typeof plugin === 'object' && 'generateBundle' in plugin ? plugin.generateBundle : undefined
    expect(typeof hook).toBe('function')
    if (typeof hook === 'function')
      Reflect.apply(hook, { emitFile: (asset: { fileName: string, source: string }) => emitted.push(asset) }, [])
    expect(emitted).toEqual([{ type: 'asset', fileName: 'build-metadata.json', source: JSON.stringify(expected) }])
  }
}
