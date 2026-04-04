/**
 * =============================================================================
 * @h-ai/reach - 模板引擎测试
 * =============================================================================
 */

import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HaiReachError } from '../src/index.js'
import { createTemplateRegistry } from '../src/reach-template.js'
import { createTemplateRepository, resetTemplateRepoSingleton } from '../src/repositories/reach-repository-template.js'

// ─── 无 DB 时的行为 ───

describe('reach template: no db', () => {
  it('resolve 应返回 TEMPLATE_NOT_FOUND', async () => {
    const registry = createTemplateRegistry()

    const result = await registry.resolve('missing')
    expect(result.success).toBe(false)
    if (result.success)
      return
    expect(result.error.code).toBe(HaiReachError.TEMPLATE_NOT_FOUND.code)
  })

  it('save 应返回错误', async () => {
    const registry = createTemplateRegistry()
    const result = await registry.save({ name: 'x', provider: 'y', body: 'z' })
    expect(result.success).toBe(false)
  })

  it('saveBatch 应返回错误', async () => {
    const registry = createTemplateRegistry()
    const result = await registry.saveBatch([{ name: 'x', provider: 'y', body: 'z' }])
    expect(result.success).toBe(false)
  })

  it('remove 应返回错误', async () => {
    const registry = createTemplateRegistry()
    const result = await registry.remove('x')
    expect(result.success).toBe(false)
  })

  it('list 应返回空数组', async () => {
    const registry = createTemplateRegistry()

    const result = await registry.list()
    expect(result.success).toBe(true)
    if (!result.success)
      return
    expect(result.data).toEqual([])
  })

  it('render 应返回 TEMPLATE_NOT_FOUND', async () => {
    const registry = createTemplateRegistry()

    const result = await registry.render('missing', {})
    expect(result.success).toBe(false)
    if (result.success)
      return
    expect(result.error.code).toBe(HaiReachError.TEMPLATE_NOT_FOUND.code)
  })
})

// ─── 有 DB 的完整测试 ───

describe.sequential('reach template: with db', () => {
  beforeEach(async () => {
    resetTemplateRepoSingleton()
    const initResult = await reldb.init({ type: 'sqlite', database: ':memory:' })
    if (!initResult.success)
      throw new Error(`reldb init failed: ${initResult.error.message}`)
  })

  afterEach(async () => {
    resetTemplateRepoSingleton()
    await reldb.close()
  })

  async function createRegistry() {
    const repoResult = await createTemplateRepository(reldb)
    if (!repoResult.success)
      throw new Error('repo init failed')
    return createTemplateRegistry(repoResult.data)
  }

  it('save + resolve 应通过 DB 存取模板', async () => {
    const registry = await createRegistry()

    const saveResult = await registry.save({
      name: 'welcome',
      provider: 'email',
      subject: '欢迎 {userName}',
      body: '亲爱的 {userName}，欢迎使用 {appName}！',
    })
    expect(saveResult.success).toBe(true)

    const resolved = await registry.resolve('welcome')
    expect(resolved.success).toBe(true)
    if (!resolved.success)
      return
    expect(resolved.data.name).toBe('welcome')
    expect(resolved.data.provider).toBe('email')
    expect(resolved.data.subject).toBe('欢迎 {userName}')
    expect(resolved.data.body).toBe('亲爱的 {userName}，欢迎使用 {appName}！')
  })

  it('render 应渲染 DB 中的模板', async () => {
    const registry = await createRegistry()

    await registry.save({
      name: 'welcome',
      provider: 'email',
      subject: '欢迎 {userName}',
      body: '亲爱的 {userName}，欢迎使用 {appName}！',
    })

    const result = await registry.render('welcome', { userName: '张三', appName: 'Hai' })
    expect(result.success).toBe(true)
    if (!result.success)
      return
    expect(result.data.subject).toBe('欢迎 张三')
    expect(result.data.body).toBe('亲爱的 张三，欢迎使用 Hai！')
  })

  it('saveBatch 应批量保存模板', async () => {
    const registry = await createRegistry()

    const result = await registry.saveBatch([
      { name: 'tpl1', provider: 'email', body: 'body1' },
      { name: 'tpl2', provider: 'sms', body: 'body2' },
    ])
    expect(result.success).toBe(true)

    const listResult = await registry.list()
    expect(listResult.success).toBe(true)
    if (!listResult.success)
      return
    expect(listResult.data).toHaveLength(2)
  })

  it('resolve 不存在的模板应返回 TEMPLATE_NOT_FOUND', async () => {
    const registry = await createRegistry()

    const result = await registry.resolve('nonexistent')
    expect(result.success).toBe(false)
    if (result.success)
      return
    expect(result.error.code).toBe(HaiReachError.TEMPLATE_NOT_FOUND.code)
  })

  it('模板中未提供的变量应保留占位符', async () => {
    const registry = await createRegistry()

    await registry.save({
      name: 'partial',
      provider: 'email',
      body: '{greeting} {name}, code: {code}',
    })

    const result = await registry.render('partial', { greeting: 'Hello' })
    expect(result.success).toBe(true)
    if (!result.success)
      return
    expect(result.data.body).toBe('Hello {name}, code: {code}')
  })

  it('无 subject 的模板渲染后 subject 应为 undefined', async () => {
    const registry = await createRegistry()

    await registry.save({ name: 'sms', provider: 'sms', body: '验证码: {code}' })

    const result = await registry.render('sms', { code: '123456' })
    expect(result.success).toBe(true)
    if (!result.success)
      return
    expect(result.data.subject).toBeUndefined()
    expect(result.data.body).toBe('验证码: 123456')
  })

  it('同名模板 save 应覆盖', async () => {
    const registry = await createRegistry()

    await registry.save({ name: 'test', provider: 'email', body: 'version 1' })
    await registry.save({ name: 'test', provider: 'sms', body: 'version 2' })

    const result = await registry.render('test', {})
    expect(result.success).toBe(true)
    if (!result.success)
      return
    expect(result.data.body).toBe('version 2')
  })

  it('remove 应从 DB 删除模板', async () => {
    const registry = await createRegistry()

    await registry.save({ name: 'to-del', provider: 'api', body: 'bye' })

    const removeResult = await registry.remove('to-del')
    expect(removeResult.success).toBe(true)

    const resolved = await registry.resolve('to-del')
    expect(resolved.success).toBe(false)
  })

  it('list 应返回所有 DB 中的模板', async () => {
    const registry = await createRegistry()

    await registry.save({ name: 'beta', provider: 'sms', body: 'b' })
    await registry.save({ name: 'alpha', provider: 'email', subject: 'a-sub', body: 'a' })
    await registry.save({ name: 'gamma', provider: 'api', body: 'g' })

    const result = await registry.list()
    expect(result.success).toBe(true)
    if (!result.success)
      return

    expect(result.data).toHaveLength(3)
    expect(result.data[0].name).toBe('alpha')
    expect(result.data[1].name).toBe('beta')
    expect(result.data[2].name).toBe('gamma')
  })

  it('render 不存在的模板应返回 TEMPLATE_NOT_FOUND', async () => {
    const registry = await createRegistry()

    const result = await registry.render('nonexistent', {})
    expect(result.success).toBe(false)
    if (result.success)
      return
    expect(result.error.code).toBe(HaiReachError.TEMPLATE_NOT_FOUND.code)
  })
})
