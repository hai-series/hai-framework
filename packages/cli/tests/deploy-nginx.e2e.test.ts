/** 用与生产镜像相同的 Nginx 校验公开部署包，普通单测不探测或启动引擎。 */
import type { DeployFixtureCleanupFailure, DeployTestFixture } from './helpers/deploy-container-fixture.js'
import { execFileSync, spawnSync } from 'node:child_process'
import { createECDH, createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { resolveTransportBodyLimits } from '@h-ai/crypto'
import { deploy } from '@h-ai/deploy'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDeployFixtureCleanupReport, createDeployTestFixture, ensureDeployTestBaseImage, executeDeployTestFixture, removeDeployTestFixture } from './helpers/deploy-container-fixture.js'

const enabled = process.env.HAI_DEPLOY_E2E === '1'
let runtime: 'podman' | 'docker'
let root: string
let fixture: DeployTestFixture | undefined

describe.skipIf(!enabled)('部署代理配置（真实 Nginx）', () => {
  beforeAll(async () => {
    const deadline = Date.now() + 90_000
    const selected = (['podman', 'docker'] as const).find(candidate => spawnSync(candidate, ['version'], { windowsHide: true, stdio: 'ignore', timeout: 10_000 }).status === 0)
    if (!selected)
      throw new Error('Nginx gate requires a reachable container engine')
    runtime = selected
    root = mkdtempSync(path.join(tmpdir(), 'hai-deploy-nginx-'))
    const image = 'docker.io/nginxinc/nginx-unprivileged:1.29.8-alpine'
    ensureDeployTestBaseImage(runtime, image, deadline - Date.now(), process.env.HAI_DEPLOY_E2E_MIRROR)
    fixture = await createDeployTestFixture(runtime, image, '', root, undefined, { command: ['sleep', 'infinity'], timeoutMs: deadline - Date.now() })
  }, 120_000)

  afterAll(async () => {
    const failures: DeployFixtureCleanupFailure[] = []
    const report = fixture ? createDeployFixtureCleanupReport(fixture.runId, [fixture], []) : undefined
    try {
      await deploy.close()
    }
    catch (error) {
      failures.push({ stage: 'deploy-close', error })
    }
    try {
      if (fixture)
        removeDeployTestFixture(runtime, fixture)
    }
    catch (error) {
      failures.push({ stage: 'container-remove', error })
    }
    try {
      if (root && path.dirname(root) === path.resolve(tmpdir()) && path.basename(root).startsWith('hai-deploy-nginx-'))
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    }
    catch (error) {
      failures.push({ stage: 'temporary-directory-remove', error })
    }
    try {
      report?.(failures)
    }
    catch (error) {
      failures.push({ stage: 'report-write', error })
    }
    if (failures.length)
      throw new AggregateError(failures.map(failure => failure.error), 'Nginx gate cleanup failed')
  }, 90_000)

  it.each([{ base: '', standalone: false }, { base: '/yyy/sub', standalone: false }, { base: '/yyy/sub.v1-app', standalone: true }])('部署包Nginx配置与实际子目录请求有效：$base standalone=$standalone', async ({ base, standalone }) => {
    await deploy.close()
    const project = path.join(root, `project-${standalone ? 'standalone' : base ? 'prefix' : 'root'}`)
    const artifacts = path.join(project, '.hai/build/docker/release-1')
    mkdirSync(artifacts, { recursive: true })
    mkdirSync(path.join(project, 'config'))
    writeFileSync(path.join(project, 'package.json'), JSON.stringify({ name: 'nginx-config', version: '1.2.3', dependencies: {} }))
    writeFileSync(path.join(project, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\nimporters:\n  .: {}\n')
    writeFileSync(path.join(project, '.env.test'), 'HAI_CORE_ENV=test\n')
    writeFileSync(path.join(project, 'config/_serv.yml'), 'http:\n  apiPrefix: /backend/v2\n')
    const images = (standalone ? ['web'] : ['serv', 'web']).map((name) => {
      const content = `prebuilt-${name}`
      const file = `${name}-1.2.3.tar`
      writeFileSync(path.join(artifacts, file), content)
      return { name, file, imageRef: `localhost/nginx-check-${name}:1`, sha256: createHash('sha256').update(content).digest('hex'), containerPort: name === 'web' ? 8080 : 3000 }
    })
    writeFileSync(path.join(artifacts, 'manifest.json'), JSON.stringify({ version: base ? 5 : 4, primaryService: standalone ? 'web' : 'serv', appVersion: '1.2.3', buildId: 'release-1', hasWeb: true, webBasePath: base, images }))
    expect((await deploy.init({ provider: { type: 'docker-ssh', remote: { runtime }, expose: { hostPort: 18080 } } })).success).toBe(true)
    const bundle = await deploy.deployApp(project, { environment: 'test', bundleOnly: true, artifactDir: artifacts, output: path.join(project, 'proxy.tar') })
    expect(bundle.success, bundle.success ? undefined : bundle.error.message).toBe(true)
    if (!bundle.success || !bundle.data.bundlePath || !fixture)
      throw new Error('Expected an owned Nginx fixture and public deployment bundle')
    const proxy = execFileSync('tar', ['-xOf', bundle.data.bundlePath, './web.conf'], { encoding: 'utf8', windowsHide: true })
    if (!standalone)
      expect(proxy).toContain('location /backend/v2/')
    if (base)
      expect(proxy).toContain(`location ${base}/`)
    // 仅替换夹具不存在的 serv DNS；实际代理指令及缓冲区保持发布包原文，由 Nginx 解析器校验。
    // 静态目录使用本轮可写路径；路由、回退和公开配置指令保持交付包原文。
    const config = `pid /tmp/nginx-test.pid;\nevents {}\nhttp {\ninclude /etc/nginx/mime.types;\n${proxy.replaceAll('http://serv:', 'http://127.0.0.1:').replaceAll('/usr/share/nginx/html', '/tmp/hai-prefix-static').replaceAll('/tmp/hai-runtime-config', '/tmp/hai-prefix-runtime')}\n}\n`
    const source = path.join(root, 'nginx.conf')
    writeFileSync(source, config)
    execFileSync(runtime, ['cp', source, `${fixture.containerId}:/tmp/nginx-test.conf`], { windowsHide: true, timeout: 20_000 })
    // 配置不含秘密；将解析器诊断转到 stdout，避免夹具对普通准备异常的脱敏隐藏真实原因。
    const checked = await executeDeployTestFixture(runtime, fixture, ['sh', '-c', 'nginx -t -c /tmp/nginx-test.conf 2>&1; printf "\\nNGINX_EXIT:%s\\n" "$?"'], { timeoutMs: 20_000 })
    expect(checked).toContain('syntax is ok')
    expect(checked).toContain('test is successful')
    expect(checked).toContain('NGINX_EXIT:0')
    if (base) {
      const staticFiles = path.join(root, 'prefix-static')
      const runtimeFiles = path.join(root, 'prefix-runtime')
      mkdirSync(path.join(staticFiles, 'assets'), { recursive: true })
      mkdirSync(runtimeFiles, { recursive: true })
      writeFileSync(path.join(staticFiles, 'index.html'), `<!doctype html><h1>Prefix ready</h1><script type="module" src="${base}/assets/app.js"></script>`)
      writeFileSync(path.join(staticFiles, 'assets/app.js'), 'globalThis.prefixReady = true;')
      writeFileSync(path.join(runtimeFiles, 'runtime-config.js'), 'globalThis.__HAI_PUBLIC_CONFIG__={apiBase:"https://api.example.invalid/api/v1"};')
      await executeDeployTestFixture(runtime, fixture, ['mkdir', '-p', '/tmp/hai-prefix-static', '/tmp/hai-prefix-runtime'], { timeoutMs: 10_000 })
      execFileSync(runtime, ['cp', `${staticFiles}/.`, `${fixture.containerId}:/tmp/hai-prefix-static`], { windowsHide: true, timeout: 20_000 })
      execFileSync(runtime, ['cp', `${runtimeFiles}/.`, `${fixture.containerId}:/tmp/hai-prefix-runtime`], { windowsHide: true, timeout: 20_000 })
      let started = false
      try {
        await executeDeployTestFixture(runtime, fixture, ['nginx', '-c', '/tmp/nginx-test.conf'], { timeoutMs: 10_000 })
        started = true
        for (const target of [`${base}/`, `${base}/admin/users`]) {
          const body = await executeDeployTestFixture(runtime, fixture, ['wget', '-qO-', `http://127.0.0.1:8080${target}`], { timeoutMs: 10_000 })
          expect(body).toContain('Prefix ready')
        }
        const asset = await executeDeployTestFixture(runtime, fixture, ['wget', '-qO-', `http://127.0.0.1:8080${base}/assets/app.js`], { timeoutMs: 10_000 })
        expect(asset).toContain('globalThis.prefixReady = true')
        const publicConfig = await executeDeployTestFixture(runtime, fixture, ['wget', '-qO-', `http://127.0.0.1:8080${base}/runtime-config.js`], { timeoutMs: 10_000 })
        expect(publicConfig).toContain(standalone ? 'https://api.example.invalid/api/v1' : '/backend/v2')
        const redirect = await executeDeployTestFixture(runtime, fixture, ['sh', '-c', `wget -S -O /dev/null 'http://127.0.0.1:8080${base}?from=gate' 2>&1`], { timeoutMs: 10_000 })
        expect(redirect).toContain(`${base}/?from=gate`)
        const unmounted = await executeDeployTestFixture(runtime, fixture, ['sh', '-c', 'wget -S -O /dev/null http://127.0.0.1:8080/runtime-config.js 2>&1 || true'], { timeoutMs: 10_000 })
        expect(unmounted).toContain('404')
      }
      finally {
        if (started)
          await executeDeployTestFixture(runtime, fixture, ['sh', '-c', 'nginx -s quit -c /tmp/nginx-test.conf; for n in 1 2 3 4 5 6 7 8 9 10; do [ ! -e /tmp/nginx-test.pid ] && exit 0; sleep 0.1; done; exit 1'], { timeoutMs: 10_000 })
      }
    }
  }, 60_000)

  it.each([8 * 1048576, 24 * 1048576])('真实 Nginx 保留 %i 明文容量，反馈不缩容，普通 JSON 边界与超限均符合协议', async (maxPlaintextBytes) => {
    if (!fixture)
      throw new Error('Expected an owned proxy fixture')
    const limits = resolveTransportBodyLimits(maxPlaintextBytes)
    const image = 'docker.io/library/node:24.22.1-bookworm-slim'
    ensureDeployTestBaseImage(runtime, image, 30_000)
    let nodeContainer: string | undefined
    let nginxStarted = false
    const remoteConfig = `/tmp/capacity-nginx-${maxPlaintextBytes}.conf`
    try {
      const project = path.join(root, `capacity-project-${maxPlaintextBytes}`)
      const artifacts = path.join(project, '.hai/build/docker/capacity')
      mkdirSync(artifacts, { recursive: true })
      mkdirSync(path.join(project, 'config'))
      writeFileSync(path.join(project, 'package.json'), JSON.stringify({ name: 'proxy-capacity', version: '1.2.3' }))
      writeFileSync(path.join(project, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\nimporters:\n  .: {}\n')
      writeFileSync(path.join(project, '.env.test'), `HAI_CORE_ENV=test\nHAI_SERV_TRANSPORT_MAXPLAINTEXTBYTES=${maxPlaintextBytes}\n`)
      writeFileSync(path.join(project, 'config/_serv.yml'), `transport:\n  maxPlaintextBytes: \${HAI_SERV_TRANSPORT_MAXPLAINTEXTBYTES:1048576}\n`)
      if (maxPlaintextBytes === 24 * 1048576) {
        writeFileSync(path.join(project, 'pnpm-lock.yaml'), JSON.stringify({ lockfileVersion: '9.0', importers: { '.': { dependencies: { '@h-ai/crypto': { version: '1' }, '@h-ai/feedback': { version: '1' } } } }, packages: { '@h-ai/crypto@1': {}, '@h-ai/feedback@1': {} }, snapshots: { '@h-ai/crypto@1': {}, '@h-ai/feedback@1': {} } }))
        writeFileSync(path.join(project, 'config/_feedback.yml'), 'appId: capacity\nnotificationMode: disabled\nmaxTotalBytes: 8388608\nmaxEvidenceBytes: 2097152\n')
        const key = createECDH('SM2')
        key.generateKeys()
        const ring = JSON.stringify({ activeKeyId: 'fixture', keys: { fixture: { publicKey: key.getPublicKey('hex'), privateKey: key.getPrivateKey('hex').padStart(64, '0') } } })
        writeFileSync(path.join(project, '.env.test.local'), `HAI_CRYPTO_TRANSPORT_SERVERKEYRING='${ring}'\n`, { mode: 0o600 })
      }
      const images = ['serv', 'web'].map((name) => {
        const file = `${name}-1.2.3.tar`
        writeFileSync(path.join(artifacts, file), name)
        return { name, file, imageRef: `localhost/proxy-capacity-${name}:1`, sha256: createHash('sha256').update(name).digest('hex'), containerPort: name === 'web' ? 18080 : 3000 }
      })
      writeFileSync(path.join(artifacts, 'manifest.json'), JSON.stringify({ version: 4, primaryService: 'serv', appVersion: '1.2.3', buildId: 'capacity', hasWeb: true, images }))
      await deploy.close()
      expect((await deploy.init({ provider: { type: 'docker-ssh', remote: { runtime }, expose: { hostPort: 18080 } } })).success).toBe(true)
      const bundle = await deploy.deployApp(project, { environment: 'test', bundleOnly: true, artifactDir: artifacts })
      if (!bundle.success)
        throw new Error(bundle.error.message)
      if (!bundle.data.bundlePath)
        throw new Error('Expected a public deployment bundle')
      const proxy = execFileSync('tar', ['-xOf', bundle.data.bundlePath, './web.conf'], { encoding: 'utf8', windowsHide: true })
      expect(proxy).toContain(`client_max_body_size ${limits.encryptedPayloadBytes};`)
      const source = path.join(root, 'capacity-nginx.conf')
      writeFileSync(source, `pid /tmp/capacity-nginx-${maxPlaintextBytes}.pid;\nevents {}\nhttp {\n${proxy.replaceAll('http://serv:', 'http://127.0.0.1:')}\n}\n`)
      execFileSync(runtime, ['cp', source, `${fixture.containerId}:${remoteConfig}`], { windowsHide: true })
      await executeDeployTestFixture(runtime, fixture, ['nginx', '-c', remoteConfig], { timeoutMs: 15_000 })
      nginxStarted = true
      // Node 与真实 Nginx 共用本次容器网络，不依赖 Windows 宿主回连或外部网络。
      const require = createRequire(import.meta.url)
      const builder = createRequire(require.resolve('tsup')).resolve('esbuild/bin/esbuild')
      const flow = path.join(root, 'transport-flow.mjs')
      const buildArgs = [path.resolve('tests/fixtures/transport-capacity-node.ts'), '--bundle', '--platform=node', '--format=esm', '--target=node22', `--outfile=${flow}`, '--banner:js=import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);']
      // Windows 使用Node启动JS入口；POSIX入口可能已被esbuild优化为原生程序，也可由shebang直接启动。
      execFileSync(process.platform === 'win32' ? process.execPath : builder, process.platform === 'win32' ? [builder, ...buildArgs] : buildArgs, { windowsHide: true, timeout: 15_000 })
      const identity = execFileSync(runtime, ['create', '--network', `container:${fixture.containerId}`, '-e', 'NODE_ENV=test', '-e', `HAI_SERV_TRANSPORT_MAXPLAINTEXTBYTES=${maxPlaintextBytes}`, '--entrypoint', 'node', image, '/tmp/transport-flow.mjs'], { encoding: 'utf8', windowsHide: true, timeout: 15_000 }).trim()
      if (!/^[a-f0-9]{64}$/.test(identity))
        throw new Error('Expected an owned Node container identity')
      nodeContainer = identity
      execFileSync(runtime, ['cp', flow, `${nodeContainer}:/tmp/transport-flow.mjs`], { windowsHide: true, timeout: 15_000 })
      // 24 MiB 场景包含三次真实加解密与代理往返，不能沿用单个 XLSX 的一分钟预算。
      const output = execFileSync(runtime, ['start', '-a', nodeContainer], { encoding: 'utf8', windowsHide: true, timeout: 240_000 })
      expect(output).toContain('TRANSPORT_CAPACITY_PASS')
    }
    finally {
      try {
        if (nodeContainer) {
          execFileSync(runtime, ['rm', '-f', nodeContainer], { windowsHide: true, timeout: 15_000 })
          expect(spawnSync(runtime, ['inspect', nodeContainer], { windowsHide: true, stdio: 'ignore' }).status).not.toBe(0)
        }
      }
      finally {
        if (nginxStarted && fixture)
          await executeDeployTestFixture(runtime, fixture, ['nginx', '-c', remoteConfig, '-s', 'quit'], { timeoutMs: 15_000 })
      }
    }
  }, 300_000)

  it.each([false, true])('真实 Nginx 与私有后端共享客户端 IP，Serv/Kit 策略拒绝不可绕过；信任外层代理=%s', async (trustedEdge) => {
    if (!fixture)
      throw new Error('Expected an owned proxy fixture')
    const image = 'docker.io/library/node:24.22.1-bookworm-slim'
    ensureDeployTestBaseImage(runtime, image, 30_000)
    const expectedIp = trustedEdge ? '198.51.100.10' : '127.0.0.1'
    const project = path.join(root, `access-project-${trustedEdge}`)
    const artifacts = path.join(project, 'artifacts')
    mkdirSync(artifacts, { recursive: true })
    mkdirSync(path.join(project, 'config/security'), { recursive: true })
    writeFileSync(path.join(project, 'package.json'), JSON.stringify({ name: 'request-access-proxy', version: '1.2.3' }))
    writeFileSync(path.join(project, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\nimporters:\n  .: {}\n')
    writeFileSync(path.join(project, '.env.test'), 'HAI_CORE_ENV=test\n')
    writeFileSync(path.join(project, 'config/_serv.yml'), 'http:\n  apiPrefix: /api/v1\n  access: {file: ./config/security/request-access.yml}\n')
    const policy = path.join(project, 'config/security/request-access.yml')
    writeFileSync(policy, `global:\n  allowIps: [${expectedIp}]\nrules:\n  - id: forbidden-path\n    paths: [/api/v1/denied, /api/v1/kit-denied]\n    denyIps: [${expectedIp}]\n`)
    const images = ['serv', 'web'].map((name) => {
      const file = `${name}-1.2.3.tar`
      writeFileSync(path.join(artifacts, file), name)
      return { name, file, imageRef: `localhost/access-${name}:1`, sha256: createHash('sha256').update(name).digest('hex'), containerPort: name === 'web' ? 8080 : 3000 }
    })
    writeFileSync(path.join(artifacts, 'manifest.json'), JSON.stringify({ version: 4, primaryService: 'serv', appVersion: '1.2.3', buildId: 'access', hasWeb: true, images }))
    await deploy.close()
    const initialized = await deploy.init({ provider: { type: 'docker-ssh', remote: { runtime }, expose: { hostPort: 18080 }, trustedEdgeProxies: trustedEdge ? ['127.0.0.1/32'] : [] } })
    expect(initialized.success, initialized.success ? undefined : initialized.error.message).toBe(true)
    const bundle = await deploy.deployApp(project, { environment: 'test', bundleOnly: true, artifactDir: artifacts })
    if (!bundle.success || !bundle.data.bundlePath)
      throw new Error('Expected a request access deployment bundle')
    const proxy = execFileSync('tar', ['-xOf', bundle.data.bundlePath, './web.conf'], { encoding: 'utf8', windowsHide: true })
    const snapshot = execFileSync('tar', ['-xOf', bundle.data.bundlePath, './request-access.yml'], { encoding: 'utf8', windowsHide: true })
    const compose = JSON.parse(execFileSync('tar', ['-xOf', bundle.data.bundlePath, './compose.json'], { encoding: 'utf8', windowsHide: true }))
    const privateProxy = compose.services.serv.environment.HAI_DEPLOY_PRIVATE_PROXY
    expect(privateProxy).toBe('1')
    const address = (await executeDeployTestFixture(runtime, fixture, ['hostname', '-i'], { timeoutMs: 10_000 })).trim().split(/\s+/)[0]!
    expect(address).toMatch(/^\d+\.\d+\.\d+\.\d+$/)
    const config = path.join(project, 'nginx.conf')
    writeFileSync(config, `pid /tmp/request-access-nginx.pid;\nevents {}\nhttp {\n${proxy.replaceAll('http://serv:', `http://${address}:`)}\n}\n`)
    const flow = path.join(project, 'request-access-node.mjs')
    const require = createRequire(import.meta.url)
    const builder = createRequire(require.resolve('tsup')).resolve('esbuild/bin/esbuild')
    const args = [path.resolve('tests/fixtures/request-access-node.ts'), '--bundle', '--platform=node', '--format=esm', '--target=node22', `--outfile=${flow}`, '--banner:js=import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);']
    execFileSync(process.platform === 'win32' ? process.execPath : builder, process.platform === 'win32' ? [builder, ...args] : args, { windowsHide: true, timeout: 20_000, stdio: 'pipe' })
    writeFileSync(policy, snapshot)
    let nodeContainer: string | undefined
    let started = false
    try {
      execFileSync(runtime, ['cp', config, `${fixture.containerId}:/tmp/request-access-nginx.conf`], { windowsHide: true, timeout: 15_000 })
      await executeDeployTestFixture(runtime, fixture, ['nginx', '-c', '/tmp/request-access-nginx.conf'], { timeoutMs: 10_000 })
      started = true
      const identity = execFileSync(runtime, ['create', '--network', `container:${fixture.containerId}`, '-e', 'NODE_ENV=test', '-e', `HAI_DEPLOY_PRIVATE_PROXY=${privateProxy}`, '-e', `HAI_FIXTURE_EXPECTED_IP=${expectedIp}`, '--entrypoint', 'node', image, '/tmp/request-access-node.mjs'], { encoding: 'utf8', windowsHide: true, timeout: 15_000 }).trim()
      if (!/^[a-f\d]{64}$/.test(identity))
        throw new Error('Expected a newly created Node container identity')
      nodeContainer = identity
      execFileSync(runtime, ['cp', flow, `${nodeContainer}:/tmp/request-access-node.mjs`], { windowsHide: true, timeout: 15_000 })
      execFileSync(runtime, ['cp', policy, `${nodeContainer}:/tmp/request-access.yml`], { windowsHide: true, timeout: 15_000 })
      const output = execFileSync(runtime, ['start', '-a', nodeContainer], { encoding: 'utf8', windowsHide: true, timeout: 45_000 })
      expect(output).toContain(`REQUEST_ACCESS_IP_PASS:{"expectedIp":"${expectedIp}"`)
      if (process.env.HAI_AUTH_EVIDENCE_DIR) {
        mkdirSync(process.env.HAI_AUTH_EVIDENCE_DIR, { recursive: true })
        writeFileSync(path.join(process.env.HAI_AUTH_EVIDENCE_DIR, `request-access-ip-${trustedEdge}.json`), JSON.stringify({ verifiedAt: new Date().toISOString(), fixture: 'Real Nginx and Node Fetch hosts; Kit uses a platform event assembled from the real socket', result: JSON.parse(output.split('REQUEST_ACCESS_IP_PASS:')[1]!.trim()) }, null, 2))
      }
    }
    finally {
      try {
        if (nodeContainer) {
          execFileSync(runtime, ['rm', '-f', nodeContainer], { windowsHide: true, timeout: 15_000, stdio: 'pipe' })
          expect(spawnSync(runtime, ['inspect', nodeContainer], { windowsHide: true, stdio: 'ignore', timeout: 10_000 }).status).not.toBe(0)
        }
      }
      finally {
        if (started)
          await executeDeployTestFixture(runtime, fixture, ['nginx', '-c', '/tmp/request-access-nginx.conf', '-s', 'quit'], { timeoutMs: 10_000 })
      }
    }
  }, 120_000)
})
