import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createDeploymentBundle } from '../src/container/deploy-bundle.js'
import { DeploymentArtifactSchema } from '../src/deploy-artifact.js'
import { ProviderConfigSchema } from '../src/deploy-config.js'

const temporary: string[] = []
const password = ' 0019 synthetic-ssh-only 中 "$value" '

afterEach(() => {
  for (const directory of temporary.splice(0)) {
    if (dirname(directory) !== tmpdir() || !directory.includes('hai-password-bundle-'))
      throw new Error('Unexpected password bundle cleanup path')
    rmSync(directory, { recursive: true, force: true })
  }
})

it.each([undefined, 'key', 'password'] as const)('交付包只保存认证方式和环境引用，SSH密码不进入任何公开文件或tar (%s)', async (auth) => {
  const directory = mkdtempSync(join(tmpdir(), 'hai-password-bundle-'))
  temporary.push(directory)
  const artifactDir = join(directory, 'artifacts')
  mkdirSync(artifactDir)
  writeFileSync(join(artifactDir, 'serv-1.2.3.tar'), 'prebuilt app image')
  const artifact = DeploymentArtifactSchema.parse({ version: 4, primaryService: 'serv', appVersion: '1.2.3', buildId: 'password-test', images: [{ name: 'serv', file: 'serv-1.2.3.tar', imageRef: 'localhost/password-test:1.2.3', sha256: createHash('sha256').update('prebuilt app image').digest('hex') }] })
  const config = ProviderConfigSchema.parse({ type: 'docker-ssh', ssh: { host: '127.0.0.1', username: 'deploy', auth, password }, expose: { hostPort: 3000 } })
  if (config.type !== 'docker-ssh')
    throw new Error('Expected docker SSH configuration')
  writeFileSync(join(directory, 'docker-compose-1.2.3.yml'), 'services:\n  serv:\n    image: localhost/password-test:1.2.3\n    env_file: [.env.runtime]\n')
  writeFileSync(join(directory, '.env.runtime'), 'APP_PUBLIC_LABEL=application\n')
  const result = await createDeploymentBundle({ directory, artifactDir, artifact, config, projectName: 'password-test', deploymentId: 'password-release', environment: 'test', runtime: 'docker', output: join(directory, 'password.tar'), selected: ['serv'], partial: false, middlewareEnv: 'CACHE_PASSWORD=other-secret\n', healthPaths: ['/health'], hasWebProxy: false, containerPort: 3000 })
  const target = JSON.parse(readFileSync(join(directory, 'deploy-target.json'), 'utf8')) as Record<string, unknown>
  expect(target.auth).toBe(auth === 'key' ? 'key' : 'password')
  expect(target.passwordEnv).toBe('HAI_DEPLOY_PROVIDER_SSH_PASSWORD')
  expect(target.password).toBeUndefined()
  const tar = readFileSync(result.bundlePath)
  expect(tar.includes(password)).toBe(false)
  const manifest = execFileSync('tar', ['-xOf', result.bundlePath, './manifest.json'], { encoding: 'utf8', windowsHide: true })
  expect(manifest).not.toContain(password)
  expect(manifest).not.toContain('passwordEnv')
  for (const file of readdirSync(directory).filter(file => /\.(?:json|ps1|sh|txt|awk)$/.test(file)))
    expect(readFileSync(join(directory, file), 'utf8')).not.toContain(password)
})
