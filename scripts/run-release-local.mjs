/** 本地完整发布验收：固定顺序、跨平台传入CI，首个失败停止，不触发版本升级或发布。 */
import { spawn } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const pnpm = Object.entries(process.env).find(([key]) => key.toLowerCase() === 'npm_execpath')?.[1]
if (process.argv.length > 2 || !pnpm) {
  process.stderr.write('Run pnpm test:release-local without additional arguments.\n')
  process.exitCode = 1
}
else {
  // pnpm提供当前运行入口：JS入口经Node启动，原生可执行文件直接启动；不经过cmd/sh解析。
  const isNodeEntry = /\.(?:c|m)?js$/i.test(pnpm)
  const command = isNodeEntry ? process.execPath : pnpm
  const prefix = isNodeEntry ? [pnpm] : []
  const environment = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== 'ci')), CI: 'true' }
  const steps = [
    ['install', '--frozen-lockfile'],
    ['typecheck'],
    ['lint'],
    ['build'],
    ['test'],
    ['--filter', 'admin-console', 'exec', 'playwright', 'install', 'chrome'],
    ['e2e'],
    ['--filter', '@h-ai/cli', 'test:deploy-gates'],
  ]
  let child
  let interruptedCode = 0
  const interrupt = (signal) => {
    interruptedCode ||= signal === 'SIGTERM' ? 143 : 130
    // Windows终端取消也会通知同一控制台的子进程；等待其清理，不强杀测试teardown。
    if (process.platform !== 'win32')
      child?.kill(signal)
  }
  const onInterrupt = () => interrupt('SIGINT')
  const onTerminate = () => interrupt('SIGTERM')
  process.once('SIGINT', onInterrupt)
  process.once('SIGTERM', onTerminate)
  try {
    for (const args of steps) {
      if (interruptedCode)
        break
      process.stdout.write(`[release-local] pnpm ${args.join(' ')}\n`)
      const code = await new Promise((resolve) => {
        child = spawn(command, [...prefix, ...args], {
          cwd: root,
          env: environment,
          shell: false,
          windowsHide: true,
          stdio: 'inherit',
        })
        child.once('error', (error) => {
          process.stderr.write(`Failed to start pnpm: ${error.message}\n`)
          resolve(1)
        })
        child.once('close', (status, signal) => resolve(status ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1)))
      })
      if (code !== 0) {
        process.exitCode = code
        break
      }
    }
    process.exitCode ||= interruptedCode
  }
  finally {
    process.removeListener('SIGINT', onInterrupt)
    process.removeListener('SIGTERM', onTerminate)
  }
}
