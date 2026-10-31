import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { core } from '@h-ai/core'
import { expect, it } from 'vitest'
import { createDeploymentBundle } from '../src/container/deploy-bundle.js'
import { DeploymentArtifactSchema } from '../src/deploy-artifact.js'
import { ProviderConfigSchema } from '../src/deploy-config.js'

it('交付包只有入口、配置、镜像、清单与内部目录，应用配置没有第二份覆盖文件', async () => {
  const root = mkdtempSync(join(tmpdir(), 'hai-bundle-layout-'))
  try {
    const artifacts = join(root, 'artifacts')
    mkdirSync(artifacts)
    const content = 'prebuilt image archive'
    writeFileSync(join(artifacts, 'serv-1.0.0.tar'), content)
    const artifact = DeploymentArtifactSchema.parse({ version: 4, primaryService: 'serv', appVersion: '1.0.0', buildId: 'layout-fixture', images: [{ name: 'serv', file: 'serv-1.0.0.tar', imageRef: 'localhost/layout:1.0.0', sha256: createHash('sha256').update(content).digest('hex') }] })
    writeFileSync(join(root, 'docker-compose-1.0.0.yml'), 'services:\n  serv:\n    image: localhost/layout:1.0.0\n    environment:\n      NODE_OPTIONS: --import /run/hai/runtime-env.mjs\n    volumes:\n      - ./config:/run/hai/config:ro\n      - ./runtime-env.mjs:/run/hai/runtime-env.mjs:ro\n')
    const environmentText = core.config.stringifyEnv({ APP_VALUE: 'mixed \'single\' and \"double\"\n中文', HAI_STORAGE_TYPE: 's3', HAI_STORAGE_PUBLICENDPOINT: 'https://files.example.test:8443/files', HAI_STORAGE_SECRETACCESSKEY: 'private-fixture-value' })
    writeFileSync(join(root, '.env.runtime'), environmentText)
    const config = ProviderConfigSchema.parse({ type: 'docker-ssh', ssh: { host: 'example.test', username: 'deploy' }, expose: { hostPort: 3000 } })
    if (config.type !== 'docker-ssh')
      throw new Error('Expected docker SSH configuration')
    const result = await createDeploymentBundle({ directory: root, artifactDir: artifacts, artifact, projectName: 'layout-test', deploymentId: 'layout-001', environment: 'test', config, runtime: 'docker', output: join(root, 'deployment.tar'), selected: ['serv'], partial: false, managedAppKeys: ['HAI_STORAGE'], healthPaths: ['/health'], hasWebConfig: false, containerPort: 3000 })
    const listing = execFileSync('tar', ['-tf', result.bundlePath], { encoding: 'utf8', windowsHide: true }).split(/\r?\n/).map(path => path.replace(/^\.\//, '')).filter(Boolean)
    expect([...new Set(listing.map(path => path.split('/')[0]))].sort()).toEqual(['.hai', 'apply.sh', 'config', 'images', 'manifest.json'])
    expect(listing.some(path => /middleware\.env|compose-entry|proxy-entry|resolve-backend-state|resolve-managed-secrets/.test(path))).toBe(false)
    const extract = (file: string) => execFileSync('tar', ['-xOf', result.bundlePath, `./${file}`], { encoding: 'utf8', windowsHide: true })
    expect(extract('config/.env.runtime')).toBe(environmentText)
    const environment = core.config.parseEnv(extract('config/.env.runtime'))
    expect(environment.HAI_STORAGE).toBeUndefined()
    expect(environment.HAI_STORAGE_PUBLICENDPOINT).toBe('https://files.example.test:8443/files')
    const manifest = JSON.parse(extract('manifest.json'))
    expect(manifest.metadata['health-paths']).toBe('/health\n')
    expect(manifest.metadata['managed-app-keys']).toContain('HAI_STORAGE')
    expect(JSON.stringify(manifest)).not.toContain('private-fixture-value')
    const compose = JSON.parse(extract('.hai/compose.json'))
    expect(compose.services.serv.volumes).toContain('../../../config:/run/hai/config:ro')
    expect(listing).toContain('.hai/SHA256SUMS')
    expect(listing).toContain('.hai/runtime-env.mjs')
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})
