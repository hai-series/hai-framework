import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fse from 'fs-extra'
import { afterAll, expect, it } from 'vitest'

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
