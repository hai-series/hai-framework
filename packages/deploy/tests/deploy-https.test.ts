import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { parseEnv } from 'node:util'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDeploymentPlan, deploy, DeployConfigSchema } from '../src/index.js'

const commands = vi.hoisted(() => [] as string[][])
const imageState = vi.hoisted(() => ({ version: 0, sameIdentity: false }))
vi.mock('../src/container/deploy-command.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/container/deploy-command.js')>()
  return {
    ...original,
    runCommand: async (command: string, args: string[]) => {
      commands.push([command, ...args])
      let stdout = ''
      if (command === 'tar') {
        stdout = execFileSync(command, args, { encoding: 'utf8', windowsHide: true })
      }
      else if (args[0] === 'save') {
        writeFileSync(args[args.indexOf('-o') + 1]!, JSON.stringify({
          reference: args.at(-1),
        }))
      }
      else if (args[0] === 'image' && args[1] === 'inspect') {
        stdout = createHash('sha256').update(imageState.sameIdentity
          ? 'shared-content'
          : args.at(-1) ?? '').update(String(imageState.version)).digest('hex')
      }
      return {
        success: true,
        data: {
          code: 0,
          stdout,
          stderr: '',
          stdoutTruncated: false,
          stderrTruncated: false,
        },
      }
    },
  }
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
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name: 'https-check',
    version: '1.0.0',
    dependencies: {},
    devDependencies: kind === 'ssr'
      ? { '@sveltejs/kit': '1', '@sveltejs/adapter-node': '1' }
      : {},
  }))
  const buildDependencies = kind === 'ssr'
    ? {
        '@sveltejs/kit': { version: '1' },
        '@sveltejs/adapter-node': { version: '1' },
      }
    : {}
  writeFileSync(join(root, 'pnpm-lock.yaml'), JSON.stringify({
    lockfileVersion: '9.0',
    importers: {
      '.': { devDependencies: buildDependencies },
    },
    packages: { '@sveltejs/kit@1': {}, '@sveltejs/adapter-node@1': {} },
    snapshots: { '@sveltejs/kit@1': {}, '@sveltejs/adapter-node@1': {} },
  }))
  if (kind === 'ssr')
    writeFileSync(join(root, 'svelte.config.js'), 'export default {}\n')
  const names = kind === 'fullstack'
    ? ['serv', 'web']
    : [
        kind === 'api'
          ? 'serv'
          : 'web',
      ]
  const images = names.map((name) => {
    const file = `${name}-1.0.0.tar`
    writeFileSync(join(artifacts, file), name)
    return {
      name,
      file,
      imageRef: `localhost/https-${name}:1`,
      containerPort: name === 'web' && kind !== 'ssr'
        ? 8080
        : 3000,
      sha256: createHash('sha256').update(name).digest('hex'),
    }
  })
  writeFileSync(join(artifacts, 'manifest.json'), JSON.stringify({
    version: 5,
    webBasePath: '',
    primaryService: names[0],
    hasWeb: names.includes('web'),
    appVersion: '1.0.0',
    buildId: 'https-1',
    partial: false,
    images,
  }))
  return artifacts
}

it.each(['api', 'fullstack', 'spa', 'ssr'])('已有证书对 %s 使用统一 HTTPS 配置并复制私密附件', async (kind) => {
  const artifacts = project(kind)
  const openssl = process.platform === 'win32' && existsSync('C:/Program Files/Git/usr/bin/openssl.exe')
    ? 'C:/Program Files/Git/usr/bin/openssl.exe'
    : 'openssl'
  execFileSync(openssl, [
    'req',
    '-x509',
    '-newkey',
    'ec',
    '-pkeyopt',
    'ec_paramgen_curve:P-256',
    '-nodes',
    '-keyout',
    join(root, 'key.pem'),
    '-out',
    join(root, 'cert.pem'),
    '-days',
    '1',
    '-subj',
    '/CN=localhost',
    '-addext',
    'subjectAltName=DNS:localhost',
  ], { stdio: 'ignore', windowsHide: true })
  const initialized = await deploy.init({
    provider: {
      type: 'docker-ssh',
      expose: {
        hostPort: 18080,
        https: {
          type: 'files',
          domain: 'localhost',
          certificateFile: 'cert.pem',
          privateKeyFile: 'key.pem',
        },
      },
    },
  })
  expect(initialized.success).toBe(true)
  const result = await deploy.deployApp(root, { environment: 'test', bundleOnly: true, artifactDir: artifacts })
  expect(result.success, result.success ? undefined : result.error.message).toBe(true)
  if (!result.success || !result.data.bundlePath)
    throw new Error('Expected HTTPS deployment bundle')
  const read = (file: string) => execFileSync('tar', ['-xOf', result.data.bundlePath!, `./${file}`], { encoding: 'utf8', windowsHide: true })
  expect(read('.hai/tls/fullchain.pem')).toBe(readFileSync(join(root, 'cert.pem'), 'utf8'))
  expect(createHash('sha256').update(read('.hai/tls/privkey.pem')).digest('hex')).toBe(createHash('sha256').update(readFileSync(join(root, 'key.pem'))).digest('hex'))
  expect(read('.hai/web.conf')).toContain('listen 8443 ssl')
  expect(read('.hai/web.conf')).toContain('return 308 https://localhost$request_uri')
  const guide = readFileSync(join(dirname(result.data.bundlePath), 'README.txt'), 'utf8')
  expect(guide).toContain(`https://localhost:443`)
  expect(guide).toContain(`/releases/${result.data.deploymentId}/.hai/tls/fullchain.pem`)
  expect(guide).not.toContain('BEGIN PRIVATE KEY')
  expect(read('.hai/compose.json')).not.toContain('BEGIN PRIVATE KEY')
  expect(read('apply.sh')).toContain('--cacert "$https_certificates/fullchain.pem"')
  const compose = JSON.parse(read('.hai/compose.json'))
  if (kind === 'ssr') {
    expect(parseEnv(read('config/.env.runtime'))).not.toHaveProperty('ORIGIN')
    expect(compose.services.web.environment.PROTOCOL_HEADER).toBe('x-forwarded-proto')
  }
  if (kind === 'api' || kind === 'fullstack')
    expect(parseEnv(read('config/.env.runtime')).HAI_SERV_CORS_ORIGIN).toBe('https://localhost')
  const entry = compose.services[kind === 'api' || kind === 'ssr'
    ? 'gateway'
    : 'web']
  expect(entry.ports).toContain('443:8443')
  expect(entry.volumes).toContainEqual(expect.stringMatching(/\/tls:\/etc\/nginx\/tls:ro$/))
})

it.each([false, true])('普通 HTTP SSR 使用私有 gateway，计划和发布元数据一致（可信边缘=%s）', async (trustedEdge) => {
  const artifacts = project('ssr')
  writeFileSync(join(root, '.env.test'), 'HAI_CORE_ENV=test\nORIGIN=https://obsolete.example.test\nPROTOCOL_HEADER=x-client-scheme\nHOST_HEADER=x-forwarded-host\nPORT_HEADER=x-forwarded-port\nADDRESS_HEADER=x-client-ip\nXFF_DEPTH=99\n')
  const config = {
    provider: {
      type: 'docker-ssh' as const,
      expose: { hostPort: 18080 },
      trustedEdgeProxies: trustedEdge
        ? ['192.0.2.0/24', '2001:db8::/32']
        : undefined,
    },
  }
  expect(await createDeploymentPlan(root, config, { environment: 'test', artifactDir: artifacts })).toMatchObject({
    success: true,
    data: {
      selected: ['web', 'gateway'],
      containers: ['hai-https-check-test-web', 'hai-https-check-test-gateway'],
    },
  })
  expect((await deploy.init(config)).success).toBe(true)
  const result = await deploy.deployApp(root, { environment: 'test', bundleOnly: true, artifactDir: artifacts })
  expect(result.success, result.success ? undefined : result.error.message).toBe(true)
  if (!result.success || !result.data.bundlePath)
    throw new Error('Expected an HTTP SSR deployment bundle')
  const read = (file: string) => execFileSync('tar', ['-xOf', result.data.bundlePath!, `./${file}`], { encoding: 'utf8', windowsHide: true })
  const compose = JSON.parse(read('.hai/compose.json'))
  expect(compose.services.web.ports).toBeUndefined()
  expect(compose.services.web.environment).toMatchObject({
    HAI_DEPLOY_PRIVATE_PROXY: '1',
    PROTOCOL_HEADER: 'x-forwarded-proto',
    HOST_HEADER: 'host',
    PORT_HEADER: '',
    ADDRESS_HEADER: 'x-forwarded-for',
    XFF_DEPTH: '1',
  })
  expect(compose.services.gateway.ports).toEqual(['18080:8080'])
  const runtime = parseEnv(read('config/.env.runtime'))
  for (const name of [
    'ORIGIN',
    'PROTOCOL_HEADER',
    'HOST_HEADER',
    'PORT_HEADER',
    'ADDRESS_HEADER',
    'XFF_DEPTH',
  ])
    expect(runtime).not.toHaveProperty(name)
  const proxy = read('.hai/web.conf')
  for (const directive of [
    'proxy_set_header Host $http_host;',
    'proxy_set_header X-Forwarded-Host $http_host;',
    `proxy_set_header X-Forwarded-Proto ${trustedEdge ? '$hai_request_scheme' : '$scheme'};`,
    'proxy_set_header X-Forwarded-For $remote_addr;',
    'proxy_set_header X-Forwarded-Port "";',
    'proxy_set_header Forwarded "";',
  ])
    expect(proxy).toContain(directive)
  if (trustedEdge) {
    for (const directive of [
      'geo $realip_remote_addr $hai_trusted_edge',
      '192.0.2.0/24 1;',
      '2001:db8::/32 1;',
      'map "$hai_trusted_edge:$http_x_forwarded_proto" $hai_request_scheme',
      'default $scheme;',
      '"1:http" http;',
      '"1:https" https;',
    ])
      expect(proxy).toContain(directive)
  }
  else {
    expect(proxy).not.toMatch(/\$http_(?:x_forwarded|forwarded)/)
  }
  expect(JSON.parse(read('manifest.json')).metadata.layout.trim().split(':')[2]).toBe('gateway')
})

it('let’s Encrypt 交付官方 Certbot 镜像与申请、续期脚本，打包不访问 CA', async () => {
  const artifacts = project('api')
  const initialized = await deploy.init({
    provider: {
      type: 'docker-ssh',
      expose: {
        hostPort: 80,
        https: {
          type: 'letsencrypt',
          domain: 'app.example.test',
          email: 'operator@example.test',
          acceptTerms: true,
        },
      },
    },
  })
  expect(initialized.success).toBe(true)
  const result = await deploy.deployApp(root, { environment: 'test', bundleOnly: true, artifactDir: artifacts })
  expect(result.success, result.success ? undefined : result.error.message).toBe(true)
  if (!result.success || !result.data.bundlePath)
    throw new Error('Expected Certbot deployment bundle')
  const read = (file: string) => execFileSync('tar', ['-xOf', result.data.bundlePath!, `./${file}`], { encoding: 'utf8', windowsHide: true })
  expect(JSON.parse(read('.hai/compose.json')).services.certbot.image).toBe('docker.io/certbot/certbot:v5.9.0')
  expect(read('.hai/prepare-https.sh')).toContain('certonly --webroot')
  expect(read('.hai/renew-https.sh')).toContain('certbot renew')
  const guide = readFileSync(join(dirname(result.data.bundlePath), 'README.txt'), 'utf8')
  expect(guide).toContain('https://app.example.test:443')
  expect(guide).toContain('/https/certificates/app.example.test/fullchain.pem')
  expect(guide).toContain('/https/acme/live/app.example.test')
  expect(read('.hai/proxy-start.sh')).toContain('nginx -t && nginx -s reload')
  expect(commands.some(command => command[1] === 'run')).toBe(false)
  const planned = await createDeploymentPlan(root, {
    provider: {
      type: 'docker-ssh',
      expose: {
        hostPort: 80,
        https: {
          type: 'letsencrypt',
          domain: 'app.example.test',
          email: 'operator@example.test',
          acceptTerms: true,
        },
      },
    },
  }, { environment: 'test', artifactDir: artifacts })
  expect(planned).toMatchObject({
    success: true,
    data: {
      serviceDir: root,
      selected: ['serv', 'gateway', 'certbot'],
      target: {
        https: { type: 'letsencrypt', domain: 'app.example.test', port: 443 },
      },
      composeManagedServices: ['certbot'],
    },
  })
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
  expect((await deploy.init({
    provider: {
      type: 'docker-ssh',
      expose: {
        hostPort: 80,
        https: {
          type: 'letsencrypt',
          domain: 'app.example.test',
          email: 'ops@example.test',
          acceptTerms: true,
        },
      },
    },
  })).success).toBe(true)
  const result = await deploy.deployApp(root, { environment: 'test', bundleOnly: true, artifactDir: artifacts })
  if (!result.success || !result.data.bundlePath)
    throw new Error('Expected alias cache bundle')
  const read = (file: string) => execFileSync('tar', ['-xOf', result.data.bundlePath!, `./${file}`], { encoding: 'utf8', windowsHide: true })
  for (const line of JSON.parse(read('manifest.json')).metadata['image-list'].trim().split('\n')) {
    const [archive, reference] = line.split(' ')
    if (archive?.startsWith('middleware-'))
      expect(JSON.parse(read(`images/${archive}`)).reference).toBe(reference)
  }
  expect(commands.filter(command => command[1] === 'save')).toHaveLength(2)
})

it.each([
  {
    hostPort: 80,
    https: {
      type: 'letsencrypt',
      domain: 'app.example.test',
      email: 'operator@example.test',
      acceptTerms: false,
    },
  },
  {
    hostPort: 8080,
    https: {
      type: 'letsencrypt',
      domain: 'app.example.test',
      email: 'operator@example.test',
      acceptTerms: true,
    },
  },
  {
    hostPort: 443,
    https: {
      type: 'files',
      domain: 'localhost',
      certificateFile: 'cert.pem',
      privateKeyFile: 'key.pem',
    },
  },
  {
    hostPort: 80,
    https: {
      type: 'files',
      domain: 'host; nginx',
      certificateFile: 'cert.pem',
      privateKeyFile: 'key.pem',
    },
  },
])('拒绝 HTTPS 不安全域名、端口冲突和未同意条款', (expose) => {
  expect(DeployConfigSchema.safeParse({
    provider: { type: 'docker-ssh', expose },
  }).success).toBe(false)
})
