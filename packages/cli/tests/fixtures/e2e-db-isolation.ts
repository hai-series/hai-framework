import type { Buffer } from 'node:buffer'
import { spawn, spawnSync } from 'node:child_process'
import { closeSync, existsSync, openSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const sentinel = fileURLToPath(new URL('./e2e-db-sentinel.mjs', import.meta.url))

/**
 * 本轮独立计数进程已落盘的安全状态，不包含环境变量或连接凭据。
 * @example
 * ```ts
 * // 测试内部上下文。
 * const closed: SentinelState = { port: 12581, connections: 1, closed: true }
 * if (!closed.closed) throw new Error('Counter is still active')
 * ```
 */
interface SentinelState {
  port: number
  connections: number
  closed: boolean
}

/**
 * 仅给本轮已登记的临时样板注入恶意 ambient/.env.local，验证服务没有触达外部 DB。
 * @param project - 已由样板门禁确认所有权的临时工程。
 * @param evidence - 本轮独立且已创建的证据目录。
 * @param env - 仅用于当前浏览器门禁子进程的环境克隆。
 * @param run - 同步运行真实门禁；失败仍恢复私有文件并停止计数进程。
 * @returns {void} 成功时保留计数证明。
 * @throws 正控未触达、隔离失败、计数进程未真实退出或原门禁失败时抛错。
 * @example
 * ```ts
 * // 测试内部上下文；所有路径均属于当前门禁。
 * withDatabaseIsolation(project, evidence, env, () => runGate(pnpmBin, ['test:e2e'], project, env, true))
 * ```
 */
export function withDatabaseIsolation(project: string, evidence: string, env: NodeJS.ProcessEnv, run: () => void): void {
  const stateFile = path.join(evidence, 'database-isolation.json')
  const savedFiles = new Map<string, Buffer | undefined>()
  const diagnostic = path.join(evidence, 'database-isolation-process.log')
  const output = openSync(diagnostic, 'a')
  const child = spawn(process.execPath, [sentinel, 'serve', stateFile], { windowsHide: true, stdio: ['ignore', output, output] })
  closeSync(output)
  let spawnFailure: Error | undefined
  child.once('error', (error) => {
    spawnFailure = error
  })
  const command = (mode: 'ready' | 'probe' | 'closed' | 'exited') => {
    const result = spawnSync(process.execPath, [sentinel, mode, stateFile, String(child.pid)], { env, windowsHide: true, encoding: 'utf8', timeout: 15_000 })
    if (result.error || result.status !== 0)
      throw result.error ?? new Error(`Database isolation ${mode} failed: ${result.stderr}; state=${existsSync(stateFile) ? readFileSync(stateFile, 'utf8') : 'absent'}; process=${readFileSync(diagnostic, 'utf8')}`)
  }
  const readState = () => JSON.parse(readFileSync(stateFile, 'utf8')) as SentinelState
  const failures: unknown[] = []
  let baseline = 0
  try {
    command('ready')
    const database = JSON.stringify({ type: 'postgresql', host: '127.0.0.1', port: readState().port, database: 'isolation_probe', user: 'probe', password: 'probe' })
    env.HAI_DB = database
    command('probe')
    baseline = readState().connections
    if (baseline < 1)
      throw new Error('Database isolation positive control did not connect')
    // 不改变安装、构建或单测环境，只在真实浏览器门禁阶段尝试覆盖服务配置。
    const directories = [project]
    for (const name of ['apps', 'packages']) {
      const parent = path.join(project, name)
      if (existsSync(parent))
        directories.push(...readdirSync(parent, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => path.join(parent, entry.name)))
    }
    for (const directory of directories) {
      if (directory !== project && !existsSync(path.join(directory, 'config', '_db.yml')))
        continue
      const local = path.join(directory, '.env.local')
      const before = existsSync(local) ? readFileSync(local) : undefined
      savedFiles.set(local, before)
      writeFileSync(local, `${before?.toString('utf8') ?? ''}\nHAI_DB='${database}'\n`)
    }
    run()
  }
  catch (error) {
    failures.push(error)
  }
  finally {
    for (const [file, before] of savedFiles) {
      try {
        if (before)
          writeFileSync(file, before)
        else
          unlinkSync(file)
      }
      catch (error) {
        failures.push(error)
      }
    }
    try {
      writeFileSync(`${stateFile}.stop`, '')
      command('closed')
      const final = readState()
      if (baseline > 0 && (final.connections !== baseline || !final.closed))
        failures.push(new Error(`E2E server connected to ambient or .env.local database (${final.connections - baseline} unexpected connections)`))
    }
    catch (error) {
      // 只终止当前函数刚创建的句柄，不按进程名或端口清理其他资源。
      child.kill()
      failures.push(error)
      try {
        command('exited')
      }
      catch (exitError) {
        failures.push(exitError)
      }
    }
  }
  if (failures.length === 1)
    throw failures[0]
  if (failures.length > 1)
    throw new AggregateError(failures, `Scaffold E2E gate and isolation cleanup failed: ${failures.map(error => error instanceof Error ? error.message : String(error)).join('; ')}`)
  if (spawnFailure)
    throw spawnFailure
}
