/** 框架专项配置只通过真实模式文件生效，不提供临时密钥或子进程 env。 */
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { parseEnv } from 'node:util'
import { afterEach, expect, it, vi } from 'vitest'
import { configuredPassword, testServer } from './fixtures/scenarios/test-server.js'

const roots: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  for (const directory of roots.splice(0)) {
    if (path.dirname(directory) !== process.cwd() || !path.basename(directory).startsWith('.tmp-cli-scenarios-'))
      throw new Error('Unexpected scenario cleanup directory')
    await rm(directory, { recursive: true, force: true })
  }
})
async function fixture() {
  const cwd = await mkdtemp(path.join(process.cwd(), '.tmp-cli-scenarios-'))
  roots.push(cwd)
  const data = path.join(cwd, 'test-data')
  await mkdir(data)
  await writeFile(path.join(cwd, 'package.json'), '{"name":"scenario-fixture"}')
  await writeFile(path.join(cwd, '.env.test'), 'HAI_DB_DATABASE=./data/test/app.db\nHAI_IAM_LOGIN_PASSWORD=true\n')
  vi.stubEnv('HAI_E2E_DATA_ROOT', data)
  vi.stubEnv('TEST_WORKER_INDEX', undefined)
  return { cwd, data, command: 'pnpm dev:test' }
}

it('专项输入经实际 dotenv 加载，保留原模块配置并备份文件，不返回子进程环境', async () => {
  const server = await fixture()
  const file = path.join(server.cwd, '.env.test')
  const original = await readFile(file, 'utf8')
  const configured = testServer({ HAI_IAM_PASSWORD_REQUIREINITIALCHANGE: 'true' }, server)
  expect(configured).toBe(server)
  expect(Object.hasOwn(configured, 'env')).toBe(false)
  expect(parseEnv(await readFile(file, 'utf8'))).toMatchObject({
    HAI_DB_DATABASE: path.join(server.data, 'app.db'),
    HAI_IAM_LOGIN_PASSWORD: 'true',
    HAI_IAM_PASSWORD_REQUIREINITIALCHANGE: 'true',
  })
  expect(JSON.parse(await readFile(path.join(server.data, 'environment-backups.json'), 'utf8'))[file]).toBe(original)
  testServer({ HAI_IAM_CAPTCHA_ENABLED: 'true' }, server)
  expect(JSON.parse(await readFile(path.join(server.data, 'environment-backups.json'), 'utf8'))[file]).toBe(original)
})

it('禁止专项夹具提供替代密钥，缺失真实模式文件也不补齐', async () => {
  const server = await fixture()
  expect(() => testServer({ HAI_CRYPTO_TRANSPORT_SERVERKEYRING: '{}' }, server)).toThrow('cannot supply a server keyring')
  await rm(path.join(server.cwd, '.env.test'))
  expect(() => testServer({}, server)).toThrow('must declare its test environment')
})

it('playwright worker 与只收集用例不改写配置', async () => {
  const server = await fixture()
  const file = path.join(server.cwd, '.env.test')
  const original = await readFile(file, 'utf8')
  vi.stubEnv('TEST_WORKER_INDEX', '0')
  testServer({ HAI_IAM_LOGIN_PASSWORD: 'false' }, server)
  expect(await readFile(file, 'utf8')).toBe(original)
  expect(existsSync(path.join(server.data, 'environment-backups.json'))).toBe(false)
})

it('登录用例读取应用的实际私有覆盖，缺失密码直接失败', async () => {
  const server = await fixture()
  await writeFile(path.join(server.cwd, '.env.test'), 'HAI_ADMIN_DEFAULT_PASSWORD=public-test-value\n')
  await writeFile(path.join(server.cwd, '.env.test.local'), 'HAI_ADMIN_DEFAULT_PASSWORD=private-test-value\n')
  vi.spyOn(process, 'cwd').mockReturnValue(server.cwd)
  expect(configuredPassword('HAI_ADMIN_DEFAULT_PASSWORD')).toBe('private-test-value')
  expect(() => configuredPassword('HAI_AUDIT_ADMIN_PASSWORD')).toThrow('Missing actual test configuration')
})
