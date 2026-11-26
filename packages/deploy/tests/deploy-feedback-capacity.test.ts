import { execFileSync } from 'node:child_process'
import { createECDH, createHash } from 'node:crypto'
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { parseEnv } from 'node:util'
import { apiContract } from '@h-ai/api-contract/feedback'
import { core } from '@h-ai/core'
import { crypto } from '@h-ai/crypto'
import { deploy } from '@h-ai/deploy'
import { afterEach, expect, it, vi } from 'vitest'

vi.mock('../src/container/deploy-command.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/container/deploy-command.js')>()
  return {
    ...original,
    runCommand: async (command: string, args: string[]) => {
      if (command !== 'tar')
        throw new Error('Unexpected engine or network command in read-only fixture')
      const stdout = execFileSync(command, args, { encoding: 'utf8', windowsHide: true, timeout: 5000 })
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

const roots: string[] = []
afterEach(async () => {
  await deploy.close()
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) {
    expect(dirname(resolve(root))).toBe(resolve(tmpdir()))
    expect(root).toContain('hai-review-deployment-')
    rmSync(root, { recursive: true, force: true })
  }
})

function fixture(kit = false) {
  core.logger.setLevel('fatal')
  const root = mkdtempSync(join(tmpdir(), 'hai-review-deployment-'))
  roots.push(root)
  mkdirSync(join(root, 'config'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'review', version: '1.0.0' }))
  writeFileSync(join(root, 'hai.json'), JSON.stringify({
    build: {
      images: [
        { name: 'serv' },
        { name: 'web' },
      ],
    },
  }))
  const names = [
    '@h-ai/crypto',
    '@h-ai/feedback',
    ...(kit
      ? ['@sveltejs/kit']
      : []),
  ]
  writeFileSync(join(root, 'pnpm-lock.yaml'), JSON.stringify({
    lockfileVersion: '9.0',
    importers: {
      '.': {
        dependencies: Object.fromEntries(names.map(name => [
          name,
          { version: '1' },
        ])),
      },
    },
    packages: Object.fromEntries(names.map(name => [`${name}@1`, {}])),
    snapshots: Object.fromEntries(names.map(name => [`${name}@1`, {}])),
  }))
  if (kit)
    writeFileSync(join(root, 'svelte.config.js'), 'export default {}')
  const key = createECDH('SM2')
  key.generateKeys()
  const ring = JSON.stringify({
    activeKeyId: 'review',
    keys: {
      review: {
        publicKey: key.getPublicKey('hex'),
        privateKey: key.getPrivateKey('hex').padStart(64, '0'),
      },
    },
  })
  writeFileSync(join(root, '.env.test'), `HAI_CRYPTO_TRANSPORT_SERVERKEYRING='${ring}'\n`)
  writeFileSync(join(root, 'config/_serv.yml'), 'transport:\n  maxPlaintextBytes: 25165824\nhttp:\n  apiPrefix: /api/v1\n')
  if (kit)
    writeFileSync(join(root, 'config/_kit.yml'), 'transport:\n  maxPlaintextBytes: 25165824\n')
  writeFileSync(join(root, 'config/_feedback.yml'), 'appId: review\nnotification:\n  mode: disabled\nlimits:\n  maxTotalBytes: 8388608\n  maxEvidenceBytes: 2097152\n')
  const artifactDir = join(root, 'artifacts')
  mkdirSync(artifactDir)
  const images = ['serv', 'web'].map((name) => {
    const bytes = `synthetic-${name}-archive`
    const file = `${name}-1.0.0.tar`
    writeFileSync(join(artifactDir, file), bytes)
    return {
      name,
      file,
      imageRef: `localhost/review-${name}:build-review`,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    }
  })
  writeFileSync(join(artifactDir, 'manifest.json'), JSON.stringify({
    version: 5,
    webBasePath: '',
    primaryService: 'serv',
    appVersion: '1.0.0',
    buildId: 'build-review',
    hasWeb: true,
    images,
  }))
  return { root, artifactDir }
}

it.each([false, true])('公开离线包保留较大的显式上限并一致推导代理/Kit 容量，Kit=%s', async (kit) => {
  const { root, artifactDir } = fixture(kit)
  const feedback = apiContract.resolveFeedbackBudget({ maxTotalBytes: 8388608, maxEvidenceBytes: 2097152 })
  expect(feedback.maxTransportBytes).toBe(11250348)
  expect(crypto.transport.resolveBodyLimits(25165824).encryptedPayloadBytes).toBe(50364416)
  expect((await deploy.init({
    provider: {
      type: 'docker-ssh',
      remote: { runtime: 'docker' },
      expose: { hostPort: 18080 },
    },
  })).success).toBe(true)
  const result = await deploy.deployApp(root, {
    environment: 'test',
    envDir: root,
    artifactDir,
    bundleOnly: true,
    skipMiddleware: true,
  })
  expect(result.success, result.success ? undefined : result.error.message).toBe(true)
  if (!result.success || !result.data.bundlePath)
    return
  const proxy = execFileSync('tar', ['-xOf', result.data.bundlePath, './.hai/web.conf'], { encoding: 'utf8', windowsHide: true })
  const lowered = crypto.transport.resolveBodyLimits(feedback.maxTransportBytes).encryptedPayloadBytes
  expect(proxy).toContain('client_max_body_size 50364416;')
  expect(proxy).not.toContain(`client_max_body_size ${lowered};`)
  if (kit) {
    const env = parseEnv(execFileSync('tar', ['-xOf', result.data.bundlePath, './config/.env.runtime'], { encoding: 'utf8', windowsHide: true }))
    expect(env.BODY_SIZE_LIMIT).toBe('50364416')
  }
})

it.each([
  { name: '代理使用嵌套环境覆盖派生容量', evidenceCount: 10000, success: true },
  { name: '代理拒绝运行时不接受的材料限制', evidenceCount: 10001, success: false },
])('$name', async ({ evidenceCount, success }) => {
  const { root, artifactDir } = fixture()
  writeFileSync(join(root, 'config/_serv.yml'), 'transport:\n  maxPlaintextBytes: 1048576\nhttp:\n  apiPrefix: /api/v1\n')
  appendFileSync(join(root, '.env.test'), [
    'HAI_FEEDBACK_LIMITS_MAXTOTALBYTES=16777216',
    `HAI_FEEDBACK_LIMITS_MAXEVIDENCECOUNT=${evidenceCount}`,
    '',
  ].join('\n'))
  expect((await deploy.init({
    provider: {
      type: 'docker-ssh',
      remote: { runtime: 'docker' },
      expose: { hostPort: 18080 },
    },
  })).success).toBe(true)
  const result = await deploy.deployApp(root, {
    environment: 'test',
    envDir: root,
    artifactDir,
    bundleOnly: true,
    skipMiddleware: true,
  })
  expect(result.success, result.success ? undefined : result.error.message).toBe(success)
  if (!result.success)
    return
  expect(result.data.bundlePath).toBeDefined()
  const proxy = execFileSync('tar', ['-xOf', result.data.bundlePath!, './.hai/web.conf'], { encoding: 'utf8', windowsHide: true })
  const feedback = apiContract.resolveFeedbackBudget({ maxTotalBytes: 16777216, maxEvidenceCount: evidenceCount })
  expect(proxy).toContain(`client_max_body_size ${crypto.transport.resolveBodyLimits(feedback.maxTransportBytes).encryptedPayloadBytes};`)
})

it('计划保持远端 Docker，与本地打包 Podman 分离', async () => {
  const { root, artifactDir } = fixture()
  const plan = await deploy.createDeploymentPlan(root, {
    provider: {
      type: 'docker-ssh',
      remote: { runtime: 'docker' },
      expose: { hostPort: 18080 },
    },
  }, {
    environment: 'test',
    envDir: root,
    artifactDir,
    runtime: 'podman',
  })
  expect(plan).toMatchObject({
    success: true,
    data: {
      target: { runtime: 'docker' },
    },
  })
})
