/** 发布状态以实际 npm 版本与 GitHub Release 为准，不能只看 tag。 */
import { execFileSync } from 'node:child_process'
import { appendFileSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

export function publicPackages(root) {
  return readdirSync(join(root, 'packages'), { withFileTypes: true }).filter(entry => entry.isDirectory()).map((entry) => {
    const directory = `packages/${entry.name}`
    const pkg = JSON.parse(readFileSync(join(root, directory, 'package.json'), 'utf8'))
    return { ...pkg, directory }
  }).filter(pkg => !pkg.private)
}

/** 按版本选择发布渠道，预发布不推进正式 latest。 */
export function releaseChannel(version) {
  const coreVersion = version.split('+')[0]
  const prerelease = coreVersion.includes('-')
  const channel = /^\d+\.\d+\.\d+-(alpha|beta|rc)(?:\.|$)/.exec(coreVersion)?.[1]
  return { prerelease, npmTag: prerelease ? channel ?? 'next' : 'latest' }
}

export async function missingPackages(packages, fetcher = fetch) {
  const missing = []
  for (const pkg of packages) {
    // 沿用 npm 的规范 scoped 路径，并重新校验状态，避免发布前的负缓存误判为缺包。
    const packagePath = encodeURIComponent(pkg.name).replace(/^%40/, '@').replaceAll('%2F', '%2f')
    const response = await fetcher(`https://registry.npmjs.org/${packagePath}/${encodeURIComponent(pkg.version)}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) })
    if (response.status === 404) {
      missing.push(pkg)
      continue
    }
    if (!response.ok)
      throw new Error(`npm registry status ${response.status} for ${pkg.name}`)
    const published = await response.json()
    if (published.version !== pkg.version)
      throw new Error(`npm registry returned an unexpected version for ${pkg.name}`)
  }
  return missing
}

export async function releasePending(packages, repository, version, options = {}) {
  const fetcher = options.fetcher ?? fetch
  // 发布阶段才同步磁盘版本；完成判定始终查询本次根版本，不能查询旧包版本。
  const missing = await missingPackages(packages.map(pkg => ({ ...pkg, version })), fetcher)
  const response = await fetcher(`${options.apiUrl ?? 'https://api.github.com'}/repos/${repository}/releases/tags/${encodeURIComponent(`v${version}`)}`, {
    signal: AbortSignal.timeout(15000),
    headers: { Accept: 'application/vnd.github+json', ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) },
  })
  if (response.status === 404)
    return true
  if (!response.ok)
    throw new Error(`GitHub release lookup failed: ${response.status}`)
  const release = await response.json()
  return missing.length > 0 || release.draft === true
}

/** 发布完成后提交版本；重跑时接受远端已存在的相同树，禁止覆盖后续源码。 */
export function commitVersionSync(root, branch = 'main') {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  git('add', '--', ':(glob)packages/*/package.json', ':(glob)apps/*/package.json', 'packages/cli/templates/base/package.json.hbs')
  if (!git('diff', '--cached', '--name-only'))
    return
  git('fetch', 'origin', branch)
  const tree = git('write-tree')
  if (tree === git('rev-parse', 'FETCH_HEAD^{tree}'))
    return
  if (git('rev-parse', 'FETCH_HEAD') !== git('rev-parse', 'HEAD'))
    throw new Error('Branch moved after release; rerun from latest main to sync versions')
  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  git('commit', '-m', `chore: sync version to v${version} [skip ci]`)
  git('push', 'origin', `HEAD:refs/heads/${branch}`)
}

async function main() {
  const root = resolve(import.meta.dirname, '..')
  if (process.argv[2] === 'commit-sync') {
    commitVersionSync(root, process.env.GITHUB_REF_NAME ?? 'main')
    return
  }
  const packages = publicPackages(root)
  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  if (process.argv[2] === 'missing') {
    if (packages.some(pkg => pkg.version !== version))
      throw new Error('Package versions must match the release version before publishing')
    const missing = await missingPackages(packages)
    process.stdout.write(missing.map(pkg => `${pkg.directory}\n`).join(''))
    return
  }
  if (!process.env.GITHUB_REPOSITORY || !process.env.GITHUB_OUTPUT)
    throw new Error('GITHUB_REPOSITORY and GITHUB_OUTPUT are required for release status')
  const pending = await releasePending(packages, process.env.GITHUB_REPOSITORY, version, { token: process.env.GITHUB_TOKEN, apiUrl: process.env.GITHUB_API_URL })
  const channel = releaseChannel(version)
  appendFileSync(process.env.GITHUB_OUTPUT, `changed=${pending}\nversion=${version}\nnpm_tag=${channel.npmTag}\nprerelease=${channel.prerelease}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
