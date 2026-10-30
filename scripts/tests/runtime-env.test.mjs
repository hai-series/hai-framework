import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

function fixture(run) {
  const directory = mkdtempSync(join(tmpdir(), 'hai-runtime-env-'))
  const loader = join(directory, 'runtime-env.mjs')
  copyFileSync(new URL('./fixtures/runtime-env.mjs', import.meta.url), loader)
  try {
    return run({
      envFile: join(directory, '.env.runtime'),
      start: (env = {}) => spawnSync(process.execPath, ['--import', pathToFileURL(loader).href, '-e', 'process.stdout.write(JSON.stringify({value:process.env.HAI_RUNTIME_TEST,removed:process.env.HAI_RUNTIME_REMOVED}))'], { encoding: 'utf8', env: { ...process.env, HAI_RUNTIME_TEST: undefined, HAI_RUNTIME_REMOVED: undefined, ...env }, timeout: 5000 }),
    })
  }
  finally { rmSync(directory, { recursive: true, force: true }) }
}

describe('mounted runtime environment preload', () => {
  it('loads before application code, overrides a stale value and retains literal shell-like text', () => fixture(({ envFile, start }) => {
    // eslint-disable-next-line no-template-curly-in-string -- 验证 dotenv 保留原样的变量与 shell 表达式。
    writeFileSync(envFile, 'HAI_RUNTIME_TEST=\'literal-$(not-a-command)-${NO_EXPANSION}-$\'\n')
    const result = start({ HAI_RUNTIME_TEST: 'old value' })
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout).value).toMatch(/^literal-\$\(not-a-command\)-\$\{NO_EXPANSION\}-\$$/)
  }))

  it('reads updates on each new process and does not retain removed file variables', () => fixture(({ envFile, start }) => {
    writeFileSync(envFile, 'HAI_RUNTIME_TEST=first\nHAI_RUNTIME_REMOVED=temporary\n')
    expect(JSON.parse(start().stdout)).toEqual({ value: 'first', removed: 'temporary' })
    writeFileSync(envFile, 'HAI_RUNTIME_TEST=second\n')
    expect(JSON.parse(start().stdout)).toEqual({ value: 'second' })
  }))

  it.each(['missing', 'directory', 'oversized'])('fails before application code for %s input without exposing file contents', kind => fixture(({ envFile, start }) => {
    if (kind === 'directory')
      mkdirSync(envFile)
    if (kind === 'oversized')
      writeFileSync(envFile, `PRIVATE_MARKER=${'x'.repeat(1024 * 1024)}`)
    const result = start()
    expect(result.status).not.toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('Runtime environment file')
    expect(result.stderr).not.toContain('PRIVATE_MARKER')
  }))
})
