import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const sourceRunner = fileURLToPath(new URL('../run-release-local.mjs', import.meta.url))
let directory
let runner
let fixture
let log
beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'hai release local '))
  // 执行同一份真实源码，但import.meta定位到自有空工程；夹具失误也不能触达真实工作区。
  mkdirSync(path.join(directory, 'scripts'))
  runner = path.join(directory, 'scripts/run-release-local.mjs')
  writeFileSync(runner, readFileSync(sourceRunner))
  fixture = path.join(directory, 'fake pnpm & arguments.cjs')
  log = path.join(directory, 'calls.jsonl')
  writeFileSync(fixture, `const fs = require('node:fs')
const calls = fs.existsSync(process.env.HAI_RELEASE_TEST_LOG) ? fs.readFileSync(process.env.HAI_RELEASE_TEST_LOG, 'utf8').trim().split('\\n').length : 0
fs.appendFileSync(process.env.HAI_RELEASE_TEST_LOG, JSON.stringify({ args: process.argv.slice(2), ci: process.env.CI, inherited: process.env.HAI_RELEASE_TEST_INHERITED }) + '\\n')
if (String(calls) === process.env.HAI_RELEASE_TEST_FAIL_INDEX) { process.stderr.write('Fixture failure before later gates\\n'); process.exit(23) }
`)
})
afterEach(() => {
  const target = path.resolve(directory)
  if (path.dirname(target) !== path.resolve(tmpdir()) || !path.basename(target).startsWith('hai release local '))
    throw new Error('Unexpected release test cleanup directory')
  rmSync(target, { recursive: true, force: true })
})

function run(extraEnv = {}) {
  // Windows可同时出现NPM_EXECPATH/npm_execpath，先按大小写无关删除全部受控键，再注入唯一夹具值。
  const controlled = new Set(['npm_execpath', 'ci', 'hai_release_test_log', 'hai_release_test_inherited', 'hai_release_test_fail_index'])
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !controlled.has(key.toLowerCase())))
  const overrides = new Map(Object.entries({ NPM_EXECPATH: fixture, CI: 'false', HAI_RELEASE_TEST_LOG: log, HAI_RELEASE_TEST_INHERITED: 'preserved', ...extraEnv }).map(([key, value]) => [key.toLowerCase(), [key, value]]))
  return spawnSync(process.execPath, [runner], {
    encoding: 'utf8',
    env: { ...inherited, ...Object.fromEntries(overrides.values()) },
    windowsHide: true,
    timeout: 30_000,
  })
}

describe('cross-platform local release acceptance', () => {
  it('runs all fixed gates in order with CI and inherited settings, without shell expansion of the pnpm path', () => {
    const result = run()
    expect(result.status, result.stderr).toBe(0)
    const calls = readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line))
    expect(calls.map(call => call.args)).toEqual([
      ['install', '--frozen-lockfile'],
      ['typecheck'],
      ['lint'],
      ['build'],
      ['test'],
      ['--filter', 'admin-console', 'exec', 'playwright', 'install', 'chrome'],
      ['e2e'],
      ['--filter', '@h-ai/cli', 'test:deploy-gates'],
    ])
    expect(calls.every(call => call.ci === 'true' && call.inherited === 'preserved')).toBe(true)
  })

  it.each([0, 3, 7])('preserves the first failure code and never starts later gates when step %i fails', (index) => {
    const result = run({ HAI_RELEASE_TEST_FAIL_INDEX: String(index) })
    expect(result.status).toBe(23)
    expect(result.stderr).toContain('Fixture failure before later gates')
    expect(readFileSync(log, 'utf8').trim().split('\n')).toHaveLength(index + 1)
  })

  it('reports a missing pnpm executable as failure without advancing to later gates', () => {
    const result = run({ npm_execpath: path.join(directory, 'missing-pnpm.exe') })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Failed to start pnpm')
  })
})
