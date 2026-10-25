import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, expect, it, vi } from 'vitest'
import { inspectFrameworkUpgrade } from '../src/commands/cli-upgrade.js'

let root: string | undefined
afterEach(async () => {
  vi.unstubAllGlobals()
  if (root)
    await rm(root, { recursive: true, force: true })
  root = undefined
})

/** 测试生成真实 tar.gz，检查发布内容和完整性，不绕过归档解析。 */
function archive(version: string, cli: boolean) {
  const entries: Record<string, string> = { 'package/package.json': JSON.stringify({ version }), 'package/dist/index.js': 'export {}' }
  if (cli)
    entries['package/templates/skills/hai-feedback/SKILL.md'] = '---\nname: hai-feedback\n---\nRelease skill\n'
  const chunks: Uint8Array[] = []
  for (const [name, text] of Object.entries(entries)) {
    const bytes = new TextEncoder().encode(text)
    const header = new Uint8Array(512)
    header.set(new TextEncoder().encode(name))
    header.set(new TextEncoder().encode(bytes.length.toString(8).padStart(11, '0')), 124)
    header[156] = 48
    chunks.push(header, bytes, new Uint8Array((512 - bytes.length % 512) % 512))
  }
  chunks.push(new Uint8Array(1024))
  const size = chunks.reduce((sum, item) => sum + item.length, 0)
  const all = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    all.set(chunk, offset)
    offset += chunk.length
  }
  return gzipSync(all)
}

it('发布缺 Scheduler 不修改工程，齐备后同时报告 catalog/lock/安装和定制 skill 漂移', async () => {
  root = await mkdtemp(join(tmpdir(), 'hai-upgrade-'))
  const version = '0.1.0-alpha.71'
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'consumer', dependencies: { '@h-ai/core': 'catalog:', '@h-ai/scheduler': 'catalog:' } }))
  await writeFile(join(root, 'pnpm-workspace.yaml'), 'catalog:\n  \'@h-ai/core\': 0.1.0-alpha.70\n  \'@h-ai/scheduler\': 0.1.0-alpha.70\n')
  await mkdir(join(root, '.agents/skills/hai-feedback'), { recursive: true })
  const skillPath = join(root, '.agents/skills/hai-feedback/SKILL.md')
  await writeFile(join(root, 'pnpm-lock.yaml'), `---\nlockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      '@h-ai/core': {version: 0.1.0-alpha.70}\n---\nimporters:\n  .:\n    dependencies:\n      '@h-ai/core': {version: ${version}}\n      '@h-ai/scheduler': {version: 0.1.0-alpha.70}\n`)
  await writeFile(skillPath, 'Business customization')
  const before = await readFile(join(root, 'package.json'), 'utf8')
  let missing = true
  vi.stubGlobal('fetch', vi.fn(async (input: URL | string) => {
    const url = String(input)
    if (missing && decodeURIComponent(url).includes('@h-ai/scheduler/'))
      return new Response('', { status: 404 })
    if (url.endsWith('.tgz'))
      return new Response(archive(version, url.includes('cli')))
    const name = decodeURIComponent(new URL(url).pathname.split('/')[1]!)
    const bytes = archive(version, name === '@h-ai/cli')
    return Response.json({ version, dist: { tarball: `https://registry.npmjs.org/${name.split('/')[1]}.tgz`, integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}` } })
  }))
  expect((await inspectFrameworkUpgrade(root, version)).releaseComplete).toBe(false)
  expect(await readFile(join(root, 'package.json'), 'utf8')).toBe(before)
  expect(await readFile(skillPath, 'utf8')).toBe('Business customization')
  missing = false
  const complete = await inspectFrameworkUpgrade(root, version)
  expect(complete.releaseComplete).toBe(true)
  expect(complete.modified).toBe(false)
  expect(complete.drift.find(item => item.package === '@h-ai/core')?.issues).not.toContain('lock-version-drift')
  expect(complete.drift).toEqual(expect.arrayContaining([expect.objectContaining({ package: '@h-ai/scheduler', issues: expect.arrayContaining(['declared-version-drift', 'lock-version-drift']) })]))
  expect(complete.skills).toContainEqual({ name: 'hai-feedback', state: 'customized-or-older' })
})
