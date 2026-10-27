import { Buffer } from 'node:buffer'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { ok } from '@h-ai/core'
import { afterEach, expect, it, vi } from 'vitest'
import { importDeploymentSecrets } from '../src/index.js'

const command = vi.hoisted(() => vi.fn())
vi.mock('../src/container/deploy-command.js', async importOriginal => ({ ...await importOriginal<typeof import('../src/container/deploy-command.js')>(), runCommand: command }))
const roots: string[] = []
afterEach(() => {
  vi.resetAllMocks()
  for (const root of roots.splice(0)) {
    expect(dirname(resolve(root))).toBe(resolve(tmpdir()))
    expect(root).toContain('hai-secret-import-')
    rmSync(root, { recursive: true, force: true })
  }
})

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'hai-secret-import-'))
  roots.push(root)
  const directory = join(root, 'server')
  mkdirSync(directory, { mode: 0o700 })
  const inputFile = join(root, 'private.json')
  const password = 'synthetic #$\'"\\:= @秘密'
  const input = { version: 1, projectName: 'demo-test', credentials: { DB_PASSWORD: password }, services: [{ service: 'db', kind: 'postgresql', container: 'hai-demo-test-db', volumes: ['owned-volume'] }] }
  writeFileSync(inputFile, JSON.stringify(input), { mode: 0o600 })
  command.mockImplementation(async (_runtime: string, args: string[], options: { input?: string }) => {
    let stdout = ''
    if (args[0] === 'inspect')
      stdout = `${JSON.stringify({ 'com.docker.compose.project': 'hai-demo-test', 'com.docker.compose.service': 'db' })}\n${JSON.stringify([{ Type: 'volume', Name: 'owned-volume' }])}\ntrue\n${JSON.stringify({ app: { NetworkID: 'owned-network' } })}\n`
    else if (args[0] === 'exec' && options.input === `${password}\n`)
      stdout = '1\n'
    else return { success: false, error: { code: 'fixture', message: 'verification rejected' } }
    return ok({ code: 0, stdout, stderr: '', stdoutTruncated: false, stderrTruncated: false })
  })
  return { directory, inputFile, input, password }
}

it('默认预检核验实际服务，特殊字符保留且目录、状态和 current 均不变', async () => {
  const { directory, inputFile, password } = fixture()
  const before = readdirSync(directory)
  const result = await importDeploymentSecrets({ directory, inputFile, runtime: 'docker' })
  expect(result).toMatchObject({ success: true, data: { changed: false, stateVersion: 2, groups: ['DB_PASSWORD'], volumes: ['owned-volume'] } })
  expect(JSON.stringify(result)).not.toContain(password)
  expect(readdirSync(directory)).toEqual(before)
  expect(command.mock.calls.some(([, args]) => args.some((arg: string) => arg.includes(password)))).toBe(false)
})

it.each(['password', 'volume', 'project', 'missing'])('预检拒绝 %s，不生成状态、不泄漏私有内容', async (failure) => {
  const { directory, inputFile, input, password } = fixture()
  if (failure === 'password')
    input.credentials.DB_PASSWORD = 'WRONG_SYNTHETIC_PASSWORD'
  if (failure === 'volume')
    input.services[0]!.volumes = ['unrelated-volume']
  if (failure === 'project')
    input.projectName = 'another-project'
  if (failure === 'missing')
    input.services.push({ ...input.services[0]!, service: 'storage', kind: 's3' })
  writeFileSync(inputFile, JSON.stringify(input))
  const result = await importDeploymentSecrets({ directory, inputFile, runtime: 'docker' })
  expect(result.success).toBe(false)
  expect(JSON.stringify(result)).not.toContain(password)
  expect(existsSync(join(directory, 'managed-secrets.env'))).toBe(false)
})

it('损坏或冲突状态保持原样；相同版本化状态可重复预检', async () => {
  const { directory, inputFile, password } = fixture()
  const path = join(directory, 'managed-secrets.env')
  writeFileSync(path, 'FORMAT_VERSION=2\nBROKEN=PRIVATE_SENTINEL\n', { mode: 0o600 })
  expect((await importDeploymentSecrets({ directory, inputFile, runtime: 'docker' })).success).toBe(false)
  expect(readFileSync(path, 'utf8')).toContain('BROKEN=PRIVATE_SENTINEL')
  writeFileSync(path, `FORMAT_VERSION=2\nPROJECT=hai-demo-test\nDB_PASSWORD=${Buffer.from(password).toString('hex')}\nVOLUME_1=DB_PASSWORD:owned-volume\n`)
  expect(await importDeploymentSecrets({ directory, inputFile, runtime: 'docker' })).toMatchObject({ success: true, data: { changed: false } })
})

it.each(['', 'line\nbreak', '\u0000', '\uD800'])('拒绝不能安全往返保存的密码 %#，不触达容器', async (password) => {
  const { directory, inputFile, input } = fixture()
  input.credentials.DB_PASSWORD = password
  writeFileSync(inputFile, JSON.stringify(input))
  expect((await importDeploymentSecrets({ directory, inputFile, runtime: 'docker' })).success).toBe(false)
  expect(command).not.toHaveBeenCalled()
})

it('自定义数据库身份不能仅导入密码后隐式切换为框架默认身份', async () => {
  const { directory, inputFile, input } = fixture()
  writeFileSync(inputFile, JSON.stringify({ ...input, services: [{ ...input.services[0], username: 'business-user' }] }))
  expect((await importDeploymentSecrets({ directory, inputFile, runtime: 'docker' })).success).toBe(false)
  expect(command).not.toHaveBeenCalled()
})

it('podman 默认网络元数据为 null 时仍可用原生数据库客户端认证', async () => {
  const { directory, inputFile } = fixture()
  const original = command.getMockImplementation()!
  command.mockImplementation(async (runtime: string, args: string[], options: { input?: string }) => {
    const result = await original(runtime, args, options)
    if (args[0] === 'inspect')
      result.data.stdout = result.data.stdout.replace('{"app":{"NetworkID":"owned-network"}}', 'null')
    return result
  })
  expect((await importDeploymentSecrets({ directory, inputFile, runtime: 'podman' })).success).toBe(true)
})

it.each([true, false])('mySQL 必须拒绝错误密码，不能将跳过授权校验视为凭据有效：%s', async (enforcesPassword) => {
  const { directory, inputFile, input, password } = fixture()
  input.services[0]!.kind = 'mysql'
  writeFileSync(inputFile, JSON.stringify(input))
  const original = command.getMockImplementation()!
  command.mockImplementation(async (runtime: string, args: string[], options: { input?: string }) => {
    if (args[0] === 'exec' && options.input !== `${password}\n`)
      return enforcesPassword ? { success: false, error: { code: 'fixture', message: 'ERROR 1045 (28000): Access denied' } } : ok({ code: 0, stdout: '1\n', stderr: '', stdoutTruncated: false, stderrTruncated: false })
    return original(runtime, args, options)
  })
  expect((await importDeploymentSecrets({ directory, inputFile, runtime: 'podman' })).success).toBe(enforcesPassword)
})

it.skipIf(process.platform === 'win32')('拒绝公开可读的秘密输入', async () => {
  const { directory, inputFile } = fixture()
  chmodSync(inputFile, 0o644)
  expect((await importDeploymentSecrets({ directory, inputFile, runtime: 'docker' })).success).toBe(false)
  expect(command).not.toHaveBeenCalled()
})

it('lDAP 密码按原始字节交给密码文件输入，不附加换行', async () => {
  const { directory, inputFile, input, password } = fixture()
  writeFileSync(inputFile, JSON.stringify({ ...input, credentials: { LDAP_PASSWORD: password }, services: [{ ...input.services[0], service: 'ldap', kind: 'ldap' }] }))
  const original = command.getMockImplementation()!
  command.mockImplementation(async (runtime: string, args: string[], options: { input?: string }) => {
    if (args[0] === 'exec')
      return options.input === password ? ok({ code: 0, stdout: 'dn:cn=admin,dc=example,dc=org\n', stderr: '', stdoutTruncated: false, stderrTruncated: false }) : { success: false, error: { code: 'fixture', message: 'invalid credentials' } }
    const result = await original(runtime, args, options)
    result.data.stdout = result.data.stdout.replace('"com.docker.compose.service":"db"', '"com.docker.compose.service":"ldap"')
    return result
  })
  expect((await importDeploymentSecrets({ directory, inputFile, runtime: 'podman' })).success).toBe(true)
})
