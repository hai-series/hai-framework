/**
 * 真实样板门禁 E2E。
 *
 * 默认跳过，避免常规单测安装依赖与启动浏览器过慢。
 * 显式运行：pnpm --filter @h-ai/cli test:scaffold-gates
 */

import { execFileSync } from 'node:child_process'
import { access, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { parse, stringify } from 'yaml'

const runScaffoldGates = process.env.HAI_CLI_RUN_SCAFFOLD_GATES === '1'
const cliBin = path.resolve(process.cwd(), 'dist/index.js')
const pnpmBin = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const tempRoots: string[] = []
const localPackageSpecifiers = parseLocalPackageSpecifiers(process.env.HAI_CLI_PACKAGE_SPECIFIERS)

interface ScaffoldGateCase {
  title: string
  projectName: string
  createArgs: string[]
  expectedFiles: string[]
}

interface GateEnvOptions {
  baseUrl?: string
  serviceBaseUrl?: string
}

const scaffoldGateCases: readonly ScaffoldGateCase[] = [
  {
    title: 'api',
    projectName: 'sample-api',
    createArgs: ['--type', 'api', '--template', 'minimal', '--yes', '--no-install', '--no-git', '--package-manager', 'pnpm', '--no-examples'],
    expectedFiles: ['e2e/api-service.spec.ts', 'apps/sample-api-service/package.json'],
  },
  {
    title: 'admin',
    projectName: 'sample-admin',
    createArgs: ['--type', 'admin', '--template', 'custom', '--features', 'iam,db,cache,crypto', '--yes', '--no-install', '--no-git', '--package-manager', 'pnpm', '--no-examples'],
    expectedFiles: ['e2e/app.spec.ts', 'src/routes/api/auth/login/+server.ts'],
  },
  {
    title: 'website',
    projectName: 'sample-website',
    createArgs: ['--type', 'website', '--template', 'minimal', '--yes', '--no-install', '--no-git', '--package-manager', 'pnpm', '--no-examples'],
    expectedFiles: ['e2e/app.spec.ts'],
  },
  {
    title: 'h5',
    projectName: 'sample-h5',
    createArgs: ['--type', 'h5', '--template', 'minimal', '--yes', '--no-install', '--no-git', '--package-manager', 'pnpm', '--no-examples'],
    expectedFiles: ['e2e/app.spec.ts'],
  },
  {
    title: 'mobile-app',
    projectName: 'sample-mobile',
    createArgs: ['--type', 'mobile-app', '--template', 'custom', '--features', 'api-client,capacitor', '--yes', '--no-install', '--no-git', '--package-manager', 'pnpm', '--no-examples'],
    expectedFiles: ['e2e/app.spec.ts', 'src/App.svelte'],
  },
  {
    title: 'fullstack',
    projectName: 'sample-fullstack',
    createArgs: ['--type', 'fullstack', '--frontends', 'web,app,miniapp,desktop', '--yes', '--no-install', '--no-git', '--package-manager', 'pnpm'],
    expectedFiles: ['e2e/fullstack.spec.ts', 'packages/sample-fullstack-serv/package.json'],
  },
] as const

afterAll(async () => {
  await Promise.all(tempRoots.map(root => rm(root, { recursive: true, force: true })))
}, 180_000)

describe.skipIf(!runScaffoldGates)('generated scaffold quality gates', () => {
  for (const scenario of scaffoldGateCases) {
    it(`${scenario.title} scaffold passes install, typecheck, lint, build, unit and e2e`, async () => {
      const root = await createTempRoot()
      const projectPath = path.join(root, scenario.projectName)
      const baseUrl = await allocateBaseUrl()
      const envOptions: GateEnvOptions = { baseUrl }

      if (scenario.title === 'fullstack') {
        envOptions.serviceBaseUrl = await allocateBaseUrl()
      }

      runNode([
        cliBin,
        '--cwd',
        root,
        'create',
        scenario.projectName,
        ...scenario.createArgs,
      ])
      await replaceHaiPackageSpecifiers(projectPath)
      await removeReplacedHaiCatalogEntries(projectPath)
      runQualityGates(projectPath, envOptions)

      for (const relativePath of scenario.expectedFiles) {
        expect(await fileExists(path.join(projectPath, relativePath))).toBe(true)
      }
    }, 1_800_000)
  }
})

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'hai-cli-scaffold-gates-'))
  tempRoots.push(root)
  return root
}

async function allocateBaseUrl(): Promise<string> {
  const port = await getFreePort()
  return `http://127.0.0.1:${port}`
}

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to resolve free port')))
        return
      }

      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve(address.port)
      })
    })
  })
}

function runQualityGates(projectPath: string, envOptions: GateEnvOptions = {}): void {
  runPnpm(projectPath, ['install'], envOptions)
  runPnpm(projectPath, ['typecheck'], envOptions)
  runPnpm(projectPath, ['lint'], envOptions)
  runPnpm(projectPath, ['build'], envOptions)
  runPnpm(projectPath, ['test'], envOptions)
  runPnpm(projectPath, ['test:e2e'], envOptions)
}

function runNode(args: string[]): void {
  execFileSync(process.execPath, args, {
    cwd: process.cwd(),
    env: buildChildEnv(),
    stdio: 'inherit',
  })
}

function runPnpm(cwd: string, args: string[], envOptions: GateEnvOptions = {}): void {
  execFileSync(pnpmBin, args, {
    cwd,
    env: buildChildEnv(envOptions),
    shell: true,
    stdio: 'inherit',
  })
}

function buildChildEnv(envOptions: GateEnvOptions = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...(envOptions.baseUrl ? { BASE_URL: envOptions.baseUrl } : {}),
    ...(envOptions.serviceBaseUrl
      ? {
          PUBLIC_API_BASE: envOptions.serviceBaseUrl,
          SERVICE_BASE_URL: envOptions.serviceBaseUrl,
        }
      : {}),
    CI: '1',
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  }
  catch {
    return false
  }
}

/**
 * 将生成项目中的 Hai 依赖切换到当前工作区 tarball，确保门禁验证的是本地实现。
 */
async function replaceHaiPackageSpecifiers(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      await replaceHaiPackageSpecifiers(entryPath)
      continue
    }
    if (entry.name !== 'package.json')
      continue

    const manifest = JSON.parse(await readFile(entryPath, 'utf8')) as Record<string, unknown>
    let changed = false
    for (const sectionName of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      const section = manifest[sectionName]
      if (!section || typeof section !== 'object' || Array.isArray(section))
        continue

      const dependencies = section as Record<string, unknown>
      for (const [packageName, specifier] of Object.entries(localPackageSpecifiers)) {
        if (!(packageName in dependencies))
          continue
        dependencies[packageName] = specifier
        changed = true
      }
    }

    if (changed)
      await writeFile(entryPath, `${JSON.stringify(manifest, null, 2)}\n`)
  }
}

/**
 * 本地依赖已改用 file: 后删除测试副本中对应 catalog 项，避免 unused-catalog lint 误报。
 */
async function removeReplacedHaiCatalogEntries(projectPath: string): Promise<void> {
  const workspacePath = path.join(projectPath, 'pnpm-workspace.yaml')
  const workspace: unknown = parse(await readFile(workspacePath, 'utf8'))
  if (!workspace || typeof workspace !== 'object' || Array.isArray(workspace))
    throw new TypeError('Generated pnpm-workspace.yaml must contain an object')

  const catalog = (workspace as Record<string, unknown>).catalog
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog))
    return

  for (const packageName of Object.keys(localPackageSpecifiers))
    delete (catalog as Record<string, unknown>)[packageName]

  await writeFile(workspacePath, stringify(workspace))
}

function parseLocalPackageSpecifiers(raw: string | undefined): Readonly<Record<string, string>> {
  if (!raw)
    return {}

  const parsed: unknown = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new TypeError('HAI_CLI_PACKAGE_SPECIFIERS must be a package-to-specifier object')

  const entries = Object.entries(parsed)
  if (entries.some(([packageName, specifier]) => !packageName.startsWith('@h-ai/') || typeof specifier !== 'string' || specifier.length === 0))
    throw new TypeError('HAI_CLI_PACKAGE_SPECIFIERS contains an invalid package specifier')

  return Object.fromEntries(entries) as Record<string, string>
}
