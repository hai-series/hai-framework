/** 通过公开部署包、真实 Nginx 和私有 S3 验证对象字节绕过不可用的应用上游。 */
import type { StartedNetwork, StartedTestContainer } from 'testcontainers'
import { Buffer } from 'node:buffer'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { deploy } from '@h-ai/deploy'
import { storage } from '@h-ai/storage'
import { GenericContainer, Network, Wait } from 'testcontainers'
import { describe, expect, it } from 'vitest'
import { stringify } from 'yaml'

const enabled = process.env.HAI_DEPLOY_E2E === '1'

describe.skipIf(!enabled).sequential('私有 S3 公开下载网关', () => {
  it.each(['minio', 'rustfs'] as const)('%s：全栈、API、SvelteKit 的大文件/Range/上传签名通过 Nginx 直达存储', async (engine) => {
    const root = mkdtempSync(path.join(tmpdir(), 'hai-storage-proxy-'))
    const startedAt = new Date().toISOString()
    let network: StartedNetwork | undefined
    let objectStore: StartedTestContainer | undefined
    let nginx: StartedTestContainer | undefined
    const evidence: Array<Record<string, string | number>> = []
    const failures: unknown[] = []
    let cleanupFailures = 0
    const accessKeyId = randomBytes(12).toString('hex')
    const secretAccessKey = randomBytes(24).toString('hex')
    const bucket = 'business-files'
    let topology = 'setup'
    let phase = 'start containers'
    const requestsAbort = new AbortController()
    const request: typeof fetch = (input, init) => {
      const target = new URL(input instanceof Request ? input.url : input)
      // 仅记录操作和路径，不把签名查询或凭据写进失败诊断。
      phase = `${init?.method ?? 'GET'} ${target.pathname}`
      return fetch(input, { ...init, signal: AbortSignal.any([requestsAbort.signal, init?.signal ?? AbortSignal.timeout(20_000)]) })
    }
    try {
      network = await new Network().start()
      const objectContainer = new GenericContainer(engine === 'minio' ? 'ghcr.io/coollabsio/minio:RELEASE.2025-10-15T17-29-55Z' : 'ghcr.io/rustfs/rustfs:1.0.1')
        .withNetwork(network)
        // 应用端口 3000 故意没有监听者：对象成功而应用 502 证明没有经 Serv 中转。
        .withNetworkAliases('storage', 'serv', 'web')
        .withExposedPorts(9000)
        .withEnvironment(engine === 'minio'
          ? { MINIO_ROOT_USER: accessKeyId, MINIO_ROOT_PASSWORD: secretAccessKey }
          : { RUSTFS_ACCESS_KEY: accessKeyId, RUSTFS_SECRET_KEY: secretAccessKey, RUSTFS_ADDRESS: '0.0.0.0:9000', RUSTFS_VOLUMES: '/data', RUSTFS_CONSOLE_ENABLE: 'false' })
        .withWaitStrategy(Wait.forHttp(engine === 'minio' ? '/minio/health/ready' : '/health/ready', 9000))
        .withStartupTimeout(120_000)
      if (engine === 'minio')
        objectContainer.withCommand(['server', '/data'])
      objectStore = await objectContainer.start()
      writeFileSync(path.join(root, 'resources.json'), JSON.stringify({ network: network.getId(), objectStore: objectStore.getId() }))
      const bytes = randomBytes(5 * 1024 * 1024 + 17)
      const key = '资料 +%/large-file.bin'
      for (const { kind, storageBasePath } of ['fullstack', 'api', 'sveltekit'].flatMap(kind => ['', '/delivery/files.v1'].map(storageBasePath => ({ kind, storageBasePath })))) {
        topology = `${kind}:${storageBasePath || 'root'}`
        const webBasePath = storageBasePath ? '/delivery' : '/portal'
        phase = 'start independent gateway'
        // 每种应用独立部署；不让上一拓扑的保活连接跨越下一次网关重载。
        nginx = await new GenericContainer('docker.io/nginxinc/nginx-unprivileged:1.29.8-alpine')
          .withNetwork(network)
          .withExposedPorts(8080)
          .withWaitStrategy(Wait.forHttp('/', 8080))
          .start()
        writeFileSync(path.join(root, 'resources.json'), JSON.stringify({ network: network.getId(), objectStore: objectStore.getId(), nginx: nginx.getId(), topology }))
        const runtime = (['docker', 'podman'] as const).find(command => spawnSync(command, ['container', 'inspect', nginx!.getId()], { stdio: 'ignore', windowsHide: true, timeout: 10_000 }).status === 0)
        if (!runtime)
          throw new Error('No local CLI can address the owned Nginx fixture')
        const publicOrigin = `http://${nginx.getHost()}:${nginx.getMappedPort(8080)}`
        const publicEndpoint = `${publicOrigin}${storageBasePath}`
        const connected = await storage.init({ type: 's3', bucket, region: 'us-east-1', endpoint: `http://${objectStore.getHost()}:${objectStore.getMappedPort(9000)}`, publicEndpoint, accessKeyId, secretAccessKey, forcePathStyle: true, createBucket: true, prefix: 'private' })
        expect(connected.success).toBe(true)
        expect((await storage.file.put(key, bytes)).success).toBe(true)
        phase = 'build deployment gateway'
        const project = path.join(root, `${kind}-${storageBasePath ? 'prefix' : 'root'}`)
        const artifacts = path.join(project, 'artifacts')
        mkdirSync(artifacts, { recursive: true })
        mkdirSync(path.join(project, 'config'))
        const ssr = kind === 'sveltekit'
        const names = ['@h-ai/storage', ...(ssr ? ['@sveltejs/kit'] : [])]
        writeFileSync(path.join(project, 'package.json'), JSON.stringify({ name: `storage-${kind}`, version: '1.0.0' }))
        writeFileSync(path.join(project, 'pnpm-lock.yaml'), stringify({ lockfileVersion: '9.0', importers: { '.': { dependencies: Object.fromEntries(names.map(name => [name, { version: '1' }])) } }, packages: Object.fromEntries(names.map(name => [`${name}@1`, {}])), snapshots: Object.fromEntries(names.map(name => [`${name}@1`, {}])) }))
        writeFileSync(path.join(project, '.env.test'), 'HAI_CORE_ENV=test\n')
        writeFileSync(path.join(project, 'config/_storage.yml'), stringify({ type: 's3', bucket, publicEndpoint, prefix: 'private' }))
        writeFileSync(path.join(project, 'config/_serv.yml'), 'http:\n  apiPrefix: /backend/v2\n')
        if (ssr)
          writeFileSync(path.join(project, 'svelte.config.js'), 'export default {}')
        const images = (kind === 'fullstack' ? ['serv', 'web'] : [ssr ? 'web' : 'serv']).map((name) => {
          const content = `prebuilt-${kind}-${name}`
          const file = `${name}-1.0.0.tar`
          writeFileSync(path.join(artifacts, file), content)
          return { name, file, imageRef: `localhost/storage-${kind}-${name}:gate-1`, sha256: createHash('sha256').update(content).digest('hex'), containerPort: name === 'web' && !ssr ? 8080 : 3000 }
        })
        writeFileSync(path.join(artifacts, 'manifest.json'), JSON.stringify({ version: kind === 'api' ? 4 : 5, primaryService: ssr ? 'web' : 'serv', appVersion: '1.0.0', buildId: 'storage-gate-1', hasWeb: kind !== 'api', webBasePath: kind === 'api' ? '' : webBasePath, images }))
        expect((await deploy.init({ container: { s3Engine: engine }, provider: { type: 'docker-ssh', remote: { runtime: 'auto' }, expose: { hostPort: 18080 } } })).success).toBe(true)
        const bundle = await deploy.deployApp(project, { environment: 'test', artifactDir: artifacts, bundleOnly: true })
        expect(bundle.success, bundle.success ? undefined : bundle.error.message).toBe(true)
        if (!bundle.success || !bundle.data.bundlePath)
          throw new Error('Expected a storage deployment bundle')
        const proxy = execFileSync('tar', ['-xOf', bundle.data.bundlePath, './.hai/web.conf'], { encoding: 'utf8', windowsHide: true })
        const startup = execFileSync('tar', ['-xOf', bundle.data.bundlePath, './.hai/proxy-start.sh'], { encoding: 'utf8', windowsHide: true })
        // 夹具保留已经运行的 Nginx；执行交付入口钩子后再加载本轮公开配置。
        expect(startup).toContain('/etc/resolv.conf')
        execFileSync(runtime, ['exec', nginx.getId(), 'sh', '-ec', startup], { windowsHide: true, timeout: 20_000 })
        expect(proxy).toContain(`location ^~ ${storageBasePath}/${bucket}/`)
        const configPath = path.join(root, 'web.conf')
        writeFileSync(configPath, proxy)
        execFileSync(runtime, ['cp', configPath, `${nginx.getId()}:/etc/nginx/conf.d/default.conf`], { windowsHide: true, timeout: 20_000 })
        execFileSync(runtime, ['exec', nginx.getId(), 'nginx', '-t'], { windowsHide: true, timeout: 20_000, stdio: 'pipe' })
        execFileSync(runtime, ['exec', nginx.getId(), 'nginx', '-s', 'reload'], { windowsHide: true, timeout: 20_000, stdio: 'pipe' })
        phase = 'wait for gateway reload'
        const healthPath = kind === 'fullstack' ? '/_hai/web-health' : '/_hai/gateway-health'
        await expect.poll(async () => {
          const response = await fetch(`${publicOrigin}${healthPath}`, { signal: AbortSignal.timeout(3000) })
          await response.body?.cancel()
          return response.status
        }, { timeout: 10_000 }).toBe(200)
        const unavailable = await request(`${publicOrigin}${kind === 'fullstack' ? '/backend/v2/unavailable' : `${webBasePath}/unavailable`}`)
        expect(unavailable.status).toBe(502)
        await unavailable.body?.cancel()
        const signed = await storage.presign.getUrl(key, { expiresIn: 60, responseContentDisposition: 'attachment; filename="large-file.bin"' })
        if (!signed.success)
          throw new Error('Expected a presigned download')
        expect(new URL(signed.data).origin).toBe(publicOrigin)
        expect(new URL(signed.data).pathname).toBe(`${storageBasePath}/${bucket}/private/${key.split('/').map(encodeURIComponent).join('/')}`)
        const download = await request(signed.data)
        if (download.status !== 200) {
          const body = await download.text()
          const code = /<Code>([\w.-]+)<\/Code>/.exec(body)?.[1] ?? 'non-S3 response'
          const resource = /<Resource>([^<]*)<\/Resource>/.exec(body)?.[1]?.split('?')[0] ?? ''
          throw new Error(`Object download failed: HTTP ${download.status}, code=${code}, resource=${resource}`)
        }
        expect(download.status).toBe(200)
        expect(download.headers.get('content-security-policy')).toContain('sandbox;')
        expect(download.headers.get('content-security-policy')).toContain('default-src \'none\'')
        expect(download.headers.get('x-content-type-options')).toBe('nosniff')
        expect(download.headers.get('referrer-policy')).toBe('no-referrer')
        expect(download.headers.get('cache-control')).toBe('private, no-store')
        const downloaded = Buffer.from(await download.arrayBuffer())
        const sha256 = createHash('sha256').update(downloaded).digest('hex')
        expect(sha256).toBe(createHash('sha256').update(bytes).digest('hex'))
        expect(download.headers.get('content-disposition')).toContain('large-file.bin')
        const range = await request(signed.data, { headers: { Range: 'bytes=1024-4095' } })
        expect(range.status).toBe(206)
        expect(range.headers.get('content-range')).toBe(`bytes 1024-4095/${bytes.length}`)
        expect(Buffer.from(await range.arrayBuffer())).toEqual(bytes.subarray(1024, 4096))
        const unsigned = new URL(signed.data)
        unsigned.search = ''
        const denied = await request(unsigned)
        expect(denied.status).toBe(403)
        await denied.body?.cancel()
        const tampered = new URL(signed.data)
        const signature = tampered.searchParams.get('X-Amz-Signature')!
        tampered.searchParams.set('X-Amz-Signature', `${signature.slice(0, -1)}${signature.endsWith('0') ? '1' : '0'}`)
        const invalid = await request(tampered)
        expect(invalid.status).toBe(403)
        await invalid.body?.cancel()
        const upload = await storage.presign.putUrl(`upload-${kind}.txt`, { contentType: 'text/plain', expiresIn: 60 })
        if (!upload.success)
          throw new Error('Expected a presigned upload')
        const put = await request(upload.data, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: 'direct signed upload' })
        expect(put.ok).toBe(true)
        await put.body?.cancel()
        expect((await storage.file.get(`upload-${kind}.txt`)).success).toBe(true)
        const expiring = await storage.presign.getUrl(key, { expiresIn: 1 })
        if (!expiring.success)
          throw new Error('Expected an expiring download')
        await new Promise(resolve => setTimeout(resolve, 2200))
        const expired = await request(expiring.data)
        expect(expired.status).toBe(403)
        await expired.body?.cancel()
        evidence.push({ engine, kind, storageBasePath, bytes: downloaded.length, sha256, download: 200, range: 206, unsigned: 403, tampered: 403, expired: 403, application: 502, upload: put.status, contentSecurityPolicy: download.headers.get('content-security-policy') ?? '', contentTypeOptions: download.headers.get('x-content-type-options') ?? '', referrerPolicy: download.headers.get('referrer-policy') ?? '', cacheControl: download.headers.get('cache-control') ?? '' })
        phase = 'stop topology resources'
        await deploy.close()
        expect((await storage.close()).success).toBe(true)
        await nginx.stop()
        nginx = undefined
      }
    }
    catch (error) {
      failures.push(new Error(`Storage proxy ${engine}/${topology} failed during ${phase}`, { cause: error }))
    }
    finally {
      requestsAbort.abort()
      for (const cleanup of [async () => {
        const closed = await storage.close()
        if (!closed.success)
          throw new Error(`Storage cleanup failed: ${closed.error.code}`)
      }, () => deploy.close(), () => nginx?.stop(), () => objectStore?.stop(), () => network?.stop()]) {
        try {
          await cleanup()
        }
        catch (error) {
          cleanupFailures++
          failures.push(error)
        }
      }
      if (path.dirname(root) !== path.resolve(tmpdir()) || !path.basename(root).startsWith('hai-storage-proxy-')) {
        cleanupFailures++
        failures.push(new Error('Unexpected storage gate cleanup path'))
      }
      else if (cleanupFailures === 0) {
        try {
          rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
        }
        catch (error) {
          cleanupFailures++
          failures.push(error)
        }
      }
      if (process.env.HAI_STORAGE_PROXY_EVIDENCE) {
        mkdirSync(process.env.HAI_STORAGE_PROXY_EVIDENCE, { recursive: true })
        writeFileSync(path.join(process.env.HAI_STORAGE_PROXY_EVIDENCE, `${engine}.json`), `${JSON.stringify({ startedAt, topology, phase, evidence, cleanupFailures }, null, 2)}\n`)
      }
    }
    if (failures.length)
      throw new AggregateError(failures, 'Storage proxy gate failed')
  }, 300_000)
})
