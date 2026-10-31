import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDeploymentBundle } from '../src/container/deploy-bundle.js'
import { DeploymentArtifactSchema } from '../src/deploy-artifact.js'
import { ProviderConfigSchema } from '../src/deploy-config.js'

const state = vi.hoisted(() => ({ cached: false, pulled: false, calls: [] as Array<{ args: string[], env?: Record<string, string> }> }))
vi.mock('../src/container/deploy-command.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/container/deploy-command.js')>()
  return { ...original, runCommand: async (command: string, args: string[], options?: { env?: Record<string, string> }) => {
    if (command !== 'docker')
      return original.runCommand(command, args, options)
    state.calls.push({ args, env: options?.env })
    if (args[0] === 'image' && !state.cached && !state.pulled)
      return { success: false as const, error: { code: 'fixture:missing', message: 'Missing image' } }
    if (args[0] === 'pull')
      state.pulled = true
    if (args[0] === 'save')
      writeFileSync(args[args.indexOf('-o') + 1], 'middleware archive with canonical tag')
    return { success: true as const, data: { code: 0, stdout: args[0] === 'image' ? `sha256:${'a'.repeat(64)}` : '', stderr: '', stdoutTruncated: false, stderrTruncated: false } }
  } }
})

let directory: string
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'hai-download-bundle-'))
  state.cached = false
  state.pulled = false
  state.calls = []
})
afterEach(() => rmSync(directory, { recursive: true, force: true }))

async function bundle(): Promise<string> {
  const artifactDir = join(directory, 'artifacts')
  mkdirSync(artifactDir)
  const bytes = 'prebuilt app image'
  writeFileSync(join(artifactDir, 'serv-1.2.3.tar'), bytes)
  const artifact = DeploymentArtifactSchema.parse({ version: 4, primaryService: 'serv', appVersion: '1.2.3', buildId: 'download-test', images: [{ name: 'serv', file: 'serv-1.2.3.tar', imageRef: 'localhost/download-test:1.2.3', sha256: createHash('sha256').update(bytes).digest('hex') }] })
  const config = ProviderConfigSchema.parse({ type: 'docker-ssh', expose: { hostPort: 3000 } })
  if (config.type !== 'docker-ssh')
    throw new Error('Expected docker SSH config')
  writeFileSync(join(directory, 'docker-compose-1.2.3.yml'), 'services:\n  serv:\n    image: localhost/download-test:1.2.3\n    env_file: [.env.runtime]\n  storage:\n    image: ghcr.io/rustfs/rustfs:1.0.1\n    volumes: [storage-data:/data]\nvolumes:\n  storage-data: {}\n')
  writeFileSync(join(directory, '.env.runtime'), 'APP_PUBLIC_LABEL=application\n')
  const result = await createDeploymentBundle({ directory, artifactDir, artifact, config, projectName: 'download-test', deploymentId: 'download-release', environment: 'test', runtime: 'docker', imageSource: { type: 'cn' }, proxy: { mode: 'custom', url: 'http://127.0.0.1:10808' }, output: join(directory, 'download.tar'), selected: ['serv', 'storage'], partial: false, middlewareEnv: '', healthPaths: ['/health'], hasWebConfig: false, containerPort: 3000 })
  return result.bundlePath
}

it('中间件从所选源下载，归档与 Compose 保留原始引用，代理不进入交付包', async () => {
  const path = await bundle()
  expect(state.calls.find(call => call.args[0] === 'pull')).toMatchObject({ args: ['pull', 'ghcr.1ms.run/rustfs/rustfs:1.0.1'], env: { HTTPS_PROXY: 'http://127.0.0.1:10808' } })
  expect(state.calls.some(call => call.args.join(' ') === 'tag ghcr.1ms.run/rustfs/rustfs:1.0.1 ghcr.io/rustfs/rustfs:1.0.1')).toBe(true)
  const compose = execFileSync('tar', ['-xOf', path, './compose.json'], { encoding: 'utf8', windowsHide: true })
  expect(compose).toContain('ghcr.io/rustfs/rustfs:1.0.1')
  expect(compose).not.toContain('ghcr.1ms.run')
  expect(readFileSync(path).includes('http://127.0.0.1:10808')).toBe(false)
})

it('已有原始镜像时复用本地缓存，不请求镜像源', async () => {
  state.cached = true
  await bundle()
  expect(state.calls.some(call => ['pull', 'tag'].includes(call.args[0]))).toBe(false)
})
