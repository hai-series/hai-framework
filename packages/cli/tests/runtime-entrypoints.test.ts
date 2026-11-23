import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { core } from '@h-ai/core'
import ts from 'typescript'
import { expect, it } from 'vitest'
import { buildTemplateContext, generateFromTemplates } from '../src/commands/cli-template-engine.js'
import { runPnpmTestCommand } from './helpers/deploy-test-command.js'

it.each(['admin', 'api', 'fullstack'] as const)('%s 生成工程的公开 start:test 脚本读取模式公共文件', async (appType) => {
  const directory = await mkdtemp(path.join(process.cwd(), '.tmp-runtime-entrypoints-'))
  try {
    await generateFromTemplates(directory, buildTemplateContext({
      name: 'runtime-entrypoints',
      appType,
      features: [],
      frontends: ['web'],
      packageManager: 'pnpm',
    }))
    const service = appType === 'admin'
      ? directory
      : path.join(directory, appType === 'api'
          ? 'apps'
          : 'packages', 'runtime-entrypoints-serv')
    const environmentDirectory = appType === 'api'
      ? service
      : directory
    const outputDirectory = path.join(service, appType === 'admin'
      ? 'build'
      : 'dist')
    await mkdir(outputDirectory, { recursive: true })
    await mkdir(path.join(service, 'node_modules/@h-ai'), { recursive: true })
    const require = createRequire(import.meta.url)
    const coreDirectory = path.dirname(path.dirname(require.resolve('@h-ai/core')))
    await symlink(coreDirectory, path.join(service, 'node_modules/@h-ai/core'), 'junction')
    // 本例只验证公开启动脚本的环境边界，完整应用的HTTP行为由脚手架门禁验证。
    await writeFile(path.join(outputDirectory, 'index.js'), 'process.stdout.write("startup-sentinel:" + process.env.HAI_STARTUP_SENTINEL)\n')
    await writeFile(path.join(environmentDirectory, '.env'), 'HAI_STARTUP_SENTINEL=base\n')
    await writeFile(path.join(environmentDirectory, '.env.test'), 'HAI_STARTUP_SENTINEL=mode-public\n')
    const output = await runPnpmTestCommand(['start:test'], {
      cwd: service,
      env: { HAI_STARTUP_SENTINEL: undefined },
      timeoutMs: 15_000,
    })
    expect(output).toContain('startup-sentinel:mode-public')
    await writeFile(path.join(environmentDirectory, '.env.test'), 'HAI_STARTUP_SENTINEL=first\nHAI_STARTUP_SENTINEL=duplicate\n')
    await expect(runPnpmTestCommand(['start:test'], {
      cwd: service,
      env: { HAI_STARTUP_SENTINEL: undefined },
      timeoutMs: 15_000,
    })).rejects.toMatchObject({ reason: 'exit', localTermination: 'confirmed', exitCode: 1 })
  }
  finally { await rm(directory, { recursive: true, force: true }) }
}, 45_000)

it.each(['admin', 'mobile-app', 'fullstack'] as const)('%s 的 E2E Vite 入口仍读取公共环境文件并拒绝文件错误', async (appType) => {
  const directory = await mkdtemp(path.join(process.cwd(), '.tmp-runtime-entrypoints-'))
  try {
    await generateFromTemplates(directory, buildTemplateContext({
      name: 'runtime-entrypoints',
      appType,
      features: [],
      frontends: ['web', 'app', 'desktop'],
      packageManager: 'pnpm',
    }))
    const targets = appType === 'fullstack'
      ? ['web', 'app', 'desktop'].map(target => `apps/runtime-entrypoints-${target}/vite.config.ts`)
      : ['vite.config.ts']
    await writeFile(path.join(directory, '.env'), 'HAI_STARTUP_SENTINEL=from-public-file\n')
    for (const target of targets) {
      const source = await readFile(path.join(directory, target), 'utf8')
      const environment: Record<string, string> = { HAI_E2E: '1' }
      evaluateVite(source, path.join(directory, target), directory, environment)
      expect(environment.HAI_STARTUP_SENTINEL).toBe('from-public-file')
      await writeFile(path.join(directory, '.env.dev'), 'HAI_STARTUP_SENTINEL=first\nHAI_STARTUP_SENTINEL=duplicate\n')
      expect(() => evaluateVite(source, path.join(directory, target), directory, { HAI_E2E: '1' })).toThrow()
      await rm(path.join(directory, '.env.dev'))
    }
  }
  finally { await rm(directory, { recursive: true, force: true }) }
}, 30_000)

/** 执行生成的 Vite 配置；环境文件走真实 Core，插件不启动浏览器或改写产物。 */
function evaluateVite(source: string, configPath: string, directory: string, environment: Record<string, string>): void {
  const sandbox = {
    config: undefined,
    process: {
      env: environment,
      cwd: () => directory,
    },
    URL,
    path,
    fileURLToPath,
    core: {
      init: () => {},
      config: {
        loadEnvFiles: core.config.loadEnvFiles,
        getOrThrow: () => ({
          name: 'Runtime',
          version: '1',
          env: 'dev',
          defaultLocale: 'zh-CN',
        }),
      },
    },
    defineConfig: (input: (options: { mode: string, command: string }) => unknown) => input({ mode: 'dev', command: 'serve' }),
    resolveBuildMetadata: () => ({ appVersion: '1', buildId: 'test', commit: 'unknown' }),
    resolvePublicBasePath: () => '',
    sveltekit: () => ({}),
    ui: {
      autoImport: () => ({}),
    },
    vitePreprocess: () => ({}),
    adapter: () => ({}),
    svelte: () => ({}),
    paraglideVitePlugin: () => ({}),
    tailwindcss: () => ({}),
    publicRuntimeConfig: () => ({}),
    haiOptimizeExclude: [],
    haiPrebundledDeps: [],
  }
  const executable = source.replace(/^import[^\n]*\n/gm, '').replace('export default', 'config =').replaceAll('import.meta.url', JSON.stringify(pathToFileURL(configPath).href))
  runInNewContext(ts.transpileModule(executable, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText, sandbox)
}
