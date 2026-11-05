/** 构建批次与原生归档名称；内部身份保持简短，目录补齐工程和目标。 */
import { randomBytes } from 'node:crypto'
import { basename, extname } from 'node:path'
import { core } from '@h-ai/core'

/**
 * 使用与部署一致的构建机本地时间，随机后缀允许同一秒重复构建。
 * @example 模块内部上下文
 * ```ts
 * const buildId = createBuildId('0.1.0')
 * ```
 */
export function createBuildId(version: string): string {
  return `${core.time.formatDate(new Date(), 'YYYYMMDD-HHmmss')}-${randomBytes(3).toString('hex')}-${version}`
}

/**
 * latest 指向这个相对目录名；清单中的 buildId 不包含工程和目标前缀。
 * @example 模块内部上下文
 * ```ts
 * const directory = buildBatchName('todo', 'image', '20261105-171924-62e4f1-0.1.0')
 * ```
 */
export function buildBatchName(project: string, target: string, buildId: string): string {
  return `build-${project}-${target}-${buildId}`
}

/**
 * Android 保留 ABI/flavor 等输出差异；其他平台保留原生包格式。
 * @example 模块内部上下文
 * ```ts
 * const apk = nativePackageFile('todo', 'android', true, '0.1.0', 'debug/app-debug.apk')
 * ```
 */
export function nativePackageFile(project: string, platform: string, debug: boolean, version: string, file: string, arch?: string): string {
  const extension = extname(file)
  const variant = debug ? 'debug' : 'release'
  const qualifier = platform === 'android'
    ? basename(file, extension).replace(/^app(?:-|$)/, '').replace(/(?:^|-)(?:debug|release)(?:-unsigned)?$/, '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '')
    : ''
  const target = [platform, arch, qualifier, variant].filter(Boolean).join('-')
  const installer = platform === 'windows' && extension.toLowerCase() === '.exe' ? '-setup' : ''
  return `${project}-${target}-${version}${installer}${extension}`
}
