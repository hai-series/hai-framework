import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { stringify } from 'yaml'
import { deploy } from '../src/index.js'

const roots: string[] = []
afterEach(async () => {
  await deploy.close()
  for (const root of roots.splice(0)) {
    if (path.dirname(root) === path.resolve(tmpdir()) && path.basename(root).startsWith('hai-prefix-deploy-'))
      rmSync(root, { recursive: true, force: true })
  }
})

it.each(['fullstack', 'sveltekit', 'vite'])('子目录部署包记录路径、匹配的健康探测和增量保护，%s', async (kind) => {
  const ssr = kind === 'sveltekit'
  const root = mkdtempSync(path.join(tmpdir(), 'hai-prefix-deploy-'))
  roots.push(root)
  const artifacts = path.join(root, 'artifacts')
  mkdirSync(artifacts)
  mkdirSync(path.join(root, 'config'))
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'prefix-deploy', version: '1.0.0', ...(ssr ? { devDependencies: { '@sveltejs/kit': '^2.0.0' } } : {}) }))
  writeFileSync(path.join(root, 'pnpm-lock.yaml'), stringify({ lockfileVersion: '9.0', importers: { '.': ssr ? { devDependencies: { '@sveltejs/kit': { version: '2.0.0' } } } : {} }, packages: ssr ? { '@sveltejs/kit@2.0.0': {} } : {}, snapshots: ssr ? { '@sveltejs/kit@2.0.0': {} } : {} }))
  writeFileSync(path.join(root, '.env.test'), 'HAI_CORE_ENV=test\n')
  writeFileSync(path.join(root, 'config/_serv.yml'), kind === 'fullstack' ? 'http:\n  apiPrefix: /yyy/sub/api/v1\n  health: {path: /yyy/sub/health, readyPath: /yyy/sub/ready}\n  docs: {path: /yyy/sub/docs}\n  openapi: {path: /yyy/sub/openapi.json}\n' : 'http:\n  apiPrefix: /api/v1\n')
  const images = (kind === 'fullstack' ? ['serv', 'web'] : ['web']).map((name) => {
    const content = `prefix-${name}`
    const file = `${name}-1.0.0.tar`
    writeFileSync(path.join(artifacts, file), content)
    return { name, file, imageRef: `localhost/prefix-${name}:build-1`, sha256: createHash('sha256').update(content).digest('hex'), containerPort: name === 'web' && !ssr ? 8080 : 3000 }
  })
  writeFileSync(path.join(artifacts, 'manifest.json'), JSON.stringify({ version: 5, appVersion: '1.0.0', buildId: 'prefix-build', primaryService: kind === 'fullstack' ? 'serv' : 'web', hasWeb: true, webBasePath: '/yyy/sub', images }))
  expect((await deploy.init({ provider: { type: 'docker-ssh', remote: { runtime: 'docker' }, expose: { hostPort: 18080 } } })).success).toBe(true)
  const bundle = await deploy.deployApp(root, { environment: 'test', bundleOnly: true, artifactDir: artifacts, output: path.join(root, 'prefix.tar') })
  expect(bundle.success, bundle.success ? undefined : bundle.error.message).toBe(true)
  if (!bundle.success || !bundle.data.bundlePath)
    throw new Error('Expected a prefix deployment bundle')
  const read = (file: string) => execFileSync('tar', ['-xOf', bundle.data.bundlePath!, `./${file}`], { encoding: 'utf8', windowsHide: true })
  expect(JSON.parse(read('manifest.json'))).toMatchObject({ webBasePath: '/yyy/sub' })
  expect(JSON.parse(read('manifest.json')).metadata['web-base-path'].trim()).toBe('/yyy/sub')
  expect(JSON.parse(read('manifest.json')).metadata['health-paths'].trim().split(/\r?\n/)).toEqual(ssr ? ['/yyy/sub/'] : kind === 'fullstack' ? ['/yyy/sub/health', '/_hai/web-health', '/yyy/sub/'] : ['/health', '/yyy/sub/'])
  expect(read('apply.sh')).toContain('Web base path changed')
  if (!ssr) {
    expect(read('.hai/web.conf')).toContain('location /yyy/sub/')
    expect(read('.hai/web.conf')).toContain('location = /yyy/sub/runtime-config.js')
    if (kind === 'fullstack') {
      const proxy = read('.hai/web.conf')
      for (const endpoint of ['health', 'ready', 'docs', 'openapi.json', '_hai/scalar.js'])
        expect(proxy).toContain(`location = /yyy/sub/${endpoint} {`)
      expect(proxy).toContain('location /yyy/sub/api/v1/')
      expect(proxy).toContain('location.origin+"/yyy/sub/api/v1"')
      expect(proxy).not.toContain('location = /health {')
      expect(proxy).not.toContain('location /api/v1/')
    }
    if (kind === 'vite')
      expect(read('.hai/web.conf')).toContain('alias /tmp/hai-runtime-config/runtime-config.js;')
  }
  expect(readFileSync(path.join(artifacts, 'manifest.json'), 'utf8')).toContain('prefix-build')
})
