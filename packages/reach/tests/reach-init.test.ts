/**
 * =============================================================================
 * @h-ai/reach - 初始化与状态测试
 * =============================================================================
 */

import { err } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HaiReachError, reach } from '../src/index.js'
import * as consoleProviders from '../src/providers/reach-provider-console.js'
import { createTemplateRepository } from '../src/repositories/reach-repository-template.js'

describe('reach.init', { concurrent: false }, () => {
  afterEach(async () => {
    await reach.close()
    await reldb.close()
    vi.restoreAllMocks()
  })

  it('单个 console provider: init 后应处于已初始化状态', async () => {
    const result = await reach.init({
      providers: [
        { name: 'dev', type: 'console' },
      ],
    })
    expect(result.success).toBe(true)
    expect(reach.isInitialized).toBe(true)
    expect(reach.config).not.toBeNull()
  })

  it('多个 provider: init 后应处于已初始化状态', async () => {
    const result = await reach.init({
      providers: [
        { name: 'email', type: 'console' },
        { name: 'sms', type: 'console' },
      ],
    })
    expect(result.success).toBe(true)
    expect(reach.isInitialized).toBe(true)
  })

  it('api provider 配置快照应脱敏 URL 凭证与授权头', async () => {
    const result = await reach.init({
      providers: [
        {
          name: 'webhook',
          type: 'api',
          url: 'https://user:pass@example.com/notify',
          headers: { Authorization: 'Bearer secret-token' },
        },
      ],
    })

    expect(result.success).toBe(true)
    expect(reach.config).not.toBeNull()
    const provider = reach.config?.providers[0]
    expect(provider?.type).toBe('api')
    if (provider?.type === 'api') {
      expect(provider.url).toBe('https://[REDACTED]:[REDACTED]@example.com/notify')
      expect(provider.headers?.Authorization).toBe('[REDACTED]')
    }
  })

  it('api provider 配置快照隐藏任意自定义认证头的值', async () => {
    const result = await reach.init({
      providers: [
        {
          name: 'webhook',
          type: 'api',
          url: 'https://notify.example.test',
          headers: { 'X-Client-Credential': 'fixture-private-custom-header', 'Authorization': 'Bearer fixture-private-token' },
        },
      ],
    })
    expect(result.success).toBe(true)
    const provider = reach.config?.providers[0]
    expect(provider?.type).toBe('api')
    if (provider?.type === 'api')
      expect(provider.headers).toEqual({ 'X-Client-Credential': '[REDACTED]', 'Authorization': '[REDACTED]' })
  })

  it('close waits for an in-flight initialization and leaves no published provider', async () => {
    const opening = reach.init({
      providers: [
        { name: 'dev', type: 'console' },
      ],
    })
    await reach.close()
    await opening
    expect(reach.isInitialized).toBe(false)
    expect(reach.config).toBeNull()
  })

  it('duplicate provider names fail before any provider is published', async () => {
    const result = await reach.init({
      providers: [
        { name: 'duplicate', type: 'console' },
        { name: 'duplicate', type: 'console' },
      ],
    })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiReachError.CONFIG_ERROR.code)
    expect(reach.isInitialized).toBe(false)
  })

  it('显式配置模板但数据库未初始化时失败且不发布 Provider', async () => {
    const result = await reach.init({
      providers: [
        { name: 'dev', type: 'console' },
      ],
      templates: [
        { name: 'welcome', provider: 'dev', body: 'Hello {name}' },
      ],
    })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiReachError.CONFIG_ERROR.code)
    expect(reach.isInitialized).toBe(false)
    expect(reach.config).toBeNull()
  })

  it('模板保存失败会关闭候选 Provider 并拒绝报告初始化成功', async () => {
    expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
    const repository = await createTemplateRepository(reldb)
    expect(repository.success).toBe(true)
    if (!repository.success)
      return
    vi.spyOn(repository.data, 'upsert').mockResolvedValueOnce(err(HaiReachError.SEND_FAILED, 'Fixture persistence failure'))
    const provider = consoleProviders.createConsoleProvider()
    const closed = vi.spyOn(provider, 'close')
    vi.spyOn(consoleProviders, 'createConsoleProvider').mockReturnValueOnce(provider)
    const result = await reach.init({
      providers: [
        { name: 'dev', type: 'console' },
      ],
      templates: [
        { name: 'welcome', provider: 'dev', body: 'Hello {name}' },
      ],
    })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiReachError.CONFIG_ERROR.code)
    expect(closed).toHaveBeenCalledOnce()
    expect(provider.isConnected()).toBe(false)
    expect(reach.isInitialized).toBe(false)
  })

  it('close 后应恢复未初始化状态', async () => {
    await reach.init({
      providers: [
        { name: 'dev', type: 'console' },
      ],
    })
    await reach.close()

    expect(reach.isInitialized).toBe(false)
    expect(reach.config).toBeNull()
  })

  it('重复 init 应自动关闭前一次连接', async () => {
    await reach.init({
      providers: [
        { name: 'dev', type: 'console' },
      ],
    })
    expect(reach.isInitialized).toBe(true)

    const secondInit = await reach.init({
      providers: [
        { name: 'dev2', type: 'console' },
      ],
    })
    expect(secondInit.success).toBe(true)
    expect(reach.isInitialized).toBe(true)
  })

  it('无效配置应返回 CONFIG_ERROR', async () => {
    const result = await reach.init({
      providers: [
        { name: 'x', type: 'invalid' },
      ],
    } as never)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiReachError.CONFIG_ERROR.code)
    }
  })

  it('close 多次调用应安全', async () => {
    await reach.init({
      providers: [
        { name: 'dev', type: 'console' },
      ],
    })
    await reach.close()
    await reach.close()
    await reach.close()
    expect(reach.isInitialized).toBe(false)
    expect(reach.config).toBeNull()
  })
})
