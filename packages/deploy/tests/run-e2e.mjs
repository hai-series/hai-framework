import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const vitest = path.join(path.dirname(fileURLToPath(import.meta.resolve('vitest/package.json'))), 'vitest.mjs')
// 两组真实 Linux 夹具依次运行，避免容器准备争用；启用开关仅传给本次子进程。
const result = spawnSync(process.execPath, [vitest, 'run', 'tests/deploy-lock.e2e.test.ts', 'tests/deploy-command-runtime.e2e.test.ts', '--no-file-parallelism', ...process.argv.slice(2)], {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  env: { ...process.env, HAI_DEPLOY_E2E: '1' },
  stdio: 'inherit',
  windowsHide: true,
})
if (result.error)
  process.stderr.write(`${result.error.message}\n`)
process.exit(result.status ?? 1)
