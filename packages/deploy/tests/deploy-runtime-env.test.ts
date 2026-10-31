import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import { parse } from 'yaml'
import { generateComposeFile, serializeEnvFile } from '../src/container/deploy-container-compose.js'

/** 真实 Node 入口读取实际交付脚本，不在测试中仿造 dotenv 逻辑。 */
function fixture(run: (context: { directory: string, start: () => ReturnType<typeof spawnSync> }) => void): void {
  const directory = mkdtempSync(join(tmpdir(), 'hai-deploy-runtime-env-'))
  const loader = join(directory, 'runtime-env.mjs')
  copyFileSync(new URL('../src/container/deploy-runtime-env.mjs', import.meta.url), loader)
  const configuration = join(directory, 'config')
  mkdirSync(configuration)
  try {
    run({
      directory: configuration,
      start: () => spawnSync(process.execPath, ['--import', pathToFileURL(loader).href, '-e', 'process.stdout.write(JSON.stringify({value:process.env.HAI_RUNTIME_VALUE,removed:process.env.HAI_RUNTIME_REMOVED,db:process.env.HAI_RUNTIME_DB,proxy:process.env.HAI_DEPLOY_PRIVATE_PROXY}))'], { encoding: 'utf8', timeout: 5000, env: { ...process.env, NODE_OPTIONS: undefined, HAI_RUNTIME_VALUE: undefined, HAI_RUNTIME_REMOVED: undefined, HAI_RUNTIME_DB: undefined, HAI_DEPLOY_PRIVATE_PROXY: '1' } }),
    })
  }
  finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

it('重新启动读取唯一运行文件，替换文件也能生效，保留部署代理身份', () => fixture(({ directory, start }) => {
  writeFileSync(join(directory, '.env.runtime'), 'HAI_RUNTIME_VALUE=first\nHAI_RUNTIME_REMOVED=temporary\nHAI_RUNTIME_DB=managed\nHAI_DEPLOY_PRIVATE_PROXY=0\n')
  expect(JSON.parse(String(start().stdout))).toEqual({ value: 'first', removed: 'temporary', db: 'managed', proxy: '1' })
  writeFileSync(join(directory, '.env.runtime.next'), 'HAI_RUNTIME_VALUE=second\nHAI_RUNTIME_DB=updated\n')
  renameSync(join(directory, '.env.runtime.next'), join(directory, '.env.runtime'))
  expect(JSON.parse(String(start().stdout))).toEqual({ value: 'second', db: 'updated', proxy: '1' })
}))

it.each(['ordinary', 'dollar-$-$(not-a-command)', 'both \'single\' and "double" $x', 'line\nwith \' and " quotes', 'a\\path'])('交付值 %s 在真实 Node 加载中保持原样且不执行 shell', value => fixture(({ directory, start }) => {
  writeFileSync(join(directory, '.env.runtime'), serializeEnvFile({ HAI_RUNTIME_VALUE: value }))
  const result = start()
  expect(result.status).toBe(0)
  expect(JSON.parse(String(result.stdout)).value).toBe(value)
}))

it.each(['missing', 'directory', 'oversized', 'duplicate'])('运行文件 %s 时在应用代码前失败且不泄漏内容', kind => fixture(({ directory, start }) => {
  const file = join(directory, '.env.runtime')
  if (kind === 'directory')
    mkdirSync(file)
  if (kind === 'oversized')
    writeFileSync(file, `PRIVATE_MARKER=${'x'.repeat(1024 * 1024)}`)
  const result = start()
  expect(result.status).not.toBe(0)
  expect(String(result.stdout)).toBe('')
  expect(String(result.stderr)).toContain('Runtime environment file')
  expect(String(result.stderr)).not.toContain('PRIVATE_MARKER')
}))

it('后端默认采用只读文件加载，静态 Web 和中间件保持原有方式', () => {
  const sidecar = { services: [], composeServices: {}, volumes: {}, appVolumes: [], env: {}, containerEnv: {}, dependsOn: [], secrets: [] }
  const base = { projectName: 'runtime', appVersion: '1.0.0', imageRef: 'app:1', hostPort: 18080, containerPort: 3000, sidecar }
  const node = parse(generateComposeFile({ ...base, web: { imageRef: 'web:1', containerPort: 8080 } })).services
  expect(node.serv.env_file).toBeUndefined()
  expect(node.serv.environment.NODE_OPTIONS).toContain('--import /run/hai/runtime-env.mjs')
  expect(node.serv.volumes).toContain('./config:/run/hai/config:ro')
  expect(node.web.volumes).not.toContain('./config:/run/hai/config:ro')
  const staticWeb = parse(generateComposeFile({ ...base, primaryService: 'web' })).services.web
  expect(staticWeb.env_file).toEqual(['.env.runtime'])
  const ssr = parse(generateComposeFile({ ...base, primaryService: 'web', nodeRuntime: true })).services.web
  expect(ssr.env_file).toBeUndefined()
})
