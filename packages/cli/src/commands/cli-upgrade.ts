/** 精确版本升级诊断；只读本地工程和发布制品，不安装、不改文件、不覆盖业务 skill。 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { gunzipSync } from 'node:zlib'
import { parse, parseAllDocuments } from 'yaml'
import { cliM } from '../cli-i18n.js'
import { writeCliMessage } from '../cli-utils.js'

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

/** 有界检查 npm tar 内容，仅读取，不解压到工程。 */
function tarFiles(bytes: Uint8Array): Map<string, Uint8Array> {
  const tar = gunzipSync(bytes, { maxOutputLength: 64 * 1024 * 1024 })
  const files = new Map<string, Uint8Array>()
  for (let offset = 0; offset + 512 <= tar.length;) {
    const name = tar.subarray(offset, offset + 100).toString().replace(/\0.*$/, '')
    if (!name)
      break
    const size = Number.parseInt(tar.subarray(offset + 124, offset + 136).toString().replace(/\0.*$/, '').trim(), 8)
    if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > tar.length)
      throw new Error('Invalid archive')
    if (tar[offset + 156] === 0 || tar[offset + 156] === 48)
      files.set(name, tar.subarray(offset + 512, offset + 512 + size))
    offset += 512 + Math.ceil(size / 512) * 512
  }
  return files
}

/**
 * 指定精确版本检查全部消费包、CLI/deploy 制品和工作区漂移；不完整发布不会修改工程。
 * @example 模块内部上下文
 * ```ts
 * const result = await inspectFrameworkUpgrade('/workspace/shop', '0.1.0-alpha.71')
 * // result.releaseComplete 为真后再安排停机、备份与模块迁移；此函数始终只读。
 * ```
 */
export async function inspectFrameworkUpgrade(directory: string, version: string) {
  if (!/^\d+\.\d+\.\d+(?:-[\da-z.-]+)?(?:\+[\da-z.-]+)?$/i.test(version))
    throw new Error(cliM('cli_upgrade_exact_version'))
  const root = resolve(directory)
  const workspaceFile = join(root, 'pnpm-workspace.yaml')
  const workspace = existsSync(workspaceFile) ? object(parse(readFileSync(workspaceFile, 'utf8'))) : {}
  const rootManifest = object(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')))
  const patterns = Array.isArray(workspace.packages) ? workspace.packages : Array.isArray(rootManifest.workspaces) ? rootManifest.workspaces : []
  const directories = new Set([root])
  for (const pattern of patterns) {
    if (typeof pattern !== 'string' || pattern.startsWith('!') || pattern.includes('..'))
      continue
    if (pattern.endsWith('/*')) {
      const parent = join(root, pattern.slice(0, -2))
      if (existsSync(parent)) {
        for (const entry of readdirSync(parent, { withFileTypes: true })) {
          if (entry.isDirectory() && !entry.isSymbolicLink() && existsSync(join(parent, entry.name, 'package.json')))
            directories.add(join(parent, entry.name))
        }
      }
    }
    else if (existsSync(join(root, pattern, 'package.json'))) {
      directories.add(join(root, pattern))
    }
  }
  const packages = new Set(['@h-ai/cli', '@h-ai/deploy'])
  const drift: Array<{ package: string, source: string, declared: string, installed?: string, issues: string[] }> = []
  const catalog = object(workspace.catalog)
  const lockPath = join(root, 'pnpm-lock.yaml')
  const lock = existsSync(lockPath)
    ? parseAllDocuments(readFileSync(lockPath, 'utf8')).reduce<Record<string, unknown>>((all, document) => {
        if (document.errors.length)
          throw new Error(cliM('cli_upgrade_lock_invalid'))
        const part = object(document.toJS())
        return { ...all, ...part, importers: { ...object(all.importers), ...object(part.importers) } }
      }, {})
    : {}
  for (const location of directories) {
    const manifest = object(JSON.parse(readFileSync(join(location, 'package.json'), 'utf8')))
    const dependencies = { ...object(manifest.dependencies), ...object(manifest.devDependencies), ...object(manifest.optionalDependencies) }
    const importer = object(object(lock.importers)[relative(root, location).replaceAll('\\', '/') || '.'])
    for (const [name, specifier] of Object.entries(dependencies)) {
      if (!/^@h-ai\/[\w-]+$/.test(name) || typeof specifier !== 'string')
        continue
      packages.add(name)
      const declared = specifier.startsWith('catalog:') ? String(object(specifier === 'catalog:' ? catalog : object(workspace.catalogs)[specifier.slice(8)])[name] ?? '') : specifier
      const issues: string[] = []
      if (declared !== version && !declared.startsWith('workspace:'))
        issues.push('declared-version-drift')
      let installed: string | undefined
      try {
        const local = createRequire(join(location, 'package.json'))
        let entry = dirname(local.resolve(name))
        while (dirname(entry) !== entry) {
          const path = join(entry, 'package.json')
          if (existsSync(path)) {
            const candidate = object(JSON.parse(readFileSync(path, 'utf8')))
            if (candidate.name === name) {
              installed = String(candidate.version)
              break
            }
          }
          entry = dirname(entry)
        }
      }
      catch { /* 已安装版本缺失作为诊断输出，不触发安装。 */ }
      if (installed !== version)
        issues.push(installed ? 'installed-version-drift' : 'not-installed')
      const locked = object(object(importer.dependencies)[name] ?? object(importer.devDependencies)[name] ?? object(importer.optionalDependencies)[name])
      if (typeof locked.version !== 'string' || (!locked.version.startsWith('link:') && locked.version.split('(')[0] !== version))
        issues.push('lock-version-drift')
      drift.push({ package: name, source: relative(root, join(location, 'package.json')).replaceAll('\\', '/'), declared, installed, issues })
    }
  }
  const registry = new URL(process.env.npm_config_registry ?? 'https://registry.npmjs.org/')
  if (registry.username || registry.password || registry.protocol !== 'https:')
    throw new Error(cliM('cli_upgrade_registry'))
  const releases: Array<{ package: string, available: boolean, issues: string[] }> = []
  const migrationPreflight: string[] = []
  const skills: Array<{ name: string, state: string }> = []
  const pending = [...packages]
  for (let index = 0; index < pending.length; index++) {
    const name = pending[index]!
    const item = { package: name, available: false, issues: [] as string[] }
    releases.push(item)
    try {
      const response = await fetch(new URL(`${encodeURIComponent(name)}/${encodeURIComponent(version)}`, registry), { signal: AbortSignal.timeout(20000) })
      if (!response.ok)
        throw new Error('Release missing')
      const metadata = object(await response.json())
      const dist = object(metadata.dist)
      if (metadata.version !== version || typeof dist.tarball !== 'string' || typeof dist.integrity !== 'string')
        throw new Error('Invalid metadata')
      for (const dependency of Object.keys(object(metadata.dependencies))) {
        if (/^@h-ai\/[\w-]+$/.test(dependency) && !packages.has(dependency)) {
          packages.add(dependency)
          pending.push(dependency)
        }
      }
      const url = new URL(dist.tarball)
      if (url.protocol !== 'https:' || url.username || url.password)
        throw new Error('Invalid tarball')
      const available = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(20000) })
      if (!available.ok)
        throw new Error('Artifact missing')
      if (['@h-ai/cli', '@h-ai/deploy', '@h-ai/iam', '@h-ai/reach', '@h-ai/scheduler'].includes(name)) {
        const archive = await fetch(url, { signal: AbortSignal.timeout(30000) })
        if (!archive.ok || Number(archive.headers.get('content-length')) > 32 * 1024 * 1024)
          throw new Error('Artifact missing')
        const bytes = new Uint8Array(await archive.arrayBuffer())
        if (bytes.length > 32 * 1024 * 1024)
          throw new Error('Artifact too large')
        const integrity = dist.integrity.split(' ').find(value => value.startsWith('sha512-'))
        if (!integrity || createHash('sha512').update(bytes).digest('base64') !== integrity.slice(7))
          throw new Error('Integrity mismatch')
        const files = tarFiles(bytes)
        const manifest = files.get('package/package.json')
        if (!manifest || object(JSON.parse(new TextDecoder().decode(manifest))).version !== version || !files.has('package/dist/index.js'))
          throw new Error('Incomplete artifact')
        const migration = { '@h-ai/iam': 'migrateIam', '@h-ai/reach': 'migrateReach', '@h-ai/scheduler': 'migrateScheduler' }[name]
        if (migration && new TextDecoder().decode(files.get('package/dist/index.d.ts')).includes(migration))
          migrationPreflight.push(`${migration}({ dryRun: true })`)
        if (name === '@h-ai/cli') {
          if (!files.has('package/templates/skills/hai-feedback/SKILL.md'))
            throw new Error('Skills missing')
          for (const [path, bytes] of files) {
            const match = /^package\/templates\/skills\/([^/]+)\/SKILL.md$/.exec(path)
            if (!match)
              continue
            const local = join(root, '.agents/skills', match[1]!, 'SKILL.md')
            skills.push({ name: match[1]!, state: !existsSync(local) ? 'missing' : createHash('sha256').update(readFileSync(local)).digest('hex') === createHash('sha256').update(bytes).digest('hex') ? 'current' : 'customized-or-older' })
          }
        }
      }
      item.available = true
    }
    catch {
      item.issues.push('release-or-artifact-unavailable')
    }
  }
  let dirtyFiles: string[] = []
  try {
    dirtyFiles = execFileSync('git', ['status', '--porcelain', '--', '.'], { cwd: root, encoding: 'utf8', windowsHide: true, stdio: 'pipe' }).trim().split('\n').filter(Boolean)
  }
  catch { /* 非 Git 工程仍可检查发布齐备性。 */ }
  return { version, releaseComplete: releases.every(item => item.available), modified: false, releases, drift, skills, dirtyFiles, customizations: { overrides: [...new Set([...Object.keys(object(workspace.overrides)), ...Object.keys(object(rootManifest.overrides)), ...Object.keys(object(object(rootManifest.pnpm).overrides))])], patches: [...new Set([...Object.keys(object(workspace.patchedDependencies)), ...Object.keys(object(object(rootManifest.pnpm).patchedDependencies))])] }, migration: { preflight: migrationPreflight, inspectModuleReadmes: true, exclusiveAccess: true, backup: ['database', 'shared-session-cache'], rollback: 'restore-compatible-database-and-binaries', sessions: 'legacy-credential-sessions-require-login' } }
}

/**
 * 只读升级诊断 CLI 入口。
 * @example 模块内部上下文
 * ```ts
 * await upgradeCommand('0.1.0-alpha.71', { cwd: '/workspace/shop' })
 * ```
 */
export async function upgradeCommand(version: string, options: { cwd?: string } = {}): Promise<void> {
  const report = await inspectFrameworkUpgrade(options.cwd ?? process.cwd(), version)
  writeCliMessage(JSON.stringify(report, null, 2))
  if (!report.releaseComplete)
    process.exitCode = 1
}
