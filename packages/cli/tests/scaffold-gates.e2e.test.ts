/**
 * 真实样板门禁 E2E。
 *
 * 默认跳过，避免常规单测安装依赖与启动浏览器过慢。
 * 显式运行：pnpm --filter @h-ai/cli test:scaffold-gates
 */

import { execFileSync } from 'node:child_process'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

const runScaffoldGates = process.env.HAI_CLI_RUN_SCAFFOLD_GATES === '1'
const cliBin = path.resolve(process.cwd(), 'dist/index.js')
const pnpmBin = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const tempRoots: string[] = []

afterAll(async () => {
  await Promise.all(tempRoots.map(root => rm(root, { recursive: true, force: true })))
}, 180_000)

describe.skipIf(!runScaffoldGates)('generated scaffold quality gates', () => {
  it('api scaffold passes install, typecheck, lint, unit and browser e2e', async () => {
    const root = await createTempRoot()
    const projectPath = path.join(root, 'sample-api')

    runNode([
      cliBin,
      '--cwd',
      root,
      'create',
      'sample-api',
      '--type',
      'api',
      '--template',
      'minimal',
      '--yes',
      '--no-install',
      '--no-git',
      '--package-manager',
      'pnpm',
      '--no-examples',
    ])
    runQualityGates(projectPath)

    expect(await fileExists(path.join(projectPath, 'e2e/app.spec.ts'))).toBe(true)
  }, 1_800_000)

  it('fullstack scaffold passes install, typecheck, lint, unit and page-level e2e', async () => {
    const root = await createTempRoot()
    const projectPath = path.join(root, 'sample-fullstack')

    runNode([
      cliBin,
      '--cwd',
      root,
      'create',
      'sample-fullstack',
      '--type',
      'fullstack',
      '--frontends',
      'web,app,miniapp,desktop',
      '--yes',
      '--no-install',
      '--no-git',
      '--package-manager',
      'pnpm',
    ])
    runQualityGates(projectPath)

    expect(await fileExists(path.join(projectPath, 'e2e/fullstack.spec.ts'))).toBe(true)
  }, 1_800_000)
})

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'hai-cli-scaffold-gates-'))
  tempRoots.push(root)
  return root
}

function runQualityGates(projectPath: string): void {
  runPnpm(projectPath, ['install'])
  runPnpm(projectPath, ['typecheck'])
  runPnpm(projectPath, ['lint'])
  runPnpm(projectPath, ['test'])
  runPnpm(projectPath, ['test:e2e'])
}

function runNode(args: string[]): void {
  execFileSync(process.execPath, args, {
    cwd: process.cwd(),
    env: buildChildEnv(),
    stdio: 'inherit',
  })
}

function runPnpm(cwd: string, args: string[]): void {
  execFileSync(pnpmBin, args, {
    cwd,
    env: buildChildEnv(),
    shell: true,
    stdio: 'inherit',
  })
}

function buildChildEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    BASE_URL: 'http://localhost:4173',
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
