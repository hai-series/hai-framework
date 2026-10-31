import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

it('真实 Node 启动入口使用统一来源并在启动前应用 NODE_OPTIONS，保留子进程退出码', () => {
  const directory = mkdtempSync(join(tmpdir(), 'hai-node-environment-'))
  try {
    mkdirSync(join(directory, 'node_modules/@h-ai'), { recursive: true })
    symlinkSync(fileURLToPath(new URL('../../core', import.meta.url)), join(directory, 'node_modules/@h-ai/core'), process.platform === 'win32' ? 'junction' : 'dir')
    writeFileSync(join(directory, 'package.json'), '{"type":"module"}\n')
    writeFileSync(join(directory, '.env'), 'HAI_NODETEST_CONNECTION_HOST=old\n')
    writeFileSync(join(directory, '.env.test'), 'APP_MODE=public\n')
    writeFileSync(join(directory, '.env.local'), 'APP_MODE=private\n')
    writeFileSync(join(directory, '.env.test.local'), 'HAI_NODETEST_CONNECTION=\'{"host":"new"}\'\nAPP_MODE=mode-private\nNODE_OPTIONS=--no-warnings\n')
    writeFileSync(join(directory, 'entry.mjs'), 'process.stdout.write(JSON.stringify({parent:process.env.HAI_NODETEST_CONNECTION,child:process.env.HAI_NODETEST_CONNECTION_HOST,mode:process.env.APP_MODE,options:process.env.NODE_OPTIONS,args:process.argv.slice(2)}));process.exitCode=7\n')
    const script = fileURLToPath(new URL('../templates/shared/run-node.mjs', import.meta.url))
    const result = spawnSync(process.execPath, [script, 'test', '.', 'entry.mjs', 'literal argument'], { cwd: directory, env: { ...process.env, NODE_OPTIONS: undefined }, encoding: 'utf8', timeout: 10000, windowsHide: true })
    expect(result.status, result.stderr).toBe(7)
    expect(JSON.parse(result.stdout)).toEqual({ parent: '{"host":"new"}', mode: 'mode-private', options: '--no-warnings', args: ['literal argument'] })
  }
  finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
