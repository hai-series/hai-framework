/**
 * =============================================================================
 * @h-ai/reach - 模板引擎测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { ReachErrorCode } from '../src/index.js'
import { createTemplateRegistry } from '../src/reach-template.js'

describe('reach template', () => {
  it('应注册并渲染模板', () => {
    const registry = createTemplateRegistry()

    registry.register({
      name: 'welcome',
      subject: '欢迎 {userName}',
      body: '亲爱的 {userName}，欢迎使用 {appName}！',
    })

    const result = registry.render('welcome', { userName: '张三', appName: 'Hai' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.subject).toBe('欢迎 张三')
      expect(result.data.body).toBe('亲爱的 张三，欢迎使用 Hai！')
    }
  })

  it('批量注册应正常工作', () => {
    const registry = createTemplateRegistry()

    registry.registerMany([
      { name: 'tpl1', body: 'body1' },
      { name: 'tpl2', body: 'body2' },
    ])

    expect(registry.has('tpl1')).toBe(true)
    expect(registry.has('tpl2')).toBe(true)
    expect(registry.list()).toHaveLength(2)
  })

  it('get 应返回已注册的模板', () => {
    const registry = createTemplateRegistry()

    registry.register({ name: 'test', body: 'hello {name}' })

    const tpl = registry.get('test')
    expect(tpl).toBeDefined()
    expect(tpl!.name).toBe('test')
    expect(tpl!.body).toBe('hello {name}')
  })

  it('get 不存在的模板应返回 undefined', () => {
    const registry = createTemplateRegistry()

    const tpl = registry.get('nonexistent')
    expect(tpl).toBeUndefined()
  })

  it('has 应正确检查模板存在性', () => {
    const registry = createTemplateRegistry()

    registry.register({ name: 'exists', body: 'test' })

    expect(registry.has('exists')).toBe(true)
    expect(registry.has('not_exists')).toBe(false)
  })

  it('渲染不存在的模板应返回 TEMPLATE_NOT_FOUND', () => {
    const registry = createTemplateRegistry()

    const result = registry.render('nonexistent', {})
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(ReachErrorCode.TEMPLATE_NOT_FOUND)
    }
  })

  it('模板中未提供的变量应保留占位符', () => {
    const registry = createTemplateRegistry()

    registry.register({
      name: 'partial',
      body: '{greeting} {name}, code: {code}',
    })

    const result = registry.render('partial', { greeting: 'Hello' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.body).toBe('Hello {name}, code: {code}')
    }
  })

  it('无 subject 的模板渲染后 subject 应为 undefined', () => {
    const registry = createTemplateRegistry()

    registry.register({ name: 'sms', body: '验证码: {code}' })

    const result = registry.render('sms', { code: '123456' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.subject).toBeUndefined()
      expect(result.data.body).toBe('验证码: 123456')
    }
  })

  it('同名模板注册应覆盖', () => {
    const registry = createTemplateRegistry()

    registry.register({ name: 'test', body: 'version 1' })
    registry.register({ name: 'test', body: 'version 2' })

    const result = registry.render('test', {})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.body).toBe('version 2')
    }
  })
})
