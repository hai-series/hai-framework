/**
 * =============================================================================
 * @hai/cli - 配置模板测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { generateConfigFile } from '../src/commands/config-templates.js'

describe('generateConfigFile', () => {
  it('应该生成 core 配置', () => {
    const content = generateConfigFile('core')
    expect(content).toContain('name: my-app')
    expect(content).toContain('defaultLocale: zh-CN')
    expect(content).toContain('supportedLocales:')
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

  it('应该生成 storage 配置', () => {
    const content = generateConfigFile('storage')
    expect(content).toContain('defaultProvider: local')
    expect(content).toContain('providers:')
  })

  it('应该生成 ai 配置', () => {
    const content = generateConfigFile('ai')
    expect(content).toContain('defaultProvider: openai')
    expect(content).toContain('providers:')
  })

  it('应该为未知模块返回默认配置', () => {
    const content = generateConfigFile('unknown')
    expect(content).toBe('# unknown 配置\n')
  })

  it('生成的 YAML 应该包含环境变量占位符', () => {
    const coreContent = generateConfigFile('core')
    // eslint-disable-next-line no-template-curly-in-string
    expect(coreContent).toContain('${HAI_ENV:development}')

    const dbContent = generateConfigFile('db')
    // eslint-disable-next-line no-template-curly-in-string
    expect(dbContent).toContain('${HAI_DB_DATABASE:./data/app.db}')
  })

  // 自定义配置值测试
  describe('自定义配置值', () => {
    it('core: 应该使用自定义项目名和语言', () => {
      const content = generateConfigFile('core', { core: { name: 'my-admin', defaultLocale: 'en-US' } })
      expect(content).toContain('name: my-admin')
      expect(content).toContain('defaultLocale: en-US')
    })

    it('db: 应该生成 PostgreSQL 配置', () => {
      const content = generateConfigFile('db', { db: { type: 'postgresql', host: '10.0.0.1', port: 5432, database: 'mydb' } })
      expect(content).toContain('type: postgresql')
      expect(content).toContain('host:')
      expect(content).toContain('10.0.0.1')
      expect(content).toContain('port:')
      expect(content).toContain('5432')
      expect(content).toContain('mydb')
      expect(content).not.toContain('# host:')
    })

    it('db: 应该生成 MySQL 配置', () => {
      const content = generateConfigFile('db', { db: { type: 'mysql', host: 'db.example.com', port: 3306 } })
      expect(content).toContain('type: mysql')
      expect(content).toContain('db.example.com')
      expect(content).toContain('3306')
      expect(content).toContain('root')
    })

    it('cache: 应该生成 Redis 配置', () => {
      const content = generateConfigFile('cache', { cache: { type: 'redis', host: 'redis.local', port: 6380 } })
      expect(content).toContain('type: redis')
      expect(content).toContain('redis.local')
      expect(content).toContain('6380')
      expect(content).not.toContain('# host:')
    })

    it('iam: 应该使用自定义登录配置', () => {
      const content = generateConfigFile('iam', { iam: { loginPassword: true, loginOtp: true } })
      expect(content).toContain('password: true')
      expect(content).toContain('otp: true')
    })

    it('storage: 应该生成 S3 配置', () => {
      const content = generateConfigFile('storage', { storage: { type: 's3' } })
      expect(content).toContain('defaultProvider: s3')
      expect(content).not.toContain('defaultProvider: local')
    })

    it('ai: 应该生成 Anthropic 配置', () => {
      const content = generateConfigFile('ai', { ai: { defaultProvider: 'anthropic', model: 'claude-3-opus' } })
      expect(content).toContain('defaultProvider: anthropic')
      expect(content).toContain('claude-3-opus')
    })

    it('ai: 应该生成自定义 Provider 配置', () => {
      const content = generateConfigFile('ai', { ai: { defaultProvider: 'deepseek', model: 'deepseek-chat' } })
      expect(content).toContain('defaultProvider: deepseek')
      expect(content).toContain('deepseek-chat')
      expect(content).toContain('deepseek:')
    })
  })
})
