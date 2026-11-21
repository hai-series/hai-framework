import type { FeatureId } from '../../src/cli-types.js'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import Handlebars from 'handlebars'
import { buildTemplateContext } from '../../src/commands/cli-template-engine.js'

/** 将仓库私有的功能用例安装到本轮临时工程；原生模板入口已在此之前独立通过。 */
export async function installScenarios(projectPath: string, scenario: { title: string, projectName: string }): Promise<void> {
  const api = scenario.title.startsWith('api')
  const fullstack = scenario.title.startsWith('fullstack')
  const service = fullstack
    ? `packages/${scenario.projectName}-serv`
    : api
      ? `apps/${scenario.projectName}-serv`
      : '.'
  const manifest = JSON.parse(await readFile(path.join(projectPath, service, 'package.json'), 'utf8'))
  const available: FeatureId[] = [
    'iam',
    'db',
    'cache',
    'crypto',
    'reach',
    'storage',
    'audit',
    'feedback',
    'payment',
    'ai',
    'vecdb',
    'api-client',
    'capacitor',
  ]
  const features = available.filter(feature => manifest.dependencies?.[`@h-ai/${feature === 'db'
    ? 'reldb'
    : feature}`])
  const appType = fullstack
    ? 'fullstack'
    : api
      ? 'api'
      : scenario.title === 'mobile-app'
        ? 'mobile-app'
        : scenario.title === 'admin'
          ? 'admin'
          : scenario.title === 'h5'
            ? 'h5'
            : 'website'
  const context = buildTemplateContext({
    name: scenario.projectName,
    appType,
    features,
    ...(fullstack
      ? {
          frontends: scenario.title === 'fullstack'
            ? ['web', 'app', 'miniapp', 'desktop'] as const
            : ['web'] as const,
        }
      : {}),
    packageManager: 'pnpm',
  })
  const fixtures = path.resolve('tests/fixtures/scenarios')
  const files: Record<string, string> = {
    [fullstack
      ? 'fullstack-playwright.config.ts.hbs'
      : api ? 'api-playwright.config.ts.hbs' : 'base-playwright.config.ts.hbs']: 'playwright.scenarios.config.ts',
    [fullstack
      ? 'fullstack.spec.ts.hbs'
      : api ? 'api-serv.spec.ts.hbs' : 'base-app.spec.ts.hbs']: fullstack
      ? 'e2e/fullstack.spec.ts'
      : api ? 'e2e/api-serv.spec.ts' : 'e2e/app.spec.ts',
    ...(fullstack
      ? { 'session-close.spec.ts.hbs': 'e2e/session-close.spec.ts' }
      : {}),
    ...(api
      ? { 'capture-evidence.ts.hbs': 'e2e/capture-evidence.ts' }
      : {}),
    'test-server.ts': 'scripts/test-server.ts',
  }
  for (const [source, destination] of Object.entries(files)) {
    const text = await readFile(path.join(fixtures, source), 'utf8')
    await writeFile(path.join(projectPath, destination), source.endsWith('.hbs')
      ? Handlebars.compile(text, { noEscape: true })(context)
      : text)
  }
  for (const name of [
    'run-e2e.mjs',
    'startup-process.mjs',
    'startup-windows-job.ts',
  ])
    await writeFile(path.join(projectPath, 'scripts', name), await readFile(path.resolve('tests/helpers', name)))
}
