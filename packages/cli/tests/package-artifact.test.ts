import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createFeedbackBundle } from '@h-ai/feedback/bundle'
import fse from 'fs-extra'
import { afterAll, expect, it } from 'vitest'
import { stringify } from 'yaml'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const temporaryRoots: string[] = []

afterAll(async () => {
  await Promise.all(temporaryRoots.map(root => fse.remove(root)))
})

it('发布归档包含全部模板，不能丢失隐藏的依赖配置和敏感文件忽略规则', async () => {
  const archiveRoot = await fse.mkdtemp(path.join(tmpdir(), 'hai-cli-package-artifact-'))
  temporaryRoots.push(archiveRoot)
  const packed = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', [
    'pack',
    '--pack-destination',
    archiveRoot,
  ], { cwd: packageRoot, shell: process.platform === 'win32', encoding: 'utf8', windowsHide: true, timeout: 60_000 })
  expect(packed.error).toBeUndefined()
  expect(packed.status, packed.stderr || packed.stdout).toBe(0)
  const archiveName = (await fse.readdir(archiveRoot)).find(name => name.endsWith('.tgz'))
  expect(archiveName).toBeDefined()

  const listed = spawnSync('tar', ['-tf', path.join(archiveRoot, archiveName!)], { encoding: 'utf8', windowsHide: true })
  expect(listed.error).toBeUndefined()
  expect(listed.status, listed.stderr).toBe(0)
  const archivedFiles = new Set(listed.stdout.split(/\r?\n/u))
  const templatesRoot = path.join(packageRoot, 'templates')
  const resources = await fse.readdir(templatesRoot, { recursive: true, withFileTypes: true })
  const missingFiles = resources.filter(resource => resource.isFile()).map((resource) => {
    const relativePath = path.relative(templatesRoot, path.join(resource.parentPath, resource.name)).replaceAll(path.sep, '/')
    return `package/templates/${relativePath}`
  }).filter(resource => !archivedFiles.has(resource))
  expect(missingFiles).toEqual([])
}, 90_000)

it('发布 CLI 内联数据库 Schema，未安装依赖的目标应用也能拒绝非法 TLS 并保存有效配置', async () => {
  const root = await fse.mkdtemp(path.join(tmpdir(), 'hai-cli-schema-artifact-'))
  temporaryRoots.push(root)
  const tool = path.join(root, 'tool')
  const app = path.join(root, 'app')
  await fse.ensureDir(tool)
  await fse.ensureDir(path.join(app, 'config'))
  const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(?:HAI_|PUBLIC_|VITE_)/.test(name)))
  cleanEnv.NODE_PATH = ''
  cleanEnv.NODE_OPTIONS = ''
  const archives: Record<string, string> = {}
  for (const name of ['core', 'deploy', 'cli']) {
    const destination = path.join(root, 'archives', name)
    await fse.ensureDir(destination)
    const packed = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['pack', '--pack-destination', destination], { cwd: path.resolve(packageRoot, '..', name), shell: process.platform === 'win32', encoding: 'utf8', windowsHide: true, timeout: 60_000, env: cleanEnv })
    expect(packed.status, packed.error?.message || packed.stderr || packed.stdout).toBe(0)
    const archive = (await fse.readdir(destination)).find(file => file.endsWith('.tgz'))
    expect(archive).toBeDefined()
    archives[`@h-ai/${name}`] = `file:${path.join(destination, archive!).replaceAll(path.sep, '/')}`
  }
  // 工具安装只含公开归档及其已声明生产依赖；目标应用始终没有 node_modules。
  await fse.writeJson(path.join(tool, 'package.json'), { name: 'published-cli-closure', private: true, type: 'module', dependencies: archives })
  await fse.writeFile(path.join(tool, 'pnpm-workspace.yaml'), `packages: []\noverrides:\n  \"@h-ai/core\": ${JSON.stringify(archives['@h-ai/core'])}\n`)
  // frozen-lockfile 安装不保证缓存中含 semver 元数据；发布安装缺少元数据时应从 registry 获取。
  const installed = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['install', '--prefer-offline', '--ignore-scripts'], { cwd: tool, shell: process.platform === 'win32', encoding: 'utf8', windowsHide: true, timeout: 90_000, env: cleanEnv })
  expect(installed.status, installed.error?.message || installed.stderr || installed.stdout).toBe(0)
  const installedCli = path.join(tool, 'node_modules/@h-ai/cli/dist/index.js')
  const metadata = await fse.readJson(path.join(tool, 'node_modules/@h-ai/cli/dist/metafile-esm.json')) as { inputs: Record<string, { imports: Array<{ path: string, external?: boolean }> }> }
  const inputs = Object.keys(metadata.inputs)
  expect(inputs.some(input => /reldb[\\/]dist[\\/]schemas\.js$/.test(input))).toBe(true)
  expect(inputs.some(input => /[\\/]zod[\\/]/.test(input))).toBe(true)
  expect(inputs.some(input => /feedback[\\/]dist[\\/]/.test(input))).toBe(true)
  expect(inputs.filter(input => /feedback[\\/]src[\\/]/.test(input))).toEqual([])
  expect(inputs.filter(input => /reldb-main|reldb-provider|better-sqlite3|mysql2|[\\/]pg[\\/]/.test(input))).toEqual([])
  expect(Object.values(metadata.inputs).flatMap(input => input.imports).filter(input => input.external && /^(?:@h-ai\/(?:feedback|reldb|storage|reach)(?:\/|$)|fflate$|zod(?:\/|$)|better-sqlite3$|mysql2(?:\/|$)|pg$)/.test(input.path))).toEqual([])
  const cliManifest = await fse.readJson(path.join(packageRoot, 'package.json')) as { dependencies: Record<string, string> }
  expect(cliManifest.dependencies['@h-ai/feedback']).toBeUndefined()
  const guard = path.join(root, 'guard.mjs')
  await fse.writeFile(guard, [
    'import { registerHooks, createRequire } from \'node:module\'',
    'import { realpathSync } from \'node:fs\'',
    'import { fileURLToPath } from \'node:url\'',
    `const root = ${JSON.stringify(root + path.sep)}`,
    `const require = createRequire(${JSON.stringify(path.join(tool, 'package.json'))})`,
    'for (const name of [\'@h-ai/feedback\', \'@h-ai/reach\', \'@h-ai/storage\', \'@h-ai/reldb\', \'fflate\', \'better-sqlite3\', \'mysql2\', \'pg\']) {',
    '  try { require.resolve(name) } catch (error) { if (error.code === \'MODULE_NOT_FOUND\') continue; throw error }',
    '  throw new Error(\'Database dependency must be absent: \' + name)',
    '}',
    'registerHooks({ resolve(specifier, context, next) {',
    '  if (/^(?:@h-ai\\/(?:feedback|reach|storage|reldb)(?:\\/|$)|fflate$|better-sqlite3$|mysql2(?:\\/|$)|pg$)/.test(specifier)) throw new Error(\'Server runtime must not be loaded\')',
    '  const resolved = next(specifier, context)',
    '  if (resolved.url.startsWith(\'file:\') && !realpathSync(fileURLToPath(resolved.url)).startsWith(root)) throw new Error(\'Module escaped isolated published installation\')',
    '  return resolved',
    '} })',
  ].join('\n'))
  const run = (args: string[]) => spawnSync(process.execPath, ['--import', pathToFileURL(guard).href, installedCli, ...args], { cwd: app, encoding: 'utf8', windowsHide: true, timeout: 30_000, env: { ...cleanEnv, HAI_CORE_DEFAULTLOCALE: 'en-US' } })
  const help = run(['--help'])
  expect(help.status, help.error?.message || help.stderr || help.stdout).toBe(0)
  const diagnostic = await createFeedbackBundle({ report: { id: 'artifact-feedback', description: 'Standalone published CLI feedback' }, evidence: [{ source: 'browser', kind: 'log', timestamp: 1, requestId: 'request-artifact', data: { message: 'offline' } }] })
  expect(diagnostic.success).toBe(true)
  if (!diagnostic.success)
    throw new Error(diagnostic.error.message)
  await fse.writeFile(path.join(app, 'feedback.zip'), diagnostic.data)
  const summary = run(['feedback', 'summary', 'feedback.zip'])
  expect(summary.status, summary.error?.message || summary.stderr || summary.stdout).toBe(0)
  expect(summary.stdout).toContain('Standalone published CLI feedback')
  const evidence = run(['feedback', 'evidence', 'feedback.zip', '--request-id', 'request-artifact'])
  expect(evidence.status, evidence.error?.message || evidence.stderr || evidence.stdout).toBe(0)
  expect(JSON.parse(evidence.stdout).total).toBe(1)
  const version = (await fse.readJson(path.join(packageRoot, 'package.json')) as { version: string }).version
  await fse.writeJson(path.join(app, 'package.json'), { name: 'schema-app', version: '1.0.0', type: 'module', dependencies: { '@h-ai/reldb': version } })
  await fse.writeFile(path.join(app, 'pnpm-lock.yaml'), stringify({ lockfileVersion: '9.0', importers: { '.': { dependencies: { '@h-ai/reldb': { version } } } }, packages: { [`@h-ai/reldb@${version}`]: {} }, snapshots: { [`@h-ai/reldb@${version}`]: {} } }))
  await fse.writeFile(path.join(app, 'config/_deploy.yml'), 'provider:\n  type: docker-ssh\n')
  const envFile = path.join(app, '.env.test')
  const args = ['deploy', '--env', 'test', '--yes', '--bundle-only', '--artifact-dir', 'absent-artifact']
  await fse.writeFile(envFile, 'HAI_CORE_ENV=test\n')
  await fse.writeFile(path.join(app, 'config/_db.yml'), 'type: mysql\ndatabase: shop\nhost: db.example.test\nssl: true\n')
  const invalid = run(args)
  expect(invalid.status).not.toBe(0)
  expect(invalid.stderr + invalid.stdout).toContain('The value does not satisfy the field constraints')
  expect(await fse.readFile(envFile, 'utf8')).toBe('HAI_CORE_ENV=test\n')
  await fse.writeFile(path.join(app, 'config/_db.yml'), 'type: mysql\ndatabase: shop\nhost: db.example.test\nssl: {}\n')
  const valid = run(args)
  // 缺少制品有意阻止真正部署；此处验收发布入口已越过 TLS 校验与保存，不执行镜像/SSH。
  expect(valid.status).not.toBe(0)
  expect(valid.stderr + valid.stdout).toMatch(/artifact/i)
  expect(await fse.readFile(envFile, 'utf8')).toContain('HAI_DB=')
  expect(await fse.pathExists(path.join(app, 'node_modules'))).toBe(false)
  expect(await fse.pathExists(path.join(app, '.env.local'))).toBe(false)
}, 150_000)
