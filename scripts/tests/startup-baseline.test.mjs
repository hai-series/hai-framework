/** 通过真实 pnpm dev 验证配置缺失、错误与进程退出，不模拟浏览器内部实现。 */
import { execFileSync } from 'node:child_process'
import { createECDH } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, expect, it, vi } from 'vitest'
import { runDefaultDev } from '../../packages/cli/tests/helpers/startup-baseline.mjs'
import * as startupProcesses from '../../packages/cli/tests/helpers/startup-process.mjs'

const roots = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) {
    rmSync(root, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    })
  }
})

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'hai-startup-baseline-'))
  roots.push(root)
  const source = path.join(root, 'source')
  mkdirSync(source)
  writeFileSync(path.join(source, 'package.json'), JSON.stringify({
    name: 'startup-fixture',
    type: 'module',
    scripts: { dev: 'node server.mjs' },
  }))
  return { root, source }
}

it('缺少真实 dev 命令时直接失败并记录未就绪', async () => {
  const { root, source } = fixture()
  writeFileSync(path.join(source, 'package.json'), '{"name":"missing-command"}')
  const evidence = path.join(root, 'evidence')
  await expect(runDefaultDev(source, { evidence })).rejects.toThrow('no dev script')
  expect(JSON.parse(readFileSync(path.join(evidence, 'startup.json'), 'utf8'))).toMatchObject({ ready: false, applicationEnvironmentOverrides: [] })
})

function directoryLink(source, destination) {
  mkdirSync(path.dirname(destination), { recursive: true })
  symlinkSync(source, destination, process.platform === 'win32'
    ? 'junction'
    : 'dir')
}

/** 只依赖真实 Core 加载器和 IAM Schema，避免以自制校验器模仿本次故障。 */
function application() {
  const fixture_ = fixture()
  const { source } = fixture_
  directoryLink(path.resolve('packages/core'), path.join(source, 'node_modules/@h-ai/core'))
  directoryLink(path.resolve('packages/iam'), path.join(source, 'node_modules/@h-ai/iam'))
  directoryLink(path.resolve('packages/crypto'), path.join(source, 'node_modules/@h-ai/crypto'))
  directoryLink(path.resolve('packages/cache'), path.join(source, 'node_modules/@h-ai/cache'))
  mkdirSync(path.join(source, 'config'))
  // eslint-disable-next-line no-template-curly-in-string -- 真实 Core YAML 环境占位符。
  writeFileSync(path.join(source, 'config/_iam.yml'), 'login:\n  ldap: ${HAI_IAM_LOGIN_LDAP:false}\n')
  // eslint-disable-next-line no-template-curly-in-string -- 真实 Core YAML 环境占位符。
  writeFileSync(path.join(source, 'config/_serv.yml'), 'server:\n  host: 127.0.0.1\n  port: ${PORT:3000}\n')
  writeFileSync(path.join(source, '.env'), 'HAI_IAM_LOGIN_LDAP=\'false\'\n')
  const key = createECDH('SM2')
  key.generateKeys()
  const ring = JSON.stringify({
    activeKeyId: 'startup',
    keys: {
      startup: {
        publicKey: key.getPublicKey('hex'),
        privateKey: key.getPrivateKey('hex').padStart(64, '0'),
      },
    },
  })
  const port = execFileSync(process.execPath, ['-e', 'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{process.stdout.write(String(s.address().port));s.close()})'], { encoding: 'utf8', windowsHide: true }).trim()
  writeFileSync(path.join(source, '.env.dev'), `HAI_CORE_ENV=development\nPORT=${port}\nHOST=127.0.0.1\nHAI_CRYPTO_TRANSPORT_SERVERKEYRING='${ring}'\n`)
  // 私有覆盖属于真实开发配置；仅临时工程可读，不能写入证据或改变源文件。
  writeFileSync(path.join(source, '.env.local'), 'HAI_ADMIN_DEFAULT_PASSWORD=Original-Startup-4!\nPRIVATE_FIXTURE=must-stay-in-source\n')
  writeFileSync(path.join(source, 'server.mjs'), `
import { createServer } from 'node:http';
import { core } from '@h-ai/core';
import { IamConfigSchema } from '@h-ai/iam';
import { crypto } from '@h-ai/crypto';
import { cache } from '@h-ai/cache';
if (process.env.HAI_E2E || process.env.HAI_E2E_MOCK) throw new Error('Runtime bypass reached the default command');
const environment = core.config.loadEnvFiles({ mode: 'dev' });
if (!environment.success) throw new Error(environment.error.message);
Object.assign(process.env, environment.data);
core.init({ configDir: './config', configSchemas: { iam: IamConfigSchema } });
const parsed = crypto.transport.parseServerKeyRing(process.env.HAI_CRYPTO_TRANSPORT_SERVERKEYRING);
let ringValid = false;
if (parsed.success) {
  await cache.init({ type: 'memory' });
  await crypto.init();
  const manager = crypto.transport.createServer({ serverKeyRing: parsed.data, keyStore: crypto.transport.createKeyStore({ cache, ttlSeconds: 3600 }) });
  ringValid = manager.success;
  if (manager.success) await manager.data.close();
  await crypto.close();
  await cache.close();
}
const valid = IamConfigSchema.safeParse(core.config.get('iam')).success && ringValid;
process.stdout.write('password=' + process.env.HAI_ADMIN_DEFAULT_PASSWORD + '\\n');
if (parsed.success) process.stdout.write('privateKey=' + parsed.data.keys.startup.privateKey + '\\n');
const server = createServer((_request, response) => { response.statusCode = valid ? 200 : 500; response.end(valid ? 'ready' : 'invalid startup configuration'); });
server.listen(Number(process.env.PORT), process.env.HOST, () => { if (process.argv.includes('vite')) process.stdout.write('Local: http://127.0.0.1:' + server.address().port + '/\\n') });
`)
  return fixture_
}

it('真实默认命令不注入环境、不追加参数，并保留本机私有覆盖与脱敏', async () => {
  const { root, source } = application()
  writeFileSync(path.join(source, '.env.dev'), `${readFileSync(path.join(source, '.env.dev'), 'utf8')}\nHAI_TEST_PASSWORD_MINLENGTH=3\n`)
  writeFileSync(path.join(source, 'server.mjs'), `${readFileSync(path.join(source, 'server.mjs'), 'utf8')}\nprocess.stdout.write('Diagnostic port: 3000\\n')\n`)
  const spawner = vi.spyOn(startupProcesses, 'spawnOwned')
  const before = readFileSync(path.join(source, '.env.local'), 'utf8')
  const evidence = path.join(root, 'evidence')
  await runDefaultDev(source, { evidence, timeoutMs: 30_000 })
  for (const [, , options] of spawner.mock.calls)
    expect(Object.hasOwn(options, 'env')).toBe(false)
  expect(spawner.mock.calls[0][1].slice(-2)).toEqual(['run', 'dev'])
  expect(JSON.parse(readFileSync(path.join(evidence, 'startup.json'), 'utf8'))).toMatchObject({
    ready: true,
    applicationEnvironmentOverrides: [],
    processCleanupConfirmed: true,
  })
  const log = readFileSync(path.join(evidence, 'startup.log'), 'utf8')
  expect(log).toContain('[REDACTED]')
  expect(log).toContain('Diagnostic port: 3000')
  expect(log.includes('Original-Startup-4!')).toBe(false)
  expect(/privateKey=[a-f\d]{64}/.test(log)).toBe(false)
  expect(readFileSync(path.join(source, '.env.local'), 'utf8')).toBe(before)
}, 60_000)

it('注释形式的 Serv 配置只作参考，由真实页面证明应用就绪', async () => {
  const { root, source } = application()
  writeFileSync(path.join(source, 'config/_serv.yml'), '# Optional service configuration reference\n')
  writeFileSync(path.join(source, 'package.json'), JSON.stringify({
    name: 'reference-fixture',
    type: 'module',
    scripts: { dev: 'node server.mjs vite' },
  }))
  const evidence = path.join(root, 'evidence')
  await runDefaultDev(source, { evidence, timeoutMs: 30_000 })
  expect(JSON.parse(readFileSync(path.join(evidence, 'startup.json'), 'utf8'))).toMatchObject({ ready: true, processCleanupConfirmed: true })
}, 60_000)

it.each(['missing', 'invalid-json', 'mismatched-pair'])('开发密钥环 %s 必须由真实应用拒绝', async (kind) => {
  const { root, source } = application()
  const file = path.join(source, '.env.dev')
  let contents = readFileSync(file, 'utf8')
  if (kind === 'missing')
    contents = contents.replace(/^HAI_CRYPTO_TRANSPORT_SERVERKEYRING=.*\n/m, '')
  else if (kind === 'invalid-json')
    contents = contents.replace(/^HAI_CRYPTO_TRANSPORT_SERVERKEYRING=.*$/m, 'HAI_CRYPTO_TRANSPORT_SERVERKEYRING=not-valid-json')
  else
    contents = contents.replace(/"privateKey":"[a-f\d]+"/, `"privateKey":"${'1'.repeat(64)}"`)
  writeFileSync(file, contents)
  const evidence = path.join(root, 'evidence')
  await expect(runDefaultDev(source, { evidence, timeoutMs: 30_000 })).rejects.toThrow('HTTP 500')
  expect(JSON.parse(readFileSync(path.join(evidence, 'startup.json'), 'utf8'))).toMatchObject({ ready: false, processCleanupConfirmed: true })
}, 60_000)

it('真实公共 LDAP 坏配置必须阻止默认启动', async () => {
  const { root, source } = application()
  writeFileSync(path.join(source, '.env'), 'HAI_IAM_LOGIN_LDAP=false\nHAI_IAM_LDAP_BINDPASSWORD=\'\'\n')
  await expect(runDefaultDev(source, {
    evidence: path.join(root, 'evidence'),
    timeoutMs: 30_000,
  })).rejects.toThrow('HTTP 500')
}, 60_000)

it('已配置的合法私有覆盖按真实优先级生效', async () => {
  const { root, source } = application()
  writeFileSync(path.join(source, '.env'), 'HAI_IAM_LOGIN_LDAP=false\nHAI_IAM_LDAP_BINDPASSWORD=\'\'\n')
  writeFileSync(path.join(source, '.env.dev.local'), 'HAI_IAM=\'{}\'\n')
  const evidence = path.join(root, 'evidence')
  await runDefaultDev(source, { evidence, timeoutMs: 30_000 })
  expect(JSON.parse(readFileSync(path.join(evidence, 'startup.json'), 'utf8')).ready).toBe(true)
}, 60_000)

it('取消真实默认命令后停止本轮进程并记录失败', async () => {
  const { root, source } = application()
  const controller = new AbortController()
  const promise = runDefaultDev(source, {
    evidence: path.join(root, 'evidence'),
    signal: controller.signal,
  })
  controller.abort()
  await expect(promise).rejects.toThrow('interrupted')
  expect(JSON.parse(readFileSync(path.join(root, 'evidence/startup.json'), 'utf8'))).toMatchObject({ ready: false, processCleanupConfirmed: true })
}, 60_000)
