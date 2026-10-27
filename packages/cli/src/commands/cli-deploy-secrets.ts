/** 服务器本机执行的旧凭据预检/导入入口；不连接默认 SSH 目标。 */
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { cliM } from '../cli-i18n.js'
import { writeCliMessage } from '../cli-utils.js'

/**
 * 默认为只读验证；只有显式 apply 才保存目标服务器的凭据状态。
 * @example 模块内部上下文
 * ```ts
 * await deploySecretsCommand('/opt/hai/apps/shop-test', { import: '/private/shop-import.json', runtime: 'docker' })
 * ```
 */
export async function deploySecretsCommand(directory: string, options: { import?: string, apply?: boolean, runtime?: string, cwd?: string }): Promise<void> {
  if (!options.import || !['docker', 'podman'].includes(options.runtime ?? 'docker'))
    throw new Error(cliM('cli_deploy_secrets_options'))
  const cwd = resolve(options.cwd ?? process.cwd())
  const local = createRequire(resolve(cwd, 'package.json'))
  let module: typeof import('@h-ai/deploy')
  try {
    module = await import(pathToFileURL(local.resolve('@h-ai/deploy')).href)
  }
  catch {
    throw new Error(cliM('cli_deploy_module_missing'))
  }
  const result = await module.importDeploymentSecrets({ directory: resolve(cwd, directory), inputFile: resolve(cwd, options.import), runtime: options.runtime === 'podman' ? 'podman' : 'docker', dryRun: options.apply !== true })
  if (!result.success) {
    const context = result.error.ext
    throw new Error(`${result.error.message}\n${JSON.stringify({ phase: context?.phase, state: context?.state })}`)
  }
  writeCliMessage(JSON.stringify(result.data, null, 2))
}
