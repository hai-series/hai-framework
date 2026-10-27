/** 无 Testcontainers 依赖的包有界并行；声明该依赖的包串行调度，避免争抢容器资源。 */
import { spawn } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { availableParallelism, freemem } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))

/** 从工作区真实 manifest 分类，每个有 test 入口的包恰好调度一次。 */
export function testGroups(directory) {
  const parallel = []
  const containers = []
  for (const parent of ['packages', 'apps']) {
    for (const entry of readdirSync(join(directory, parent), { withFileTypes: true })) {
      if (!entry.isDirectory())
        continue
      const manifest = JSON.parse(readFileSync(join(directory, parent, entry.name, 'package.json'), 'utf8'))
      if (!manifest.scripts?.test)
        continue
      const dependencies = { ...manifest.dependencies, ...manifest.devDependencies, ...manifest.optionalDependencies }
      const group = dependencies.testcontainers ? containers : parallel
      group.push(manifest.name)
    }
  }
  return [{ names: parallel, concurrency: 4 }, { names: containers, concurrency: 1 }]
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const require = createRequire(import.meta.url)
  const turbo = require.resolve('turbo/bin/turbo')
  const turboArgs = process.argv.slice(2)
  if (turboArgs.some(argument => /^(?:--(?:filter|concurrency)(?:=|$)|-[Fc])/.test(argument)))
    throw new Error('Use pnpm --filter <workspace> test for a scoped run; root test owns workspace selection and concurrency')
  const continueArgs = turboArgs.some(argument => argument === '--continue' || argument.startsWith('--continue=')) ? [] : ['--continue=dependencies-successful']
  let child
  let interrupted = false
  const stop = () => {
    if (interrupted)
      return
    interrupted = true
    // Windows 的 kill 会强制终止并跳过 Vitest teardown；等待当前组清理，不再启动下一组。
    // 真实终端 Ctrl+C 也会传给同一控制台的子进程，POSIX 则显式转发给 Turbo。
    process.stderr.write('Cancellation requested; waiting for the active test group to exit and clean up.\n')
    if (process.platform !== 'win32')
      child?.kill('SIGINT')
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  try {
    // 两组顺序启动，构建依赖不会在不同 Turbo 图中同时重写同一份 dist。
    for (const { names, concurrency } of testGroups(root)) {
      if (interrupted)
        break
      if (!names.length)
        continue
      // 每组启动前按两个文件 worker 和每包 2 GiB 空闲内存预算收紧上限。
      const freeMemory = freemem()
      const cpuCount = availableParallelism()
      const activeConcurrency = Math.max(1, Math.min(concurrency, Math.floor(freeMemory / (2 * 1024 ** 3)), Math.floor(cpuCount / 2)))
      process.stdout.write(`Test group: ${names.length} workspaces; concurrency ${activeConcurrency}/${concurrency}; available memory ${(freeMemory / 1024 ** 3).toFixed(1)} GiB; CPUs ${cpuCount}.\n`)
      const code = await new Promise((resolve, reject) => {
        child = spawn(process.execPath, [turbo, 'run', 'test', ...names.map(name => `--filter=${name}`), ...continueArgs, `--concurrency=${activeConcurrency}`, ...turboArgs], {
          cwd: root,
          stdio: 'inherit',
          windowsHide: true,
        })
        child.once('error', reject)
        child.once('exit', resolve)
      })
      // 普通失败继续收集另一组；任何失败仍阻断根门禁。
      if (code !== 0)
        process.exitCode = typeof code === 'number' && code !== 0 ? code : 1
    }
    if (interrupted)
      process.exitCode ||= 1
  }
  finally {
    process.removeListener('SIGINT', stop)
    process.removeListener('SIGTERM', stop)
  }
}
