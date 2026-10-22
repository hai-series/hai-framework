import { parseEnv } from 'node:util'
import { CacheConfigSchema } from '@h-ai/cache'
import { ReldbConfigSchema } from '@h-ai/reldb'
import { StorageConfigSchema } from '@h-ai/storage'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { configEnvironmentVariables, moduleEnvironmentVariables, parameterizeConfig, renderEnvironment, runtimeEnvironmentVariables } from '../src/commands/cli-config-environment.js'
import { generateConfigFile, generateEnvExample } from '../src/commands/cli-config-templates.js'
import { loadConfigText } from './helpers/config.js'

afterEach(() => vi.unstubAllEnvs())

describe('environment configuration', () => {
  it('服务端密钥环仅出现在实际服务端入口，不能随客户端 crypto 配置推荐', () => {
    expect(moduleEnvironmentVariables('crypto').some(variable => variable.name === 'HAI_CRYPTO_TRANSPORT_SERVERKEYRING')).toBe(false)
    expect(runtimeEnvironmentVariables('const ring = process.env.HAI_CRYPTO_TRANSPORT_SERVERKEYRING')).toMatchObject([{ name: 'HAI_CRYPTO_TRANSPORT_SERVERKEYRING' }])
  })
  it('同一份数据库 YAML 仅通过环境变量即可切换三种 Provider，并拒绝非法类型/端口', () => {
    const yaml = generateConfigFile('db')
    expect(yaml).toContain('type: $' + '{HAI_DB_TYPE:sqlite}')
    expect(ReldbConfigSchema.parse(loadConfigText('db', yaml)).type).toBe('sqlite')
    for (const type of ['postgresql', 'mysql']) {
      vi.stubEnv('HAI_DB_TYPE', type)
      vi.stubEnv('HAI_DB_DATABASE', 'business')
      vi.stubEnv('HAI_DB_HOST', 'db.internal')
      vi.stubEnv('HAI_DB_PORT', type === 'mysql' ? '3306' : '5432')
      expect(ReldbConfigSchema.parse(loadConfigText('db', yaml))).toMatchObject({ type, host: 'db.internal', database: 'business' })
    }
    vi.stubEnv('HAI_DB_PORT', '70000')
    expect(ReldbConfigSchema.safeParse(loadConfigText('db', yaml)).success).toBe(false)
    vi.stubEnv('HAI_DB_TYPE', 'unsupported')
    expect(ReldbConfigSchema.safeParse(loadConfigText('db', yaml)).success).toBe(false)
  })

  it('缓存和存储的 Provider 连接字段无需改 YAML 即可由环境选择', () => {
    vi.stubEnv('HAI_CACHE_TYPE', 'redis')
    vi.stubEnv('HAI_CACHE_HOST', 'cache.internal')
    expect(CacheConfigSchema.parse(loadConfigText('cache', generateConfigFile('cache')))).toMatchObject({ type: 'redis', host: 'cache.internal' })
    vi.stubEnv('HAI_STORAGE_TYPE', 's3')
    vi.stubEnv('HAI_STORAGE_BUCKET', 'test-bucket')
    vi.stubEnv('HAI_STORAGE_ACCESSKEYID', 'test-key')
    vi.stubEnv('HAI_STORAGE_SECRETACCESSKEY', 'test-secret')
    expect(StorageConfigSchema.parse(loadConfigText('storage', generateConfigFile('storage')))).toMatchObject({ type: 's3', bucket: 'test-bucket' })
  })

  it('真实 dotenv 解析与 core 插值保留含冒号、井号以及看似布尔/数字的字符串', () => {
    const yaml = parameterizeConfig('sample', 'label: "Ops: primary #1"\ncode: "123"\ntext: "false"\nenabled: false\n')
    const environment = renderEnvironment(configEnvironmentVariables('sample', yaml))
    for (const [name, value] of Object.entries(parseEnv(environment)))
      vi.stubEnv(name, value)
    expect(loadConfigText('sample', yaml)).toEqual({ label: 'Ops: primary #1', code: '123', text: 'false', enabled: false })
  })

  it('业务正文/表结构保留原样，运行参数及数组索引生成统一变量和约束', () => {
    const yaml = parameterizeConfig('ai', 'audio:\n  models:\n    - id: asr\n      timeout: 5000\n      baseUrl: https://example.com\n')
    expect(yaml).toContain('id: asr')
    expect(yaml).toContain('$' + '{HAI_AI_AUDIO_MODELS_0_BASEURL:https://example.com}')
    expect(parameterizeConfig('audit', 'userTable: hai_iam_users\n')).toContain('userTable: hai_iam_users')
    const env = generateEnvExample(['db', 'cache'])
    expect(env).toContain('sqlite | postgresql | mysql')
    expect(env).toContain('>= 1；<= 65535')
    expect(env).toContain('HAI_CACHE_CONNECTTIMEOUT=')
  })
})
