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

interface ScaffoldGateCase {
  title: string
  projectName: string
  createArgs: string[]
  expectedFiles: string[]
}

const scaffoldGateCases: readonly ScaffoldGateCase[] = [
  {
    title: 'api',
    projectName: 'sample-api',
    createArgs: ['--type', 'api', '--template', 'minimal', '--yes', '--no-install', '--no-git', '--package-manager', 'pnpm', '--no-examples'],
    expectedFiles: ['e2e/app.spec.ts'],
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

      runNode([
        cliBin,
        '--cwd',
        root,
        'create',
        scenario.projectName,
        ...scenario.createArgs,
      ])
      runQualityGates(projectPath)

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

function runQualityGates(projectPath: string): void {
  runPnpm(projectPath, ['install'])
  runPnpm(projectPath, ['typecheck'])
  runPnpm(projectPath, ['lint'])
  runPnpm(projectPath, ['build'])
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
