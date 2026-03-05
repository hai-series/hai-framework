/**
 * =============================================================================
 * @h-ai/reach - 模板存储测试（SQLite）
 * =============================================================================
 */

import type { StoredTemplate, TemplateRepository } from '../src/repositories/reach-repository-template.js'
import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTemplateRepository, resetTemplateRepoSingleton } from '../src/repositories/reach-repository-template.js'

// ─── 类型检查 ───

describe('reach-repository-template: types', () => {
  it('storedTemplate 接口应包含所有必要字段', () => {
    const record: StoredTemplate = {
      id: 1,
      name: 'welcome',
      provider: 'email',
      subject: '欢迎',
      body: '你好 {name}',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    expect(record.id).toBe(1)
    expect(record.name).toBe('welcome')
    expect(record.provider).toBe('email')
  })

  it('storedTemplate subject 字段应接受 null', () => {
    const record: StoredTemplate = {
      id: 2,
      name: 'sms-verify',
      provider: 'sms',
      subject: null,
      body: '验证码 {code}',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    expect(record.subject).toBeNull()
  })

  it('templateRepository 接口应定义 findByName / upsert / deleteByName / listTemplates 方法', () => {
    const _check1: keyof TemplateRepository = 'findByName'
    const _check2: keyof TemplateRepository = 'upsert'
    const _check3: keyof TemplateRepository = 'deleteByName'
    const _check4: keyof TemplateRepository = 'listTemplates'
    expect(_check1).toBe('findByName')
    expect(_check2).toBe('upsert')
    expect(_check3).toBe('deleteByName')
    expect(_check4).toBe('listTemplates')
  })
})

// ─── SQLite 集成测试 ───

describe.sequential('reach-repository-template: sqlite', () => {
  let repo: TemplateRepository

  beforeEach(async () => {
    resetTemplateRepoSingleton()
    const initResult = await reldb.init({ type: 'sqlite', database: ':memory:' })
    if (!initResult.success)
      throw new Error(`reldb init failed: ${initResult.error.message}`)
    const repoResult = await createTemplateRepository(reldb)
    if (!repoResult.success)
      throw new Error(`createTemplateRepository failed: ${repoResult.error.message}`)
    repo = repoResult.data
  })

  afterEach(async () => {
    resetTemplateRepoSingleton()
    await reldb.close()
  })

  // ─── createTemplateRepository ───

  it('createTemplateRepository 应成功创建仓库实例', () => {
    expect(repo).toBeDefined()
    expect(repo.findByName).toBeTypeOf('function')
    expect(repo.upsert).toBeTypeOf('function')
    expect(repo.deleteByName).toBeTypeOf('function')
    expect(repo.listTemplates).toBeTypeOf('function')
  })

  it('重复调用 createTemplateRepository 应返回同一实例（单例）', async () => {
    const second = await createTemplateRepository(reldb)
    expect(second.success).toBe(true)
    if (second.success)
      expect(second.data).toBe(repo)
  })

  // ─── upsert（插入） ───

  it('upsert 应插入新模板', async () => {
    const result = await repo.upsert({
      name: 'welcome',
      provider: 'email',
      subject: '欢迎 {name}',
      body: '你好 {name}，欢迎加入！',
    })
    expect(result.success).toBe(true)

    const found = await repo.findByName('welcome')
    expect(found.success).toBe(true)
    if (!found.success)
      return
    expect(found.data).toBeDefined()
    expect(found.data!.name).toBe('welcome')
    expect(found.data!.provider).toBe('email')
    expect(found.data!.subject).toBe('欢迎 {name}')
    expect(found.data!.body).toBe('你好 {name}，欢迎加入！')
  })

  it('upsert 应正确处理无 subject 的模板', async () => {
    const result = await repo.upsert({
      name: 'sms-code',
      provider: 'sms',
      body: '验证码: {code}',
    })
    expect(result.success).toBe(true)

    const found = await repo.findByName('sms-code')
    expect(found.success).toBe(true)
    if (!found.success)
      return
    expect(found.data!.subject).toBeUndefined()
    expect(found.data!.body).toBe('验证码: {code}')
  })

  // ─── upsert（更新） ───

  it('upsert 应更新已存在的模板', async () => {
    await repo.upsert({
      name: 'notify',
      provider: 'email',
      subject: 'v1 subject',
      body: 'v1 body',
    })

    await repo.upsert({
      name: 'notify',
      provider: 'sms',
      subject: 'v2 subject',
      body: 'v2 body',
    })

    const found = await repo.findByName('notify')
    expect(found.success).toBe(true)
    if (!found.success)
      return
    expect(found.data!.provider).toBe('sms')
    expect(found.data!.subject).toBe('v2 subject')
    expect(found.data!.body).toBe('v2 body')
  })

  // ─── findByName ───

  it('findByName 应返回已存在的模板', async () => {
    await repo.upsert({ name: 'test', provider: 'api', body: 'hello' })

    const result = await repo.findByName('test')
    expect(result.success).toBe(true)
    if (!result.success)
      return
    expect(result.data).toBeDefined()
    expect(result.data!.name).toBe('test')
  })

  it('findByName 不存在的模板应返回 undefined', async () => {
    const result = await repo.findByName('nonexistent')
    expect(result.success).toBe(true)
    if (!result.success)
      return
    expect(result.data).toBeUndefined()
  })

  // ─── deleteByName ───

  it('deleteByName 应删除已存在的模板', async () => {
    await repo.upsert({ name: 'to-delete', provider: 'email', body: 'bye' })

    const deleteResult = await repo.deleteByName('to-delete')
    expect(deleteResult.success).toBe(true)

    const found = await repo.findByName('to-delete')
    expect(found.success).toBe(true)
    if (!found.success)
      return
    expect(found.data).toBeUndefined()
  })

  it('deleteByName 删除不存在的模板应静默成功', async () => {
    const result = await repo.deleteByName('nonexistent')
    expect(result.success).toBe(true)
  })

  // ─── listTemplates ───

  it('listTemplates 空表应返回空数组', async () => {
    const result = await repo.listTemplates()
    expect(result.success).toBe(true)
    if (!result.success)
      return
    expect(result.data).toEqual([])
  })

  it('listTemplates 应按名称排序返回所有模板（ReachTemplate 格式）', async () => {
    await repo.upsert({ name: 'beta', provider: 'sms', body: 'b' })
    await repo.upsert({ name: 'alpha', provider: 'email', subject: 'a-sub', body: 'a' })
    await repo.upsert({ name: 'gamma', provider: 'api', body: 'g' })

    const result = await repo.listTemplates()
    expect(result.success).toBe(true)
    if (!result.success)
      return

    expect(result.data).toHaveLength(3)
    expect(result.data[0].name).toBe('alpha')
    expect(result.data[0].subject).toBe('a-sub')
    expect(result.data[1].name).toBe('beta')
    expect(result.data[1].subject).toBeUndefined()
    expect(result.data[2].name).toBe('gamma')
  })

  // ─── BaseReldbCrudRepository 继承方法 ───

  it('count 应返回模板数量', async () => {
    await repo.upsert({ name: 'a', provider: 'x', body: '1' })
    await repo.upsert({ name: 'b', provider: 'y', body: '2' })

    const result = await repo.count()
    expect(result.success).toBe(true)
    if (!result.success)
      return
    expect(result.data).toBe(2)
  })

  it('findById 应返回指定模板', async () => {
    await repo.upsert({ name: 'find-me', provider: 'email', body: 'test' })

    const found = await repo.findByName('find-me')
    if (!found.success || !found.data)
      return

    const byId = await repo.findById(found.data.id)
    expect(byId.success).toBe(true)
    if (!byId.success)
      return
    expect(byId.data?.name).toBe('find-me')
  })
})
