/** Capacitor 同步与真正原生产物打包分开；只接受受控工程内路径。 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import process from 'node:process'
import { cliM } from '../cli-i18n.js'

/**
 * 原生打包前检查工程和平台，结束后检查本次产物；工具链错误由真实构建命令返回。
 * @example 模块内部上下文
 * ```ts
 * async function build(run: (args: string[], cwd: string) => Promise<void>) {
 *   return buildMobileApp('/project', ['apps/shop-app'], 'android', run)
 * }
 * ```
 */
export async function buildMobileApp(root: string, directories: readonly string[], platform: 'android' | 'ios', run: (args: string[], cwd: string) => Promise<void>): Promise<string[]> {
  if (!directories.length || (platform === 'ios' && process.platform !== 'darwin'))
    throw new Error(cliM('cli_build_app_platform'))
  const outputs: string[] = []
  for (const item of directories) {
    const directory = resolve(root, item)
    const rel = relative(root, directory)
    if (!rel || rel.startsWith('..') || !existsSync(join(directory, platform)) || !existsSync(join(directory, 'capacitor.config.ts')))
      throw new Error(cliM('cli_build_app_missing', { params: { platform } }))
    const before = Date.now()
    await run(['run', 'build'], directory)
    await run(['exec', 'cap', 'sync', platform], directory)
    // sync 后核验最终写入原生工程的配置，禁止开发热更新地址进入制品。
    const nativeConfig = platform === 'android' ? join(directory, 'android/app/src/main/assets/capacitor.config.json') : join(directory, 'ios/App/App/capacitor.config.json')
    const config: { server?: { url?: unknown } } = JSON.parse(readFileSync(nativeConfig, 'utf8'))
    if (config.server?.url)
      throw new Error(cliM('cli_build_app_reload'))
    await run(['exec', 'cap', 'build', platform, ...(platform === 'android' ? ['--androidreleasetype', 'APK'] : [])], directory)
    const artifactRoot = platform === 'android' ? join(directory, 'android/app/build/outputs/apk') : join(directory, 'ios/App/output')
    function visit(path: string): void {
      if (!existsSync(path))
        return
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        const file = join(path, entry.name)
        if (entry.isDirectory()) {
          visit(file)
        }
        else if (entry.isFile() && file.endsWith(platform === 'android' ? '.apk' : '.ipa')) {
          const info = statSync(file)
          if (info.size > 4 && info.mtimeMs >= before - 1000 && readFileSync(file).subarray(0, 2).toString() === 'PK')
            outputs.push(file)
        }
      }
    }
    const count = outputs.length
    visit(artifactRoot)
    if (outputs.length === count)
      throw new Error(cliM('cli_build_app_artifact'))
  }
  return outputs
}
