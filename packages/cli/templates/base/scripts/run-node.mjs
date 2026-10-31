/** 使用框架统一的环境来源规则启动 Node，同时让 NODE_OPTIONS 在子进程启动前生效。 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const [mode, environmentDirectory, entry, ...arguments_] = process.argv.slice(2)
if (!mode || !environmentDirectory || !entry)
  throw new Error('Usage: node run-node.mjs <mode> <env-directory> <entry> [arguments]')

// 从实际应用解析公开 Core 入口，脚本可以放在 workspace 根目录。
const require = createRequire(resolve('package.json'))
const { core } = await import(pathToFileURL(require.resolve('@h-ai/core')).href)
const loaded = core.config.loadEnvFiles({ mode, envDir: resolve(environmentDirectory) })
if (!loaded.success)
  throw new Error(loaded.error.message)

const child = spawn(process.execPath, [resolve(entry), ...arguments_], {
  cwd: process.cwd(),
  env: { ...process.env, ...loaded.data },
  stdio: 'inherit',
  windowsHide: true,
})
function interrupt() {
  child.kill('SIGINT')
}
function terminate() {
  child.kill('SIGTERM')
}
process.on('SIGINT', interrupt)
process.on('SIGTERM', terminate)
try {
  const result = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
  process.exitCode = result.code ?? (result.signal === 'SIGINT' ? 130 : 143)
}
finally {
  process.off('SIGINT', interrupt)
  process.off('SIGTERM', terminate)
  if (child.exitCode === null && child.signalCode === null)
    child.kill('SIGTERM')
}
