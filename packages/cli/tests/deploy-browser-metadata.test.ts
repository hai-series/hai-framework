/** 隔离执行真实部署浏览器辅助函数，验证不同模板的旁证来源和浏览器入口。 */
import type { DeployTestCommands } from './helpers/deploy-test-command.js'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { expect, it, vi } from 'vitest'

interface MetadataEntry { service: string, source: string, destination: string }
type Verify = (commands: Pick<DeployTestCommands, 'run'>, metadata: { name: string, version: string, env: string }, project: string, entries?: readonly MetadataEntry[]) => Promise<void>

const file = new URL('./deploy-docker-ssh.e2e.test.ts', import.meta.url)
const source = ts.createSourceFile(file.pathname, readFileSync(file, 'utf8'), ts.ScriptTarget.ES2022, true)
const declaration = source.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === 'verifyDeployedBrowser')
if (!declaration)
  throw new Error('The real deployment browser helper is missing')
const compiled = ts.transpileModule(`${declaration.getText(source).replaceAll('import.meta.url', JSON.stringify(file.href))}\nexports.verify = verifyDeployedBrowser`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText

async function withHelper(name: string, body: (fixture: { verify: Verify, project: string, evidence: string, browser: ReturnType<typeof vi.fn> }) => Promise<void>) {
  const directory = await mkdtemp(path.join(tmpdir(), 'hai-deploy-metadata-'))
  if (path.dirname(directory) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('hai-deploy-metadata-'))
    throw new Error('Unexpected metadata fixture cleanup path')
  try {
    const project = path.join(directory, name)
    const evidence = path.join(directory, 'evidence')
    await mkdir(project)
    await writeFile(path.join(project, '.env.test'), '')
    const exports: { verify?: Verify } = {}
    const browser = vi.fn(async () => 'Browser checks completed')
    runInNewContext(compiled, {
      exports,
      path,
      mkdirSync,
      mkdtempSync,
      readFileSync,
      rmSync,
      writeFileSync,
      parseEnv,
      expect,
      URL,
      fileURLToPath,
      process: { env: { HAI_AUTH_EVIDENCE_DIR: evidence } },
      RUN_ID: 'metadata-unit',
      runtime: 'podman',
      workDir: directory,
      fixture: () => ({ containerId: 'owned-fixture', webHostPort: 19000 }),
      runPnpm: browser,
    })
    if (!exports.verify)
      throw new Error('The deployment browser helper did not load')
    await body({ verify: exports.verify, project, evidence, browser })
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
}

it.each(['delivery-admin', 'delivery-mobile-app'])('%s 保留浏览器验收，不请求不存在的 Fullstack 容器或目录', name => withHelper(name, async ({ verify, project, browser }) => {
  const commands = { run: vi.fn<DeployTestCommands['run']>(async () => {
    throw new Error('This template has no Fullstack metadata files')
  }) }
  await verify(commands, { name, version: '1.2.3', env: 'test' }, project)
  expect(commands.run).not.toHaveBeenCalled()
  expect(browser).toHaveBeenCalledOnce()
  expect(browser.mock.calls[0]?.[0]).toBe(commands)
}))

it('fullstack 从各自已部署容器读取真实旁证，再交给原浏览器断言', () => withHelper('e2e-fullstack', async ({ verify, project, browser }) => {
  const identity = { appVersion: '3.4.5', buildId: 'image-build', commit: 'a'.repeat(40) }
  const commands = { run: vi.fn<DeployTestCommands['run']>(async () => JSON.stringify(identity)) }
  const entries = [
    { service: 'web', source: '/usr/share/nginx/html/build-metadata.json', destination: 'apps/e2e-fullstack-web/dist/build-metadata.json' },
    { service: 'serv', source: '/app/dist/build-metadata.json', destination: 'packages/e2e-fullstack-serv/dist/build-metadata.json' },
  ]
  await verify(commands, { name: 'runtime-name', version: '9.9.9', env: 'test' }, project, entries)
  expect(commands.run).toHaveBeenCalledTimes(2)
  for (const [index, entry] of entries.entries()) {
    expect(commands.run.mock.calls[index]).toEqual(['podman', ['exec', 'owned-fixture', 'podman', 'exec', `hai-e2e-fullstack-test-${entry.service}`, 'cat', entry.source]])
    expect(JSON.parse(await readFile(path.join(project, entry.destination), 'utf8'))).toEqual(identity)
  }
  expect(browser).toHaveBeenCalledOnce()
}))

it('指定的镜像旁证缺失时阻断浏览器验收，不用运行配置冒充产物', () => withHelper('e2e-fullstack', async ({ verify, project, browser }) => {
  const commands = { run: vi.fn<DeployTestCommands['run']>(async () => {
    throw new Error('Metadata file missing')
  }) }
  await expect(verify(commands, { name: 'runtime-name', version: '9.9.9', env: 'test' }, project, [{ service: 'web', source: '/usr/share/nginx/html/build-metadata.json', destination: 'apps/e2e-fullstack-web/dist/build-metadata.json' }])).rejects.toThrow('Metadata file missing')
  expect(browser).not.toHaveBeenCalled()
}))
