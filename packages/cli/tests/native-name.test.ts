import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { nativeNameEnvironment, resolveNativeName } from '../templates/shared/native-name.mjs'

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'hai-native-name-'))
  mkdirSync(join(root, 'config'))
  writeFileSync(join(root, 'config/_core.yml'), 'name: $' + '{HAI_CORE_NAME:YAML Native}\n')
  for (const name of Object.keys(process.env).filter(name => name.startsWith('HAI_CORE')))
    vi.stubEnv(name, undefined)
})
afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(root, { recursive: true, force: true })
})

it('reads current YAML and preserves literal names without requiring service initialization', () => {
  const file = join(root, 'config/_core.yml')
  expect(resolveNativeName(root, file, 'prod')).toBe('YAML Native')
  const name = 'Operations "管理台"\n<Workspace>\'s'
  writeFileSync(file, `name: ${JSON.stringify(name)}\n`)
  expect(resolveNativeName(root, file, 'prod')).toBe(name)
})

it('honors all dotenv layers and process precedence without retaining private variables', () => {
  const files = ['.env', '.env.prod', '.env.local', '.env.prod.local']
  for (const [index, file] of files.entries()) {
    writeFileSync(join(root, file), `HAI_CORE_NAME=Layer ${index}\nNATIVE_TEST_PRIVATE=private-${index}\n`)
    expect(resolveNativeName(root, join(root, 'config/_core.yml'), 'production')).toBe(`Layer ${index}`)
    expect(process.env.NATIVE_TEST_PRIVATE).toBeUndefined()
    expect(process.env.HAI_CORE_NAME).toBeUndefined()
  }
  vi.stubEnv('HAI_CORE_NAME', 'Process Native')
  expect(resolveNativeName(root, join(root, 'config/_core.yml'), 'prod')).toBe('Process Native')
  expect(process.env.HAI_CORE_NAME).toBe('Process Native')
})

it('uses explicit Core mode and parent JSON replacement while forwarding only name and mode', () => {
  writeFileSync(join(root, '.env'), 'HAI_CORE_NAME=Lower Name\n')
  writeFileSync(join(root, '.env.dev'), 'HAI_CORE_NAME=Development Name\n')
  vi.stubEnv('HAI_CORE_ENV', 'development')
  expect(resolveNativeName(root, join(root, 'config/_core.yml'), 'prod')).toBe('Development Name')
  vi.stubEnv('HAI_CORE', JSON.stringify({ name: 'Parent Name', logging: { context: { secret: 'private-context' } } }))
  expect(resolveNativeName(root, join(root, 'config/_core.yml'), 'prod')).toBe('Parent Name')
  expect(nativeNameEnvironment()).toEqual({ HAI_CORE_NAME: 'Parent Name', HAI_CORE_ENV: 'development' })
})

it('fails on invalid dotenv, missing YAML and blank names, and restores the environment on failure', () => {
  const file = join(root, 'config/_core.yml')
  writeFileSync(join(root, '.env.prod'), 'HAI_CORE_NAME=One\nHAI_CORE_NAME=Two\n')
  expect(() => resolveNativeName(root, file, 'prod')).toThrow()
  rmSync(join(root, '.env.prod'))
  expect(() => resolveNativeName(root, join(root, 'missing.yml'), 'prod')).toThrow()
  writeFileSync(join(root, '.env.prod'), 'HAI_CORE_NAME=" "\nNATIVE_TEST_PRIVATE=private-value\n')
  expect(() => resolveNativeName(root, file, 'prod')).toThrow('HAI_CORE_NAME')
  expect(process.env.HAI_CORE_NAME).toBeUndefined()
  expect(process.env.NATIVE_TEST_PRIVATE).toBeUndefined()
})

it('projects dotenv name and mode for containers without passing the remaining configuration', () => {
  writeFileSync(join(root, '.env.prod'), 'HAI_CORE_NAME=Container Native\nHAI_CORE_ENV=production\nHAI_DB_PASSWORD=private-value\n')
  expect(nativeNameEnvironment(root)).toEqual({ HAI_CORE_NAME: 'Container Native', HAI_CORE_ENV: 'production' })
  expect(process.env.HAI_CORE_NAME).toBeUndefined()
  expect(process.env.HAI_DB_PASSWORD).toBeUndefined()
})

it('keeps the selected native build mode stable across child dotenv loading', () => {
  writeFileSync(join(root, '.env.prod'), 'HAI_CORE_ENV=test\n')
  writeFileSync(join(root, '.env.test'), 'HAI_CORE_NAME=Unrequested Test Name\n')
  expect(nativeNameEnvironment(root)).toEqual({ HAI_CORE_ENV: 'production' })
})

it('keeps repository and generated native scripts identical', () => {
  for (const script of ['native-name.mjs', 'native-name.d.mts', 'run-tauri.mjs']) {
    const template = fileURLToPath(new URL(`../templates/shared/${script}`, import.meta.url))
    const repository = fileURLToPath(new URL(`../../../scripts/${script}`, import.meta.url))
    expect(readFileSync(repository, 'utf8')).toBe(readFileSync(template, 'utf8'))
  }
})

it.each(['dev', 'build', 'bundle'])('tauri %s overrides names while retaining arguments and window settings', (command) => {
  const toolDirectory = join(root, 'node_modules/@tauri-apps/cli')
  mkdirSync(toolDirectory, { recursive: true })
  writeFileSync(join(root, 'package.json'), '{"type":"module"}')
  writeFileSync(join(toolDirectory, 'tauri.js'), 'require("node:fs").writeFileSync("tool-args.json", JSON.stringify(process.argv.slice(2)))')
  mkdirSync(join(root, 'src-tauri'))
  const original = JSON.stringify({ identifier: 'com.example.test', app: { windows: [{ label: 'main', width: 1280 }, { label: 'help', title: 'Help' }] } })
  writeFileSync(join(root, 'src-tauri/tauri.conf.json'), original)
  writeFileSync(join(root, '.env.dev'), 'HAI_CORE_NAME=Development Native\n')
  writeFileSync(join(root, '.env.prod'), 'HAI_CORE_NAME=Production Native\n')
  const runner = fileURLToPath(new URL('../templates/shared/run-tauri.mjs', import.meta.url))
  execFileSync(process.execPath, [runner, '.', 'config/_core.yml', command, '--config', '{"version":"1.2.3"}', '--', 'user-argument'], { cwd: root, windowsHide: true })
  const args: string[] = JSON.parse(readFileSync(join(root, 'tool-args.json'), 'utf8'))
  expect(args.slice(0, 2)).toEqual([command, '--config'])
  const overlay = JSON.parse(args[2]!)
  const name = command === 'dev' ? 'Development Native' : 'Production Native'
  expect(overlay).toEqual({ productName: name, app: { windows: [{ label: 'main', width: 1280, title: name }, { label: 'help', title: 'Help' }] } })
  expect(args.slice(3)).toEqual(['--config', '{"version":"1.2.3"}', '--', 'user-argument'])
  expect(readFileSync(join(root, 'src-tauri/tauri.conf.json'), 'utf8')).toBe(original)
})
