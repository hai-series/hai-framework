/** Tauri JSON 保留平台配置；名称通过 CLI 覆盖，不向源码写入环境值。 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import process from 'node:process'
import { resolveNativeName } from './native-name.mjs'

const [environmentDirectory, coreFile, ...args] = process.argv.slice(2)
if (!environmentDirectory || !coreFile)
  throw new Error('Expected environment directory and Core YAML path before Tauri arguments')
const require = createRequire(resolve('package.json'))
const separator = args.indexOf('--')
const toolArgs = separator < 0 ? args : args.slice(0, separator)
const command = toolArgs.find(argument => !argument.startsWith('-'))
if (['dev', 'build', 'bundle'].includes(command) && !toolArgs.some(argument => ['--help', '-h', '--version', '-V'].includes(argument))) {
  const envDir = resolve(environmentDirectory)
  const name = resolveNativeName(envDir, resolve(envDir, coreFile), command === 'dev' ? 'dev' : 'prod')
  const config = JSON.parse(readFileSync(resolve('src-tauri/tauri.conf.json'), 'utf8'))
  const platform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux'
  const platformFile = resolve(`src-tauri/tauri.${platform}.conf.json`)
  const patch = existsSync(platformFile) ? JSON.parse(readFileSync(platformFile, 'utf8')) : {}
  // 与 Tauri 的 JSON Merge Patch 一致：平台数组整体替换，null 删除对应设置。
  const app = patch.app === null ? undefined : { ...config.app, ...patch.app }
  const main = app?.windows?.findIndex(window => (window.label ?? 'main') === 'main') ?? -1
  const windows = app?.windows?.map((window, index) => index === (main < 0 ? 0 : main) ? { ...window, title: name } : window)
  const overlay = { productName: name, ...(windows ? { app: { windows } } : {}) }
  // 名称是默认覆盖；调用方后续显式 --config 仍可覆盖它，保留 Tauri 原有优先级。
  args.splice(args.indexOf(command) + 1, 0, '--config', JSON.stringify(overlay))
}
const child = spawn(process.execPath, [require.resolve('@tauri-apps/cli/tauri.js'), ...args], { stdio: 'inherit', windowsHide: true })
const interrupt = () => child.kill('SIGINT')
const terminate = () => child.kill('SIGTERM')
process.on('SIGINT', interrupt)
process.on('SIGTERM', terminate)
try {
  process.exitCode = await new Promise((resolveExit, reject) => {
    child.once('error', reject)
    child.once('close', code => resolveExit(code ?? 1))
  })
}
finally {
  process.off('SIGINT', interrupt)
  process.off('SIGTERM', terminate)
}
