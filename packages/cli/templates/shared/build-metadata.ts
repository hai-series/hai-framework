import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import process from 'node:process'

/** 当前编译目标的私有产物身份；同一 SSR 构建重入复用身份，各端版本来自自己的 manifest。 */
export function resolveBuildMetadata(directory: string): { appVersion: string, buildId: string, commit: string } {
  const manifest: { version?: unknown } = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
  const appVersion = typeof manifest.version === 'string' && manifest.version.trim() ? manifest.version.trim() : 'unknown'
  const suppliedId = process.env.HAI_BUILD_ID?.trim()
  const buildId = suppliedId && /^[\w.+-]{1,160}$/.test(suppliedId) ? suppliedId : randomUUID()
  const suppliedCommit = process.env.HAI_BUILD_COMMIT?.trim()
  const commit = suppliedCommit && /^(?:[a-f\d]{40}|[a-f\d]{64}|unknown)$/i.test(suppliedCommit) ? suppliedCommit : sourceCommit(directory)
  // SvelteKit 在同一构建进程内重新求值 Vite 配置；不依赖临时配置模块缓存。
  process.env.HAI_BUILD_ID = buildId
  process.env.HAI_BUILD_COMMIT = commit
  return { appVersion, buildId, commit }
}

/** 未跟踪的生成工程不能把临时目录的父框架提交冒充自身源码。 */
function sourceCommit(directory: string): string {
  try {
    const options = { cwd: directory, encoding: 'utf8' as const, stdio: 'pipe' as const, windowsHide: true }
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], options).trim()
    const manifest = relative(root, join(directory, 'package.json')).replaceAll('\\', '/')
    if (manifest.startsWith('../'))
      return 'unknown'
    execFileSync('git', ['ls-files', '--error-unmatch', '--', manifest], { ...options, cwd: root })
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], options).trim()
    return /^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(commit) ? commit : 'unknown'
  }
  catch {
    return 'unknown'
  }
}
