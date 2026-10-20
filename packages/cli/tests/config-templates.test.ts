/**
 * =============================================================================
 * @h-ai/cli - 配置模板测试
 * =============================================================================
 */

import { CacheConfigSchema } from '@h-ai/cache'
import { CoreConfigSchema } from '@h-ai/core'
import { ReachConfigSchema } from '@h-ai/reach'
import { ReldbConfigSchema } from '@h-ai/reldb'
import { StorageConfigSchema } from '@h-ai/storage'
import { describe, expect, it } from 'vitest'
import { generateConfigFile, generateEnvExample } from '../src/commands/cli-config-templates.js'
import { loadConfigText } from './helpers/config.js'

describe('generateConfigFile', () => {
  it.each([
    ['core', CoreConfigSchema],
    ['db', ReldbConfigSchema],
    ['cache', CacheConfigSchema],
    ['reach', ReachConfigSchema],
    ['storage', StorageConfigSchema],
  ] as const)('%s 默认配置应通过模块公开 Schema 校验', (moduleKey, schema) => {
    expect(schema.safeParse(loadConfigText(moduleKey, generateConfigFile(moduleKey))).success).toBe(true)
  })
  it('应该生成 core 配置', () => {
    const content = generateConfigFile('core')
    expect(content).toContain('name: $' + '{HAI_CORE_NAME:my-app}')
    expect(content).toContain('defaultLocale: $' + '{HAI_CORE_DEFAULTLOCALE:zh-CN}')
    expect(content).not.toContain('supportedLocales:')
  })

  it('应该生成 db 配置', () => {
    const content = generateConfigFile('db')
    expect(content).toContain('type:')
    expect(content).toContain('database:')
    expect(content).toContain('sqlite')
  })

  it('应该生成 cache 配置', () => {
    const content = generateConfigFile('cache')
    expect(content).toContain('type:')
    expect(content).toContain('memory')
  })

  it('应该生成 iam 配置', () => {
    const content = generateConfigFile('iam')
    expect(content).toContain('login:')
    expect(content).toContain('password:')
    expect(content).toContain('session:')
    expect(content).toContain('rbac:')
  })

  it('默认关闭 OTP 登录时仍应保留策略入口，支持只改登录开关后启用', () => {
    const config = loadConfigText<{ login: { otp: boolean }, otp: object }>('iam', generateConfigFile('iam'))
    expect(config.login.otp).toBe(false)
    expect(config.otp).toEqual({})
  })

  it('reach 标准模板数组应可通过配置和环境整体覆盖', () => {
    const config: { templates: unknown[] } = loadConfigText('reach', generateConfigFile('reach'))
    expect(config.templates).toEqual([])
  })

  it('应该生成 storage 配置', () => {
    const content = generateConfigFile('storage')
    expect(content).toContain('type: $' + '{HAI_STORAGE_TYPE:local}')
    expect(content).toContain('root: $' + '{HAI_STORAGE_ROOT:./data/uploads}')
  })

  it('应该生成 ai 配置', () => {
    const content = generateConfigFile('ai')
    expect(content).toContain('llm:')
    expect(content).toContain('model: $' + '{HAI_AI_LLM_MODEL:gpt-4o-mini}')
  })

  it('应该为未知模块返回默认配置', () => {
    const content = generateConfigFile('unknown')
    expect(content).toBe('# unknown 配置\n')
  })

  it('生成的 YAML 应该包含可被约定环境变量覆盖的默认值', () => {
    const coreContent = generateConfigFile('core')
    expect(coreContent).toContain('env: $' + '{HAI_CORE_ENV:development}')

    const dbContent = generateConfigFile('db')
    expect(dbContent).toContain('database: $' + '{HAI_DB_DATABASE:./data/app.db}')
    expect(loadConfigText('db', dbContent)).toMatchObject({ type: 'sqlite', database: './data/app.db' })
  })

  // 自定义配置值测试
  describe('自定义配置值', () => {
    it('core: 应该使用自定义项目名和语言', () => {
      const content = generateConfigFile('core', { core: { name: 'my-admin', defaultLocale: 'en-US' } })
      expect(content).toContain('name: $' + '{HAI_CORE_NAME:my-admin}')
      expect(content).toContain('defaultLocale: $' + '{HAI_CORE_DEFAULTLOCALE:en-US}')
    })

    it('core: 应用名称中的引号、冒号和换行应保持为完整配置值', () => {
      const name = 'Operations: "管理台"\n<Workspace>'
      const config: { name: string } = loadConfigText('core', generateConfigFile('core', { core: { name } }))
      expect(config.name).toBe(name)
    })

    it('db: 应该生成 PostgreSQL 配置', () => {
      const content = generateConfigFile('db', { db: { type: 'postgresql', host: '10.0.0.1', port: 5432, database: 'mydb' } })
      expect(content).toContain('type: $' + '{HAI_DB_TYPE:postgresql}')
      expect(content).toContain('host:')
      expect(content).toContain('10.0.0.1')
      expect(content).toContain('port:')
      expect(content).toContain('5432')
      expect(content).toContain('mydb')
      expect(content).not.toContain('# host:')
    })

    it('db: 应该生成 MySQL 配置', () => {
      const content = generateConfigFile('db', { db: { type: 'mysql', host: 'db.example.com', port: 3306 } })
      expect(content).toContain('type: $' + '{HAI_DB_TYPE:mysql}')
      expect(content).toContain('db.example.com')
      expect(content).toContain('3306')
      expect(content).toContain('root')
    })

    it('cache: 应该生成 Redis 配置', () => {
      const content = generateConfigFile('cache', { cache: { type: 'redis', host: 'redis.local', port: 6380 } })
      expect(content).toContain('type: $' + '{HAI_CACHE_TYPE:redis}')
      expect(content).toContain('redis.local')
      expect(content).toContain('6380')
      expect(content).not.toContain('# host:')
    })

    it('iam: 应该使用自定义登录配置', () => {
      const content = generateConfigFile('iam', { iam: { loginPassword: true, loginOtp: true } })
      expect(content).toContain('password: $' + '{HAI_IAM_LOGIN_PASSWORD:true}')
      expect(content).toContain('otp: $' + '{HAI_IAM_LOGIN_OTP:true}')
    })

    it('storage: 应该生成 S3 配置', () => {
      const content = generateConfigFile('storage', { storage: { type: 's3' } })
      expect(content).toContain('type: $' + '{HAI_STORAGE_TYPE:s3}')
      expect(content).not.toContain('type: $' + '{HAI_STORAGE_TYPE:local}')
    })

    it('ai: 应该生成 Anthropic 配置', () => {
      const content = generateConfigFile('ai', { ai: { defaultProvider: 'anthropic', model: 'claude-3-opus' } })
      expect(content).toContain('model: $' + '{HAI_AI_LLM_MODEL:claude-3-opus}')
    })

    it('ai: 应该生成自定义 Provider 配置', () => {
      const content = generateConfigFile('ai', { ai: { defaultProvider: 'deepseek', model: 'deepseek-chat' } })
      expect(content).toContain('model: $' + '{HAI_AI_LLM_MODEL:deepseek-chat}')
    })
  })
})

describe('generateEnvExample', () => {
  it('完整示例应保留未选择模块的凭据注释，且仅激活选中模块', () => {
    const content = generateEnvExample(['db', 'cache', 'iam', 'storage'], undefined, true)
    expect(content).toContain('# HAI_AI_LLM_APIKEY=')
    expect(content).toContain('# HAI_VECDB_TYPE=\'lancedb\'')
    expect(content).toContain('# HAI_DEPLOY_PROVIDER_TOKEN=')
    expect(content).toContain('# HAI_REACH_PROVIDERS_0_PASS=')
    const activeVariables = content.split('\n').filter(line => line && !line.startsWith('#'))
    expect(activeVariables).toContain('HAI_DB_TYPE=\'sqlite\'')
    expect(activeVariables.some(line => line.startsWith('HAI_AI_'))).toBe(false)
  })

  it('redis 环境变量应与 camelCase 配置路径一致', () => {
    const content = generateEnvExample(['cache'], { cache: { type: 'redis' } })
    expect(content).toContain('HAI_CACHE_CONNECTTIMEOUT=')
    expect(content).toContain('HAI_CACHE_COMMANDTIMEOUT=')
    expect(content).toContain('HAI_CACHE_KEYPREFIX=')
    expect(content).not.toContain('HAI_CACHE_CONNECT_' + 'TIMEOUT')
  })
})
