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
    expect(dbContent).toContain('${HAI_DB_TYPE:sqlite}')
  })
})
