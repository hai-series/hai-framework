/**
 * =============================================================================
 * @h-ai/cli - 配置模板测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { generateConfigFile } from '../src/commands/cli-config-templates.js'

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

  it('reach 标准模板数组应可通过配置和环境整体覆盖', () => {
    const config: { templates: unknown[] } = parse(generateConfigFile('reach'))
    expect(config.templates).toEqual([])
  })

  it('应该生成 storage 配置', () => {
    const content = generateConfigFile('storage')
    expect(content).toContain('type: local')
    expect(content).toContain('root: ./data/uploads')
  })

  it('应该生成 ai 配置', () => {
    const content = generateConfigFile('ai')
    expect(content).toContain('llm:')
    expect(content).toContain('model: gpt-4o-mini')
  })

  it('应该为未知模块返回默认配置', () => {
    const content = generateConfigFile('unknown')
    expect(content).toBe('# unknown 配置\n')
  })

  it('生成的 YAML 应该包含可被约定环境变量覆盖的默认值', () => {
    const coreContent = generateConfigFile('core')
    expect(coreContent).toContain('env: development')

    const dbContent = generateConfigFile('db')
    expect(dbContent).toContain('database: ./data/app.db')
    expect(dbContent).not.toContain('${HAI_')
  })

  // 自定义配置值测试
  describe('自定义配置值', () => {
    it('core: 应该使用自定义项目名和语言', () => {
      const content = generateConfigFile('core', { core: { name: 'my-admin', defaultLocale: 'en-US' } })
      expect(content).toContain('name: my-admin')
      expect(content).toContain('defaultLocale: en-US')
    })

    it('core: 应用名称中的引号、冒号和换行应保持为完整配置值', () => {
      const name = 'Operations: "管理台"\n<Workspace>'
      const config: { name: string } = parse(generateConfigFile('core', { core: { name } }))
      expect(config.name).toBe(name)
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
      expect(content).toContain('type: s3')
      expect(content).not.toContain('type: local')
    })

    it('ai: 应该生成 Anthropic 配置', () => {
      const content = generateConfigFile('ai', { ai: { defaultProvider: 'anthropic', model: 'claude-3-opus' } })
      expect(content).toContain('model: claude-3-opus')
    })

    it('ai: 应该生成自定义 Provider 配置', () => {
      const content = generateConfigFile('ai', { ai: { defaultProvider: 'deepseek', model: 'deepseek-chat' } })
      expect(content).toContain('model: deepseek-chat')
    })
  })
})
