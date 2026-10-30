import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { parse } from 'yaml'
import { generateComposeFile } from '../src/container/deploy-container-compose.js'

it.each(['compose', 'api', 'fullstack'])('%s 探针使用应用的真实 Schema，父对象优先且关闭健康路由时不发送请求', async (source) => {
  const directory = mkdtempSync(join(tmpdir(), 'hai-serv-health-'))
  const requests: string[] = []
  const server = createServer((request, response) => {
    requests.push(request.url ?? '')
    response.statusCode = request.url === '/status' || request.url === '/parent-status' ? 200 : 404
    response.end('ok')
  })
  try {
    mkdirSync(join(directory, 'config'))
    writeFileSync(join(directory, 'config/_core.yml'), 'name: health-probe\nenv: test\nlogging:\n  format: pretty\n')
    writeFileSync(join(directory, 'config/_serv.yml'), 'http:\n  health: { path: /health }\n')
    mkdirSync(join(directory, 'node_modules/@h-ai'), { recursive: true })
    for (const name of ['core', 'serv']) {
      const target = fileURLToPath(new URL(`../../${name}`, import.meta.url))
      symlinkSync(target, join(directory, 'node_modules/@h-ai', name), process.platform === 'win32' ? 'junction' : 'dir')
    }
    let script: string
    if (source === 'compose') {
      const compose = parse(generateComposeFile({ projectName: 'probe', appVersion: '1.0.0', imageRef: 'probe:1', containerPort: 3000, hostPort: 18080, sidecar: { services: [], composeServices: {}, volumes: {}, appVolumes: [], env: {}, containerEnv: {}, dependsOn: [], secrets: [] } }))
      script = compose.services.serv.healthcheck.test.at(-1)
    }
    else {
      const file = resolve(fileURLToPath(new URL('../../cli/templates/apps/', import.meta.url)), source, 'images/serv.Dockerfile.hbs')
      script = /CMD node --input-type=module -e "([^\r\n]+)"/.exec(readFileSync(file, 'utf8'))![1]!
    }
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Expected an owned health probe listener')
    const run = (extra: Record<string, string | undefined>) => new Promise<number | null>((resolve, reject) => {
      const child = spawn(process.execPath, ['--input-type=module', '-e', script], { cwd: directory, env: { ...process.env, NODE_OPTIONS: undefined, HAI_SERV: undefined, HAI_SERV_HTTP_HEALTH: undefined, HAI_SERV_HTTP_HEALTH_PATH: '/status', PORT: String(address.port), ...extra }, stdio: 'ignore', windowsHide: true, timeout: 10_000 })
      child.once('error', reject)
      child.once('exit', resolve)
    })
    expect(await run({})).toBe(0)
    expect(requests.splice(0)).toEqual(['/status'])
    expect(await run({ HAI_SERV: '{"http":{"health":{"path":"/parent-status"}}}' })).toBe(0)
    expect(requests.splice(0)).toEqual(['/parent-status'])
    expect(await run({ HAI_SERV_HTTP_HEALTH: 'false' })).toBe(0)
    expect(requests).toEqual([])
  }
  finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    rmSync(directory, { recursive: true, force: true })
  }
}, 30_000)
