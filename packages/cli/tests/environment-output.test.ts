/** 真实生成项目的环境覆盖文件必须与当前 Core Schema 一致。 */
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { parseEnv } from 'node:util'
import { core, CoreConfigSchema } from '@h-ai/core'
import { StorageConfigSchema } from '@h-ai/storage'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createProject } from '../src/commands/cli-create.js'
import { loadConfigText } from './helpers/config.js'

const roots: string[] = []

afterEach(async () => {
  vi.unstubAllEnvs()
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== path.resolve(tmpdir()) || !path.basename(root).startsWith('hai-cli-env-output-'))
      throw new Error('Unexpected environment fixture cleanup path')
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    })
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
  for (const [mode, environment, level] of [
    ['dev', 'development', 'debug'],
    ['test', 'test', 'warn'],
    ['prod', 'production', 'info'],
  ]) {
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
    await createProject({
      cwd: root,
      name,
      appType,
      defaults: true,
      install: false,
      git: false,
      deploy: false,
      frontends: ['web'],
      packageManager: 'pnpm',
    })
    const project = path.join(root, name)
    const service = appType === 'api'
      ? path.join(project, 'apps', `${name}-serv`)
      : appType === 'fullstack'
        ? path.join(project, 'packages', `${name}-serv`)
        : project
    await expectProfiles(appType === 'api'
      ? service
      : project, service)
  })
})

describe.skipIf(process.env.HAI_CLI_RUN_ENV_OUTPUT_GATES !== '1')('built environment output gates', () => {
  it.each(['website', 'api', 'fullstack'] as const)('%s 真实输出包含 ACP 配置、环境变量和可读取的接入指南', async (appType) => {
    const root = await fixture()
    const name = `ai-${appType}`
    const created = spawnSync(process.execPath, [
      path.resolve('dist/index.js'),
      '--cwd',
      root,
      'create',
      name,
      '--type',
      appType,
      '--defaults',
      '--no-install',
      '--no-git',
      '--no-deploy',
    ], { encoding: 'utf8', windowsHide: true, timeout: 30_000 })
    expect(created.error).toBeUndefined()
    expect(created.status, created.stderr).toBe(0)
    const project = path.join(root, name)
    const service = appType === 'api'
      ? path.join(project, 'apps', `${name}-serv`)
      : appType === 'fullstack'
        ? path.join(project, 'packages', `${name}-serv`)
        : project
    const config = await readFile(path.join(service, 'config/_ai.yml'), 'utf8')
    expect(config).toContain('# acp:')
    expect(config).toContain('HAI_AI_ACP_AGENTS_0_MODELIDS_0:coding')
    expect(config).toContain('id: coding')
    expect(config).toContain('HAI_AI_LLM_MODELS_2_PROTOCOL:responses')
    expect(config).toContain('HAI_AI_ACP_WORKSPACES_0_REPOSITORIES_0_MAINBRANCH:trunk')
    // 默认工程不接入 AI；按生成 README 的约定去掉一层外层注释后，配置才进入加载结果。
    expect(loadConfigText('ai', config)).toBeNull()
    const enabledConfig = loadConfigText<{ llm: { model: string, protocol: string }, acp?: unknown }>('ai', config.replace(/^# /gm, ''))
    expect(enabledConfig.llm).toMatchObject({ model: 'gpt-4o-mini', protocol: 'chat' })
    expect(enabledConfig.acp).toBeUndefined()
    const env = await readFile(path.join(appType === 'api'
      ? service
      : project, '.env.example'), 'utf8')
    expect(env).toContain('HAI_AI_ACP_AGENTS_0_ID')
    expect(env).toContain('HAI_AI_ACP_WORKSPACES_0_ID')
    expect(env).toContain('HAI_AI_LLM_MODELS_0_CAPABILITIES_CONTEXTWINDOW')
    for (const guide of ['acp.md', 'resources.md']) {
      const text = await readFile(path.join(project, '.agents/skills/hai-ai', guide), 'utf8')
      expect(text).toContain('ai.')
    }
  })

  it('fresh CLI Node 入口生成的 API 环境文件及 S3 前缀和分片选项可由 Core 消费', async () => {
    const root = await fixture()
    const created = spawnSync(process.execPath, [
      path.resolve('dist/index.js'),
      '--cwd',
      root,
      'create',
      'env-binary',
      '--type',
      'api',
      '--defaults',
      '--no-install',
      '--no-git',
      '--no-deploy',
    ], { encoding: 'utf8', windowsHide: true, timeout: 30_000 })
    expect(created.error).toBeUndefined()
    expect(created.status, created.stderr).toBe(0)
    const service = path.join(root, 'env-binary/apps/env-binary-serv')
    await expectProfiles(service, service)
    const storagePath = path.join(service, 'config/_storage.yml')
    const storageYaml = await readFile(storagePath, 'utf8')
    expect(storageYaml).toContain('# prefix: "$' + '{HAI_STORAGE_PREFIX:}"')
    expect(storageYaml).toContain('partSizeBytes: $' + '{HAI_STORAGE_MULTIPART_PARTSIZEBYTES:5242880}')
    const example = await readFile(path.join(service, '.env.example'), 'utf8')
    expect(example).toMatch(/^# HAI_STORAGE_PREFIX=/m)
    expect(example).toMatch(/^HAI_STORAGE_MULTIPART_PARTSIZEBYTES='5242880'$/m)
    expect(example).toMatch(/^HAI_STORAGE_MULTIPART_QUEUESIZE='2'$/m)
    vi.stubEnv('HAI_STORAGE_TYPE', 's3')
    vi.stubEnv('HAI_STORAGE_BUCKET', 'prefix-test')
    vi.stubEnv('HAI_STORAGE_ACCESSKEYID', 'test-key')
    vi.stubEnv('HAI_STORAGE_SECRETACCESSKEY', 'test-secret')
    vi.stubEnv('HAI_STORAGE_PREFIX', 'my-app/uploads')
    vi.stubEnv('HAI_STORAGE_MULTIPART_PARTSIZEBYTES', '8388608')
    vi.stubEnv('HAI_STORAGE_MULTIPART_QUEUESIZE', '3')
    try {
      const config = core.config.load('storage', storagePath, StorageConfigSchema)
      expect(config).toMatchObject({
        success: true,
        data: {
          type: 's3',
          prefix: 'my-app/uploads',
          multipart: { partSizeBytes: 8388608, queueSize: 3 },
        },
      })
    }
    finally {
      core.config.clear('storage')
    }
  })
})
