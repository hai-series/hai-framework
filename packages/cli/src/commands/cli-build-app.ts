/** Capacitor 同步与原生打包分开，只收集本次生成的安装包。 */
import type { NativeArtifact } from './cli-build-native.js'
import { existsSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import process from 'node:process'
import { cliM } from '../cli-i18n.js'
import { isNativeZip, nativeFiles, nativeProjectDirectory } from './cli-build-native.js'

/**
 * 在指定应用目录执行 pnpm 参数。
 * @example 模块内部上下文
 * ```ts
 * const sync = (run: AppCommand, cwd: string) => run(['exec', 'cap', 'sync', 'android'], cwd)
 * ```
 */
export type AppCommand = (args: string[], cwd: string) => Promise<void>

/**
 * 本机 Gradle 入口，使用系统脚本执行器处理 Windows 和 POSIX wrapper。
 * @example 模块内部上下文
 * ```ts
 * const [executable, ...args] = gradleCommand(true)
 * ```
 */
export function gradleCommand(debug: boolean): [string, ...string[]] {
  const task = debug ? 'assembleDebug' : 'assembleRelease'
  return process.platform === 'win32'
    ? ['cmd.exe', '/d', '/c', 'gradlew.bat', task, '--no-daemon']
    : ['bash', './gradlew', task, '--no-daemon']
}

/**
 * Android 用实际 build type 目录，兼容 Gradle flavor 的额外层级。
 * @example 模块内部上下文
 * ```ts
 * const debugApk = isAppPackage('tv/debug/app-tv-debug.apk', 'android', true)
 * ```
 */
export function isAppPackage(path: string, platform: 'android' | 'ios', debug: boolean): boolean {
  if (platform === 'ios')
    return path.endsWith('.ipa')
  const parts = path.split(/[\\/]/)
  return parts.at(-2) === (debug ? 'debug' : 'release') && path.endsWith('.apk') && !path.endsWith('-unsigned.apk')
}

/**
 * 打包并返回工程内相对安装包路径，供统一归档。
 * @example 模块内部上下文
 * ```ts
 * const build = (root: string, run: AppCommand) => buildMobileApp(root, ['apps/shop-app'], 'ios', run)
 * ```
 */
export async function buildMobileApp(root: string, directories: readonly string[], platform: 'android' | 'ios', run: AppCommand, debug = false, runGradle?: (cwd: string) => Promise<void>): Promise<NativeArtifact[]> {
  if (!directories.length || (platform === 'ios' && process.platform !== 'darwin'))
    throw new Error(cliM('cli_build_app_platform'))
  const outputs: NativeArtifact[] = []
  for (const item of directories) {
    const directory = nativeProjectDirectory(root, item)
    if (!existsSync(join(directory, platform)) || !existsSync(join(directory, 'capacitor.config.ts')))
      throw new Error(cliM('cli_build_app_missing', { params: { platform } }))
    const output = platform === 'android' ? join(directory, 'android/app/build/outputs/apk') : join(directory, 'ios/App/output')
    const packages = (): Map<string, string> => nativeFiles(output, (path, isDirectory) => !isDirectory && isAppPackage(path, platform, debug))
    const before = packages()
    await run(['run', 'build'], directory)
    await run(['exec', 'cap', 'sync', platform], directory)
    const nativeConfig = platform === 'android' ? join(directory, 'android/app/src/main/assets/capacitor.config.json') : join(directory, 'ios/App/App/capacitor.config.json')
    const config: { server?: { url?: unknown } } = JSON.parse(readFileSync(nativeConfig, 'utf8'))
    if (config.server?.url)
      throw new Error(cliM('cli_build_app_reload'))
    if (platform === 'android' && debug && runGradle)
      await runGradle(join(directory, 'android'))
    else
      await run(['exec', 'cap', 'build', platform, ...(platform === 'android' ? ['--androidreleasetype', 'APK'] : debug ? ['--configuration', 'Debug', '--xcode-export-method', 'debugging'] : [])], directory)
    const files = [...packages()].filter(([file, stamp]) => before.get(file) !== stamp && isNativeZip(file))
    if (!files.length)
      throw new Error(cliM('cli_build_app_artifact'))
    outputs.push(...files.map(([source]) => ({ source, file: join(relative(root, directory), relative(output, source)) })))
  }
  return outputs
}
