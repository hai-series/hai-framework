/** 仅调整 npm 标签；包名来自不可变发布 tag，不重新构建或发布版本。 */
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { missingPackages } from './release-status.mjs'

export function releasePackages(root, version) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Z]+(?:[.-][0-9A-Z]+)*)?$/i.test(version))
    throw new Error('A release version is required')
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  const tag = `v${version}`
  const manifest = JSON.parse(git('show', `${tag}:package.json`))
  if (manifest.version !== version)
    throw new Error('Release tag and root version do not match')
  return git('ls-tree', '-d', '--name-only', `${tag}:packages`).split('\n').map((directory) => {
    const pkg = JSON.parse(git('show', `${tag}:packages/${directory}/package.json`))
    return { name: pkg.name, version, private: pkg.private }
  }).filter(pkg => !pkg.private)
}

async function readLatest(packages, fetcher) {
  const tags = new Map()
  for (const pkg of packages) {
    const path = encodeURIComponent(pkg.name).replace(/^%40/, '@').replaceAll('%2F', '%2f')
    const response = await fetcher(`https://registry.npmjs.org/-/package/${path}/dist-tags`, { cache: 'no-store', signal: AbortSignal.timeout(15000) })
    if (!response.ok)
      throw new Error(`npm tag lookup failed: ${response.status} for ${pkg.name}`)
    tags.set(pkg.name, (await response.json()).latest)
  }
  return tags
}

export async function promoteLatest(packages, options = {}) {
  if (packages.length === 0 || packages.some(pkg => !/^@h-ai\/[a-z0-9-]+$/.test(pkg.name) || pkg.version !== packages[0].version))
    throw new Error('Expected public framework packages from one release')
  const fetcher = options.fetcher ?? fetch
  // 所有目标版本与当前标签均可查询后才开始写入，避免已知缺包时部分推进。
  const missing = await missingPackages(packages, fetcher)
  if (missing.length)
    throw new Error(`Release is incomplete: ${missing.map(pkg => pkg.name).join(', ')}`)
  const before = await readLatest(packages, fetcher)
  const addTag = options.addTag ?? ((pkg) => {
    execFileSync('npm', ['dist-tag', 'add', `${pkg.name}@${pkg.version}`, 'latest', '--registry=https://registry.npmjs.org'], { stdio: 'inherit', timeout: 60000 })
  })
  for (const pkg of packages) {
    if (before.get(pkg.name) !== pkg.version)
      await addTag(pkg)
  }
  const after = await readLatest(packages, fetcher)
  if (packages.some(pkg => after.get(pkg.name) !== pkg.version))
    throw new Error('npm latest verification failed; rerun promotion to repair partial progress')
  return packages.length
}

async function main() {
  const root = resolve(import.meta.dirname, '..')
  const count = await promoteLatest(releasePackages(root, process.env.RELEASE_VERSION ?? ''))
  process.stdout.write(`Verified npm latest for ${count} packages at ${process.env.RELEASE_VERSION}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
