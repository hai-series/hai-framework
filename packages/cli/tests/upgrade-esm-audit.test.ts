import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, expect, it, vi } from 'vitest'
import { inspectFrameworkUpgrade } from '../src/commands/cli-upgrade.js'

const roots: string[] = []
afterEach(() => {
  vi.unstubAllGlobals()
  for (const root of roots.splice(0)) {
    expect(dirname(resolve(root))).toBe(resolve(tmpdir()))
    expect(root).toContain('hai-review-upgrade-')
    rmSync(root, { recursive: true, force: true })
  }
})

function archive(name: string, version: string, auditDeclaration = 'export declare function migrateAudit(options?: { dryRun?: boolean }): unknown', auditRuntime = 'export function migrateAudit() {}') {
  const entries: Record<string, string> = {
    'package/package.json': JSON.stringify({ name, version }),
    'package/dist/index.js': name === '@h-ai/audit' ? auditRuntime : 'export {}',
    'package/dist/index.d.ts': name === '@h-ai/audit' ? auditDeclaration : 'export {}',
  }
  if (name === '@h-ai/cli')
    entries['package/templates/skills/hai-feedback/SKILL.md'] = '---\nname: hai-feedback\n---\n'
  const chunks: Buffer[] = []
  for (const [path, text] of Object.entries(entries)) {
    const bytes = Buffer.from(text)
    const header = Buffer.alloc(512)
    header.write(path)
    header.write(bytes.length.toString(8).padStart(11, '0'), 124)
    header[156] = 48
    chunks.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512))
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]))
}

function registry(version: string, auditDeclaration?: string, auditRuntime?: string) {
  const fetched = new Set<string>()
  vi.stubGlobal('fetch', vi.fn(async (input: URL | string) => {
    const url = new URL(String(input))
    fetched.add(url.href)
    if (url.pathname.endsWith('.tgz'))
      return new Response(archive(`@h-ai/${url.pathname.slice(1, -4)}`, version, auditDeclaration, auditRuntime))
    const name = decodeURIComponent(url.pathname.split('/')[1]!)
    const bytes = archive(name, version, auditDeclaration, auditRuntime)
    return Response.json({ version, dist: { tarball: `https://registry.npmjs.org/${name.split('/')[1]}.tgz`, integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}` } })
  }))
  return fetched
}

it('eSM-only 安装按消费者解析，发布 Audit 迁移导出纳入预检且始终只读', async () => {
  const version = '0.1.0-alpha.73'
  const root = mkdtempSync(join(tmpdir(), 'hai-review-upgrade-'))
  roots.push(root)
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'review', dependencies: { '@h-ai/audit': version, '@h-ai/ui': version } }))
  for (const name of ['audit', 'ui']) {
    const directory = join(root, 'node_modules/@h-ai', name)
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: `@h-ai/${name}`, version, type: 'module', exports: { '.': { import: './index.js', ...(name === 'audit' ? { default: './index.js' } : {}) } } }))
    writeFileSync(join(directory, 'index.js'), 'throw new Error("Version detection must never execute this module")')
  }
  const fetched = registry(version)
  const before = readFileSync(join(root, 'package.json'), 'utf8')
  const report = await inspectFrameworkUpgrade(root, version)
  expect(report.releaseComplete).toBe(true)
  expect(report.drift.find(item => item.package === '@h-ai/audit')?.installed).toBe(version)
  expect(report.drift.find(item => item.package === '@h-ai/ui')?.installed).toBe(version)
  expect(report.migration.preflight).toContain('migrateAudit({ dryRun: true })')
  expect(fetched.has('https://registry.npmjs.org/audit.tgz')).toBe(true)
  expect(report.modified).toBe(false)
  expect(readFileSync(join(root, 'package.json'), 'utf8')).toBe(before)
})

it.each([
  ['0.1.0-alpha.50', true, 'export {}', false],
  ['0.1.0-alpha.73', true, '/** migrateAudit */ declare function migrateAudit(): void; export {};', false],
  ['0.1.0-alpha.73', true, 'declare const text: "export function migrateAudit"; export { text };', false],
  ['0.1.0-alpha.73', true, 'declare type migrateAudit = string; export { type migrateAudit };', false],
  ['0.1.0-alpha.73', true, 'declare function migration(): void; export { migration as migrateAudit };', true],
  ['0.1.0-alpha.73', false, 'export declare function migrateAudit(): void;', false],
] as const)('仅对实际消费且发布了迁移值导出的 Audit 给出预检：%s/%s/%s', async (version, consumed, declaration, expected) => {
  const root = mkdtempSync(join(tmpdir(), 'hai-review-upgrade-'))
  roots.push(root)
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'review', dependencies: consumed ? { '@h-ai/audit': version } : {} }))
  registry(version, declaration)
  expect((await inspectFrameworkUpgrade(root, version)).migration.preflight.includes('migrateAudit({ dryRun: true })')).toBe(expected)
})

it('递归发现嵌套 workspace 并尊重排除规则，按 pnpm 链接读取 ESM-only 包', async () => {
  const version = '0.1.0-alpha.73'
  const root = mkdtempSync(join(tmpdir(), 'hai-review-upgrade-'))
  roots.push(root)
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'workspace' }))
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - apps/**\n  - "!apps/excluded"\n')
  const consumer = join(root, 'apps/shop/web')
  mkdirSync(join(consumer, 'node_modules/@h-ai'), { recursive: true })
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ name: 'shop-web', dependencies: { '@h-ai/ui': version } }))
  const store = join(root, 'node_modules/.pnpm/ui/node_modules/@h-ai/ui')
  mkdirSync(store, { recursive: true })
  writeFileSync(join(store, 'package.json'), JSON.stringify({ name: '@h-ai/ui', version, type: 'module', exports: { '.': { import: './index.js' } } }))
  writeFileSync(join(store, 'index.js'), 'throw new Error("Do not execute")')
  symlinkSync(store, join(consumer, 'node_modules/@h-ai/ui'), 'junction')
  mkdirSync(join(root, 'apps/excluded'), { recursive: true })
  writeFileSync(join(root, 'apps/excluded/package.json'), JSON.stringify({ name: 'excluded', dependencies: { '@h-ai/audit': version } }))
  registry(version)
  const report = await inspectFrameworkUpgrade(root, version)
  expect(report.drift).toContainEqual(expect.objectContaining({ package: '@h-ai/ui', source: 'apps/shop/web/package.json', installed: version }))
  expect(report.drift.some(item => item.package === '@h-ai/audit')).toBe(false)
})

it('声明有名称但实际运行时未导出的迁移函数不列入预检', async () => {
  const version = '0.1.0-alpha.73'
  const root = mkdtempSync(join(tmpdir(), 'hai-review-upgrade-'))
  roots.push(root)
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'review', dependencies: { '@h-ai/audit': version } }))
  registry(version, undefined, 'function migrateAudit() {}; export {};')
  expect((await inspectFrameworkUpgrade(root, version)).migration.preflight).not.toContain('migrateAudit({ dryRun: true })')
})
