import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { expect, it } from 'vitest'
import { createDeploymentJsonTool } from '../src/container/deploy-json.js'

function run(action: string, documents: unknown[], variables: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'hai-deployment-json-'))
  try {
    const program = join(root, 'reader.awk')
    writeFileSync(program, createDeploymentJsonTool())
    const paths = documents.map((document, index) => {
      const path = join(root, `${index}.json`)
      writeFileSync(path, typeof document === 'string' ? document : JSON.stringify(document))
      return path
    })
    const args = ['-v', `action=${action}`, ...Object.entries(variables).flatMap(([key, value]) => ['-v', `${key}=${value}`]), '-f', program, ...paths]
    return spawnSync(process.platform === 'win32' ? 'C:/Program Files/Git/usr/bin/awk.exe' : 'awk', args, { encoding: 'utf8', timeout: 5000, windowsHide: true, env: { ...process.env, LC_ALL: 'C' } })
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
}

it('从包含镜像数组的清单读取多行元数据，保留 Unicode 与引号', () => {
  const value = 'serv /health\nweb /\n下载 😀 "quoted"\n'
  const result = run('read', [{ images: [{ name: 'serv', sha256: 'a'.repeat(64) }], metadata: { health: value } }], { field: 'metadata.health', expected: 'string', multiline: '1', required: '1' })
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout).toBe(`${value}\n`)
})

it('增量快照完整替换选中服务，保留未选服务与命名卷', () => {
  const previous = { services: { serv: { image: 'app:old', volumes: ['obsolete:/old'], environment: { STALE: 'old' } }, web: { image: 'web:old' }, db: { image: 'postgres:16' } }, networks: { app: { driver: 'bridge' } }, volumes: { data: { name: 'retained-data' } } }
  const incoming = { services: { serv: { image: 'app:new', environment: { CURRENT: 'new' } } }, networks: { app: { driver: 'bridge' } }, volumes: { cache: null } }
  const result = run('merge', [previous, incoming])
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toEqual({ ...previous, services: { ...previous.services, serv: incoming.services.serv }, volumes: { data: previous.volumes.data, cache: null } })
})

it('更新代理配置挂载时保留原镜像、TLS 挂载与其他服务', () => {
  const previous = { services: { serv: { image: 'app:current' }, web: { image: 'web:retained', volumes: ['../../old/.hai/web.conf:/etc/nginx/conf.d/default.conf:ro', '/certs:/etc/nginx/tls:ro'] } } }
  const mount = '../../new/.hai/web.conf:/etc/nginx/conf.d/default.conf:ro'
  const result = run('proxy', [previous], { service: 'web', mount })
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toEqual({ services: { ...previous.services, web: { ...previous.services.web, volumes: [mount, '/certs:/etc/nginx/tls:ro'] } } })
})

it.each(['{"a":1,"a":2}', '{"metadata":{"health":"private",}}', '{"a":[1,]}', '{"a":true} trailing'])('拒绝无效 JSON 且不输出私有内容：%s', (document) => {
  const result = run('read', [document], { field: 'metadata.health', expected: 'string', required: '1' })
  expect(result.status).not.toBe(0)
  expect(result.stdout).toBe('')
  expect(result.stderr).not.toContain('private')
})
