import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import process from 'node:process'
import { afterEach, expect, it } from 'vitest'
import { createLocalInstallScript } from '../src/container/deploy-scripts.js'

const temporary: string[] = []
const shell = process.platform === 'win32' ? 'C:/Program Files/Git/usr/bin/bash.exe' : '/bin/sh'
const environment = { ...process.env, PATH: [...(process.platform === 'win32' ? ['C:/Program Files/Git/usr/bin'] : []), process.env.PATH].join(delimiter) }

afterEach(() => {
  for (const directory of temporary.splice(0))
    rmSync(directory, { recursive: true, force: true })
})

it.each([0, 7])('服务器入口从任意目录自动解包、保留日志并清理临时文件（退出码 %s）', (exitCode) => {
  const root = mkdtempSync(join(tmpdir(), 'hai-local-install-'))
  temporary.push(root)
  const directory = join(root, '交付目录 with spaces')
  const payload = join(root, 'payload')
  const unrelated = join(root, 'unrelated')
  mkdirSync(directory)
  mkdirSync(payload)
  mkdirSync(unrelated)
  const marker = join(root, 'executed.txt')
  writeFileSync(join(unrelated, 'keep.txt'), 'unrelated')
  writeFileSync(join(payload, 'apply.sh'), `#!/bin/sh\nprintf '%s\\n%s\\n' "$(dirname -- "$0")" "$1" > "$HAI_TEST_MARKER"\nprintf 'apply output\\n'\nexit ${exitCode}\n`)
  execFileSync('tar', ['-cf', join(directory, 'release.tar'), '-C', payload, '.'])
  writeFileSync(join(directory, 'deploy-local.sh'), createLocalInstallScript({ bundle: 'release.tar', directory: '/srv/default' }))
  const result = spawnSync(shell, [join(directory, 'deploy-local.sh'), '/srv/hai app'], { cwd: unrelated, env: { ...environment, HAI_TEST_MARKER: marker }, encoding: 'utf8', windowsHide: true })
  expect(result.error).toBeUndefined()
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(exitCode)
  expect(existsSync(marker)).toBe(true)
  const [extracted, destination] = readFileSync(marker, 'utf8').trim().split('\n')
  expect(destination).toBe('/srv/hai app')
  expect(spawnSync(shell, ['-c', 'test ! -e "$1"', 'cleanup-check', extracted!], { env: environment, windowsHide: true }).status).toBe(0)
  const logs = readdirSync(directory).filter(file => file.endsWith('.log'))
  expect(logs).toHaveLength(1)
  expect(readFileSync(join(directory, logs[0]!), 'utf8')).toContain('apply output')
  expect(readFileSync(join(unrelated, 'keep.txt'), 'utf8')).toBe('unrelated')
})

it('损坏的归档停止执行并保留解包日志', () => {
  const root = mkdtempSync(join(tmpdir(), 'hai-local-invalid-'))
  temporary.push(root)
  writeFileSync(join(root, 'release.tar'), 'invalid tar')
  writeFileSync(join(root, 'deploy-local.sh'), createLocalInstallScript({ bundle: 'release.tar', directory: '/srv/default' }))
  const result = spawnSync(shell, [join(root, 'deploy-local.sh')], { env: environment, encoding: 'utf8', windowsHide: true })
  expect(result.status).not.toBe(0)
  expect(readdirSync(root).some(file => file.endsWith('.log'))).toBe(true)
})
