import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { parseEnv } from 'node:util'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDeploymentPlan, deploy, DeployConfigSchema } from '../src/index.js'

const commands = vi.hoisted(() => [] as string[][])
const imageState = vi.hoisted(() => ({ version: 0, sameIdentity: false }))
vi.mock('../src/container/deploy-command.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/container/deploy-command.js')>()
  return { ...original, runCommand: async (command: string, args: string[]) => {
    commands.push([command, ...args])
    let stdout = ''
    if (command === 'tar')
      stdout = execFileSync(command, args, { encoding: 'utf8', windowsHide: true })
    else if (args[0] === 'save')
      writeFileSync(args[args.indexOf('-o') + 1]!, JSON.stringify({ reference: args.at(-1) }))
    else if (args[0] === 'image' && args[1] === 'inspect')
      stdout = createHash('sha256').update(imageState.sameIdentity ? 'shared-content' : args.at(-1) ?? '').update(String(imageState.version)).digest('hex')
    return { success: true, data: { code: 0, stdout, stderr: '', stdoutTruncated: false, stderrTruncated: false } }
  } }
})

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'hai-https-'))
  commands.length = 0
  imageState.version = 0
  imageState.sameIdentity = false
})
afterEach(async () => {
  await deploy.close()
  rmSync(root, { recursive: true, force: true })
})

function project(kind: string): string {
  const artifacts = join(root, 'artifacts')
  mkdirSync(artifacts)
  mkdirSync(join(root, 'config'))
  writeFileSync(join(root, 'config/_serv.yml'), 'http:\n  apiPrefix: /api/v1\n')
  writeFileSync(join(root, '.env.test'), 'HAI_CORE_ENV=test\n')
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'https-check', version: '1.0.0', dependencies: {}, devDependencies: kind === 'ssr' ? { '@sveltejs/kit': '1', '@sveltejs/adapter-node': '1' } : {} }))
  const buildDependencies = kind === 'ssr' ? { '@sveltejs/kit': { version: '1' }, '@sveltejs/adapter-node': { version: '1' } } : {}
  writeFileSync(join(root, 'pnpm-lock.yaml'), JSON.stringify({ lockfileVersion: '9.0', importers: { '.': { devDependencies: buildDependencies } }, packages: { '@sveltejs/kit@1': {}, '@sveltejs/adapter-node@1': {} }, snapshots: { '@sveltejs/kit@1': {}, '@sveltejs/adapter-node@1': {} } }))
  if (kind === 'ssr')
    writeFileSync(join(root, 'svelte.config.js'), 'export default {}\n')
  const names = kind === 'fullstack' ? ['serv', 'web'] : [kind === 'api' ? 'serv' : 'web']
  const images = names.map((name) => {
    const file = `${name}-1.0.0.tar`
    writeFileSync(join(artifacts, file), name)
    return { name, file, imageRef: `localhost/https-${name}:1`, containerPort: name === 'web' && kind !== 'ssr' ? 8080 : 3000, sha256: createHash('sha256').update(name).digest('hex') }
  })
  writeFileSync(join(artifacts, 'manifest.json'), JSON.stringify({ version: 4, primaryService: names[0], hasWeb: names.includes('web'), appVersion: '1.0.0', buildId: 'https-1', partial: false, images }))
  return artifacts
}

it.each(['api', 'fullstack', 'spa', 'ssr'])('已有证书对 %s 使用统一 HTTPS 配置并复制私密附件', async (kind) => {
  const artifacts = project(kind)
  const openssl = process.platform === 'win32' && existsSync('C:/Program Files/Git/usr/bin/openssl.exe') ? 'C:/Program Files/Git/usr/bin/openssl.exe' : 'openssl'
  execFileSync(openssl, ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes', '-keyout', join(root, 'key.pem'), '-out', join(root, 'cert.pem'), '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost'], { stdio: 'ignore', windowsHide: true })
  const initialized = await deploy.init({ provider: { type: 'docker-ssh', expose: { hostPort: 18080, https: { type: 'files', domain: 'localhost', certificateFile: 'cert.pem', privateKeyFile: 'key.pem' } } } })
  expect(initialized.success).toBe(true)
  const result = await deploy.deployApp(root, { environment: 'test', bundleOnly: true, artifactDir: artifacts })
  expect(result.success, result.success ? undefined : result.error.message).toBe(true)
  if (!result.success || !result.data.bundlePath)
    throw new Error('Expected HTTPS deployment bundle')
  const read = (file: string) => execFileSync('tar', ['-xOf', result.data.bundlePath!, `./${file}`], { encoding: 'utf8', windowsHide: true })
  expect(read('tls/fullchain.pem')).toBe(readFileSync(join(root, 'cert.pem'), 'utf8'))
  expect(createHash('sha256').update(read('tls/privkey.pem')).digest('hex')).toBe(createHash('sha256').update(readFileSync(join(root, 'key.pem'))).digest('hex'))
  expect(read('web.conf')).toContain('listen 8443 ssl')
  expect(read('web.conf')).toContain('return 308 https://localhost$request_uri')
  expect(read('compose.json')).not.toContain('BEGIN PRIVATE KEY')
  expect(read('apply.sh')).toContain('--cacert "$https_certificates/fullchain.pem"')
  const compose = JSON.parse(read('compose.json'))
  if (kind === 'ssr')
    expect(parseEnv(read('.env.runtime')).ORIGIN).toBe('https://localhost')
  if (kind === 'api' || kind === 'fullstack')
    expect(JSON.parse(parseEnv(read('.env.runtime')).HAI_SERV!).cors.origin).toBe('https://localhost')
  const entry = compose.services[kind === 'api' || kind === 'ssr' ? 'gateway' : 'web']
  expect(entry.ports).toContain('443:8443')
  expect(entry.volumes).toContainEqual(expect.stringMatching(/\/tls:\/etc\/nginx\/tls:ro$/))
})

it('let’s Encrypt 交付官方 Certbot 镜像与申请、续期脚本，打包不访问 CA', async () => {
  const artifacts = project('api')
  const initialized = await deploy.init({ provider: { type: 'docker-ssh', expose: { hostPort: 80, https: { type: 'letsencrypt', domain: 'app.example.test', email: 'operator@example.test', acceptTerms: true } } } })
  expect(initialized.success).toBe(true)
  const result = await deploy.deployApp(root, { environment: 'test', bundleOnly: true, artifactDir: artifacts })
  expect(result.success, result.success ? undefined : result.error.message).toBe(true)
  if (!result.success || !result.data.bundlePath)
    throw new Error('Expected Certbot deployment bundle')
  const read = (file: string) => execFileSync('tar', ['-xOf', result.data.bundlePath!, `./${file}`], { encoding: 'utf8', windowsHide: true })
  expect(JSON.parse(read('compose.json')).services.certbot.image).toBe('docker.io/certbot/certbot:v5.9.0')
  expect(read('prepare-https.sh')).toContain('certonly --webroot')
  expect(read('renew-https.sh')).toContain('certbot renew')
  expect(read('https-start.sh')).toContain('nginx -t && nginx -s reload')
  expect(commands.some(command => command[1] === 'run')).toBe(false)
  const planned = await createDeploymentPlan(root, { provider: { type: 'docker-ssh', expose: { hostPort: 80, https: { type: 'letsencrypt', domain: 'app.example.test', email: 'operator@example.test', acceptTerms: true } } } }, { environment: 'test', artifactDir: artifacts })
  expect(planned).toMatchObject({ success: true, data: { serviceDir: root, selected: ['serv', 'gateway', 'certbot'], target: { https: { type: 'letsencrypt', domain: 'app.example.test', port: 443 } }, composeManagedServices: ['certbot'] } })
  const saves = () => commands.filter(command => command[1] === 'save').length
  const firstSaves = saves()
  expect(firstSaves).toBeGreaterThan(0)
  expect((await deploy.deployApp(root, { environment: 'test', bundleOnly: true, artifactDir: artifacts })).success).toBe(true)
  expect(saves()).toBe(firstSaves)
  const cache = join(root, '.hai/cache/images')
  const archive = readdirSync(cache).find(file => file.endsWith('.tar'))!
  writeFileSync(join(cache, archive), 'corrupted cache')
  expect((await deploy.deployApp(root, { environment: 'test', bundleOnly: true, artifactDir: artifacts })).success).toBe(true)
  expect(saves()).toBe(firstSaves + 1)
  imageState.version++
  expect((await deploy.deployApp(root, { environment: 'test', bundleOnly: true, artifactDir: artifacts })).success).toBe(true)
  expect(saves()).toBe(firstSaves * 2 + 1)
})

it('相同内容的不同镜像引用保留各自归档标签，不错误复用缓存', async () => {
  const artifacts = project('api')
  imageState.sameIdentity = true
  expect((await deploy.init({ provider: { type: 'docker-ssh', expose: { hostPort: 80, https: { type: 'letsencrypt', domain: 'app.example.test', email: 'ops@example.test', acceptTerms: true } } } })).success).toBe(true)
  const result = await deploy.deployApp(root, { environment: 'test', bundleOnly: true, artifactDir: artifacts })
  if (!result.success || !result.data.bundlePath)
    throw new Error('Expected alias cache bundle')
  const read = (file: string) => execFileSync('tar', ['-xOf', result.data.bundlePath!, `./${file}`], { encoding: 'utf8', windowsHide: true })
  for (const line of read('image-list').trim().split('\n')) {
    const [archive, reference] = line.split(' ')
    if (archive?.startsWith('middleware-'))
      expect(JSON.parse(read(`images/${archive}`)).reference).toBe(reference)
  }
  expect(commands.filter(command => command[1] === 'save')).toHaveLength(2)
})

it.each([
  { hostPort: 80, https: { type: 'letsencrypt', domain: 'app.example.test', email: 'operator@example.test', acceptTerms: false } },
  { hostPort: 8080, https: { type: 'letsencrypt', domain: 'app.example.test', email: 'operator@example.test', acceptTerms: true } },
  { hostPort: 443, https: { type: 'files', domain: 'localhost', certificateFile: 'cert.pem', privateKeyFile: 'key.pem' } },
  { hostPort: 80, https: { type: 'files', domain: 'host; nginx', certificateFile: 'cert.pem', privateKeyFile: 'key.pem' } },
])('拒绝 HTTPS 不安全域名、端口冲突和未同意条款', (expose) => {
  expect(DeployConfigSchema.safeParse({ provider: { type: 'docker-ssh', expose } }).success).toBe(false)
})
