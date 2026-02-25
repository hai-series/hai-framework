/**
 * =============================================================================
 * @h-ai/cli - Utils 测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import {
  createTemplateContext,
  renderTemplate,
  toCamelCase,
  toKebabCase,
  toPascalCase,
  toSnakeCase,
} from '../src/utils.js'

describe('toCamelCase', () => {
  it('应该转换短横线命名', () => {
    expect(toCamelCase('hello-world')).toBe('helloWorld')
  })

  it('应该转换下划线命名', () => {
    expect(toCamelCase('hello_world')).toBe('helloWorld')
  })

  it('应该转换空格分隔', () => {
    expect(toCamelCase('hello world')).toBe('helloWorld')
  })

  it('应该处理已经是驼峰的情况', () => {
    expect(toCamelCase('helloWorld')).toBe('helloWorld')
  })
})

describe('toPascalCase', () => {
  it('应该转换为帕斯卡命名', () => {
    expect(toPascalCase('hello-world')).toBe('HelloWorld')
    expect(toPascalCase('hello_world')).toBe('HelloWorld')
    expect(toPascalCase('hello world')).toBe('HelloWorld')
  })
})

describe('toKebabCase', () => {
  it('应该转换驼峰为短横线', () => {
    expect(toKebabCase('helloWorld')).toBe('hello-world')
  })

  it('应该转换帕斯卡为短横线', () => {
    expect(toKebabCase('HelloWorld')).toBe('hello-world')
  })

  it('应该转换空格为短横线', () => {
    expect(toKebabCase('hello world')).toBe('hello-world')
  })

  it('应该转换下划线为短横线', () => {
    expect(toKebabCase('hello_world')).toBe('hello-world')
  })
})

describe('toSnakeCase', () => {
  it('应该转换驼峰为下划线', () => {
    expect(toSnakeCase('helloWorld')).toBe('hello_world')
  })

  it('应该转换帕斯卡为下划线', () => {
    expect(toSnakeCase('HelloWorld')).toBe('hello_world')
  })

  it('应该转换短横线为下划线', () => {
    expect(toSnakeCase('hello-world')).toBe('hello_world')
  })
})

describe('createTemplateContext', () => {
  it('应该创建完整的模板上下文', () => {
    const context = createTemplateContext('user-profile')

    expect(context.camelCase).toBe('userProfile')
    expect(context.pascalCase).toBe('UserProfile')
    expect(context.kebabCase).toBe('user-profile')
    expect(context.snakeCase).toBe('user_profile')
  })

  it('应该合并额外数据', () => {
    const context = createTemplateContext('test', { projectName: 'my-app' })

    expect(context.projectName).toBe('my-app')
    expect(context.camelCase).toBe('test')
  })
})

describe('renderTemplate', () => {
  it('应该渲染模板变量', () => {
    const template = 'Hello, {{camelCase}}!'
    const context = createTemplateContext('world')

    const result = renderTemplate(template, context)

    expect(result).toBe('Hello, world!')
  })

  it('应该支持 Handlebars 语法', () => {
    const template = `
{{#if showTitle}}
# {{pascalCase}}
{{/if}}
`
    const context = createTemplateContext('test', { showTitle: true })

    const result = renderTemplate(template, context)

    expect(result).toContain('# Test')
  })

  it('应该支持自定义 helpers', () => {
    const template = '{{upper camelCase}}'
    const context = createTemplateContext('hello')

    const result = renderTemplate(template, context)

    expect(result).toBe('HELLO')
  })
})
