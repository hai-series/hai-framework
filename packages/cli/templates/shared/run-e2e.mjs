/** 运行浏览器验收，并在报告写完后清理本次输出；失败和中断同样清理。 */
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'

const cwd = process.cwd()
const require = createRequire(resolve(cwd, 'package.json'))
const cli = require.resolve('@playwright/test/cli')
const dataParent = resolve(process.env.HAI_E2E_DATA_ROOT || tmpdir())
mkdirSync(dataParent, { recursive: true })
const dataRoot = mkdtempSync(join(dataParent, 'hai-browser-e2e-'))
const groups = [[]]
for (const argument of process.argv.slice(2)) {
  if (argument === '--next')
    groups.push([])
  else
    groups.at(-1).push(argument)
}
let child
let interrupted = false
function stop() {
  if (interrupted)
    return
  interrupted = true
  if (process.platform === 'win32' && child?.pid && child.exitCode === null) {
    // Windows 的 kill 不传递 SIGTERM；同时结束本次 Playwright 创建的浏览器与服务进程。
    spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' })
      .once('error', () => child?.kill())
  }
  else {
    child?.kill()
  }
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
try {
  for (const args of groups) {
    const code = await new Promise((resolve, reject) => {
      child = spawn(process.execPath, [cli, 'test', ...args], {
        cwd,
        windowsHide: true,
        stdio: 'inherit',
        env: { ...process.env, HAI_AUTH_EVIDENCE_DIR: join(cwd, 'test-results/evidence'), HAI_E2E_DATA_ROOT: dataRoot },
      })
      child.once('error', reject)
      child.once('exit', resolve)
    })
    if (code !== 0 || interrupted) {
      process.exitCode = typeof code === 'number' && code !== 0 ? code : 1
      break
    }
  }
}
finally {
  process.removeListener('SIGINT', stop)
  process.removeListener('SIGTERM', stop)
  // 固定为当前测试工程中的标准输出目录，禁止删除调用方任意指定的路径。
  for (const name of ['test-results', 'playwright-report'])
    rmSync(join(cwd, name), { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  // Playwright 退出后服务进程已关闭，此时删除 SQLite / storage，避免 Windows 文件锁。
  rmSync(dataRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
}
