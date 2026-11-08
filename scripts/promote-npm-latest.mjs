/** 仅调整 npm 标签；包名来自不可变发布 tag，不重新构建或发布版本。 */
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { missingPackages, readLatest } from './release-status.mjs'

const releaseVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Z]+(?:[.-][0-9A-Z]+)*)?$/i

/** 自动发布只推进已验证祖先之后的来源，未知/分叉默认版本保守保留，不依赖历史命名的 SemVer 顺序。 */
function canAdvanceDefaults(root, version, defaults) {
  const git = (...args) => execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
    windowsHide: true,
  }).trim()
  try {
    const target = git('rev-parse', '--verify', `refs/tags/v${version}^{commit}`)
    for (const current of new Set(defaults)) {
      if (current === undefined || current === version)
        continue
      if (typeof current !== 'string' || !releaseVersion.test(current))
        return false
      const previous = git('rev-parse', '--verify', `refs/tags/v${current}^{commit}`)
      git('merge-base', '--is-ancestor', previous, target)
    }
    return true
  }
  catch {
    return false
  }
}

export function releasePackages(root, version) {
  if (!releaseVersion.test(version))
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

export async function promoteLatest(packages, options = {}) {
  if (packages.length === 0 || packages.some(pkg => !/^@h-ai\/[a-z0-9-]+$/.test(pkg.name) || pkg.version !== packages[0].version))
    throw new Error('Expected public framework packages from one release')
  const fetcher = options.fetcher ?? fetch
  // 所有目标版本与当前标签均可查询后才开始写入，避免已知缺包时部分推进。
  const deadline = Date.now() + 30 * 60_000
  let missing = await missingPackages(packages, fetcher)
  // npm 安装前扫描可能超过十五分钟；只等待明确 404，其他服务/认证/网络错误仍立即失败。
  for (let attempt = 1; missing.length && Date.now() < deadline; attempt++) {
    process.stdout.write(`Waiting for npm version metadata (attempt ${attempt}, up to 30 minutes)\n`)
    await new Promise(resolve => setTimeout(resolve, Math.min(10_000, deadline - Date.now())))
    missing = await missingPackages(packages, fetcher)
  }
  if (missing.length)
    throw new Error(`Release is incomplete: ${missing.map(pkg => pkg.name).join(', ')}`)
  const before = await readLatest(packages, fetcher)
  if (options.automatic && !canAdvanceDefaults(options.automatic.root, packages[0].version, [
    ...before.values(),
    ...options.automatic.additionalDefaults,
  ])) {
    return 0
  }
  const addTag = options.addTag ?? ((pkg) => {
    execFileSync('npm', [
      'dist-tag',
      'add',
      `${pkg.name}@${pkg.version}`,
      'latest',
      '--registry=https://registry.npmjs.org',
    ], { stdio: 'inherit', timeout: 60000 })
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
  const version = process.argv[2] ?? ''
  const flags = process.argv.slice(3)
  if (flags.length !== 1 || !['--automatic', '--check-automatic', '--allow-downgrade'].includes(flags[0]))
    throw new Error('Choose --automatic, --check-automatic or explicit --allow-downgrade')
  const packages = releasePackages(root, version)
  let automatic
  if (flags[0] !== '--allow-downgrade') {
    const repository = process.env.GITHUB_REPOSITORY
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? ''))
      throw new Error('GITHUB_REPOSITORY is required for automatic default promotion')
    // 另一个 CI 可能在本 job checkout 后完成发布；读取当前远端 tag，不能使用旧 checkout 的 tag 集合。
    execFileSync('git', ['fetch', '--tags', 'origin'], {
      cwd: root,
      stdio: 'pipe',
      windowsHide: true,
      timeout: 60000,
    })
    const response = await fetch(`${process.env.GITHUB_API_URL ?? 'https://api.github.com'}/repos/${repository}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(process.env.GITHUB_TOKEN
          ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
          : {}),
      },
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok && response.status !== 404)
      throw new Error(`Unable to verify GitHub Latest: HTTP ${response.status}`)
    const latest = response.status === 404
      ? undefined
      : (await response.json()).tag_name
    automatic = {
      root,
      additionalDefaults: latest === undefined
        ? []
        : [
            typeof latest === 'string' && latest.startsWith('v')
              ? latest.slice(1)
              : 'unverified-release-source',
          ],
    }
    if (flags[0] === '--check-automatic') {
      if (!process.env.GITHUB_OUTPUT)
        throw new Error('GITHUB_OUTPUT is required for the automatic promotion decision')
      const defaults = await readLatest(packages)
      const promote = canAdvanceDefaults(root, version, [
        ...defaults.values(),
        ...automatic.additionalDefaults,
      ])
      appendFileSync(process.env.GITHUB_OUTPUT, `promote=${promote}\n`)
      process.stdout.write(promote ? 'Verified default release source ordering.\n' : 'Preserving default tags: current defaults are not verified ancestors of this release.\n')
      return
    }
  }
  const count = await promoteLatest(packages, automatic
    ? { automatic }
    : {})
  if (count === 0) {
    process.stdout.write('Preserved newer or unverified default release tags.\n')
    return
  }
  process.stdout.write(`Verified npm latest for ${count} packages at ${version}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error
      ? error.message
      : String(error)}\n`)
    process.exitCode = 1
  })
}
