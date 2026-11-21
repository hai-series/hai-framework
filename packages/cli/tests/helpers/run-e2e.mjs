/** 框架专项 Playwright 分组入口；日常工程直接使用 playwright test。 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import process from 'node:process'
import { spawnOwned, stopOwned } from './startup-process.mjs'

const cwd = process.cwd()
const pnpm = Object.entries(process.env).find(([name]) => name.toLowerCase() === 'npm_execpath')?.[1]
if (!pnpm)
  throw new Error('Run framework scenario tests through pnpm')
const evidence = resolve(process.env.HAI_AUTH_EVIDENCE_DIR || 'test-results')
mkdirSync(evidence, { recursive: true })
const run = mkdtempSync(join(evidence, 'run-'))
const parent = resolve(process.env.HAI_E2E_DATA_ROOT || tmpdir())
mkdirSync(parent, { recursive: true })
const data = mkdtempSync(join(parent, 'hai-browser-e2e-'))
const groups = [[]]
for (const argument of process.argv.slice(2)) {
  argument === '--next'
    ? groups.push([])
    : groups.at(-1).push(argument)
}
let child, stopping, cleanupFailure
let interrupted = false

/** 专项条件写在真实模式文件中；应用退出后恢复，不替换开发配置或密钥。 */
function restore(directory) {
  const file = join(directory, 'environment-backups.json')
  if (!existsSync(file))
    return
  for (const [target, source] of Object.entries(JSON.parse(readFileSync(file, 'utf8')))) {
    if (basename(target) !== '.env.test' || typeof source !== 'string')
      throw new Error('Invalid scenario configuration backup')
    writeFileSync(target, source)
  }
  rmSync(file)
}
function stop() {
  interrupted = true
  if (child)
    stopping ||= stopOwned(child).catch((error) => { cleanupFailure = error })
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
try {
  for (const [index, original] of groups.entries()) {
    if (interrupted)
      break
    const group = original.find(value => value.startsWith('--e2e-group='))?.slice('--e2e-group='.length)
    const args = original.filter(value => !value.startsWith('--e2e-group='))
    const directory = join(data, String(index + 1))
    const output = join(run, String(index + 1))
    mkdirSync(directory)
    const command = ['exec', 'playwright', 'test', ...args]
    if (!args.some(value => value === '--output' || value.startsWith('--output=')))
      command.push('--output', join(output, 'results'))
    const code = await new Promise((complete, reject) => {
      child = spawnOwned(/\.(?:c|m)?js$/i.test(pnpm)
        ? process.execPath
        : pnpm, /\.(?:c|m)?js$/i.test(pnpm)
        ? [pnpm, ...command]
        : command, {
        cwd,
        stdio: 'inherit',
        env: {
          ...process.env,
          HAI_E2E_GROUP: group,
          HAI_E2E_DATA_ROOT: directory,
          HAI_AUTH_EVIDENCE_DIR: process.env.HAI_AUTH_EVIDENCE_DIR || join(output, 'evidence'),
          PLAYWRIGHT_HTML_OUTPUT_DIR: process.env.PLAYWRIGHT_HTML_OUTPUT_DIR || process.env.PLAYWRIGHT_HTML_REPORT || join(output, 'html'),
        },
      })
      child.once('error', reject)
      // 根进程退出即收尾，避免孤儿持有 stdio 让 close 永不触发。
      child.once('exit', complete)
    })
    await stopOwned(child)
    child = undefined
    restore(directory)
    if (code !== 0) {
      process.exitCode ||= typeof code === 'number' && code !== 0
        ? code
        : 1
    }
  }
}
finally {
  process.removeListener('SIGINT', stop)
  process.removeListener('SIGTERM', stop)
  await stopping
  if (child) {
    try {
      await stopOwned(child)
    }
    catch (error) { cleanupFailure = error }
  }
  if (!cleanupFailure) {
    try {
      for (let index = 1; index <= groups.length; index++) restore(join(data, String(index)))
      rmSync(data, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100,
      })
    }
    catch (error) {
      process.stderr.write(`E2E data cleanup failed: ${error.message}\n`)
      process.exitCode ||= 1
    }
  }
  if (interrupted)
    process.exitCode ||= 1
}

if (cleanupFailure)
  throw cleanupFailure
