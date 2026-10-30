/** 真实生成项目的环境覆盖文件必须与当前 Core Schema 一致。 */
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { parseEnv } from 'node:util'
import { CoreConfigSchema } from '@h-ai/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createProject } from '../src/commands/cli-create.js'
import { loadConfigText } from './helpers/config.js'

const roots: string[] = []

afterEach(async () => {
  vi.unstubAllEnvs()
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== path.resolve(tmpdir()) || !path.basename(root).startsWith('hai-cli-env-output-'))
      throw new Error('Unexpected environment fixture cleanup path')
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})

/** 创建本轮独享目录，不安装依赖或初始化 Git。 */
async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'hai-cli-env-output-'))
  roots.push(root)
  return root
}

/** 将真实输出交给 Core YAML 插值与严格 Schema，验证仍有消费的字段。 */
async function expectProfiles(envRoot: string, configRoot: string): Promise<void> {
  const yaml = await readFile(path.join(configRoot, 'config/_core.yml'), 'utf8')
  for (const [mode, environment, level] of [['dev', 'development', 'debug'], ['test', 'test', 'warn'], ['prod', 'production', 'info']]) {
    const text = await readFile(path.join(envRoot, `.env.${mode}`), 'utf8')
    const values = parseEnv(text)
    expect(text).not.toContain('HAI_CORE_DEBUG')
    expect(values).toMatchObject({ HAI_CORE_ENV: environment, HAI_CORE_LOGGING_LEVEL: level })
    for (const [key, value] of Object.entries(values))
      vi.stubEnv(key, value)
    const config = CoreConfigSchema.parse(loadConfigText('core', yaml))
    expect(config.env).toBe(environment)
    expect(config.logging?.level).toBe(level)
    expect(config).not.toHaveProperty('debug')
  }
}

describe('generated environment profiles', () => {
  it.each(['website', 'api', 'fullstack'] as const)('%s 的 dev/test/prod 文件不再生成无消费的 DEBUG', async (appType) => {
    const root = await fixture()
    const name = `env-${appType}`
    await createProject({ cwd: root, name, appType, defaults: true, install: false, git: false, deploy: false, frontends: ['web'], packageManager: 'pnpm' })
    const project = path.join(root, name)
    const service = appType === 'api' ? path.join(project, 'apps', `${name}-serv`) : appType === 'fullstack' ? path.join(project, 'packages', `${name}-serv`) : project
    await expectProfiles(appType === 'api' ? service : project, service)
  })
})

describe.skipIf(process.env.HAI_CLI_RUN_ENV_OUTPUT_GATES !== '1')('built environment output gates', () => {
  it('fresh CLI Node 入口生成的 API 环境文件可由 Core 消费', async () => {
    const root = await fixture()
    const created = spawnSync(process.execPath, [path.resolve('dist/index.js'), '--cwd', root, 'create', 'env-binary', '--type', 'api', '--defaults', '--no-install', '--no-git', '--no-deploy'], { encoding: 'utf8', windowsHide: true, timeout: 30_000 })
    expect(created.error).toBeUndefined()
    expect(created.status, created.stderr).toBe(0)
    const service = path.join(root, 'env-binary/apps/env-binary-serv')
    await expectProfiles(service, service)
  })
})
