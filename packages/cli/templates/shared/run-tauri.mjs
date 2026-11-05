/** Tauri JSON 保留平台配置；名称通过 CLI 覆盖，不向源码写入环境值。 */
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import process from 'node:process'
import { resolveNativeName } from './native-name.mjs'

const [environmentDirectory, coreFile, ...args] = process.argv.slice(2)
if (!environmentDirectory || !coreFile)
  throw new Error('Expected environment directory and Core YAML path before Tauri arguments')
const require = createRequire(resolve('package.json'))
const command = args.find(argument => !argument.startsWith('-'))
if (['dev', 'build', 'bundle'].includes(command) && !args.some(argument => ['--help', '-h', '--version', '-V'].includes(argument))) {
  const envDir = resolve(environmentDirectory)
  const name = resolveNativeName(envDir, resolve(envDir, coreFile), command === 'dev' ? 'dev' : 'prod')
  const config = JSON.parse(readFileSync(resolve('src-tauri/tauri.conf.json'), 'utf8'))
  // 数组采用整体替换，保留窗口尺寸、label 与其他自定义窗口；只更新主窗口标题。
  const windows = config.app?.windows?.map((window, index) => index === 0 ? { ...window, title: name } : window)
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
