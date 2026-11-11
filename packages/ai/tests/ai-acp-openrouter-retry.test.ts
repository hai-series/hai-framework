import type { SessionNotification } from '@agentclientprotocol/sdk'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { finishOpenRouterAttempt, openRouterRetry, trackOpenRouterPrompt } from './helpers/acp-openrouter-retry.js'

function message(text: string): SessionNotification['update'] {
  return {
    sessionUpdate: 'agent_message_chunk',
    content: { type: 'text', text },
  }
}

describe('openRouter 验收重试', () => {
  let parent: string
  let directory: string

  beforeAll(async () => {
    parent = await realpath(tmpdir())
    directory = await mkdtemp(join(parent, 'hai-openrouter-retry-test-'))
  })

  afterAll(async () => {
    if (directory && dirname(directory) === parent && basename(directory).startsWith('hai-openrouter-retry-test-'))
      await rm(directory, { recursive: true, force: true })
  })

  it('从当前请求识别明确的 429，支持跨事件分块', () => {
    const prompt = trackOpenRouterPrompt()
    const missingFile = new Error('ENOENT')
    prompt.observe(message('429 Too Many Requests'))
    expect(prompt.rateLimited(missingFile)).toBe(false)

    prompt.start()
    prompt.observe(message('unexpected status 42'))
    prompt.observe(message('9 Too Many Requests'))
    expect(prompt.rateLimited(missingFile)).toBe(true)

    prompt.complete()
    expect(prompt.rateLimited(missingFile)).toBe(false)
    prompt.start()
    prompt.observe(message('Inventory item 42900'))
    expect(prompt.rateLimited(missingFile)).toBe(false)
    expect(prompt.rateLimited(new Error('HTTP 429'))).toBe(true)
    expect(prompt.rateLimited(new Error('hai:ai:071'))).toBe(false)
  })

  it('重试前留存限流记录，最后一次使用正式证据文件', async () => {
    const redact = (text: string) => text.replaceAll('fixture-value', '[REDACTED]')
    const first = {
      id: 'recoverable',
      attempt: 1,
      status: 'failed' as const,
      rateLimited: true,
      cleanup: { status: 'passed' as const },
      error: 'Original failure fixture-value',
    }
    await expect(finishOpenRouterAttempt(directory, first, redact)).rejects.toThrow(openRouterRetry.condition)
    await finishOpenRouterAttempt(directory, {
      id: first.id,
      attempt: 2,
      status: 'passed',
      cleanup: { status: 'passed' },
    }, redact)

    const archived = await readFile(join(directory, 'attempts/recoverable-attempt-1.json'), 'utf8')
    const final = await readFile(join(directory, 'recoverable.json'), 'utf8')
    expect(JSON.parse(archived)).toMatchObject({ attempt: 1, status: 'failed', error: 'Original failure [REDACTED]' })
    expect(JSON.parse(final)).toMatchObject({ attempt: 2, status: 'passed' })
    expect(openRouterRetry.count).toBe(2)
    expect(openRouterRetry.delay).toBe(30_000)
  })

  it('普通验收错误和清理失败保留失败结果', async () => {
    const identity = (text: string) => text
    for (const cleanupStatus of ['passed', 'failed'] as const) {
      const id = `terminal-${cleanupStatus}`
      await expect(finishOpenRouterAttempt(directory, {
        id,
        attempt: 1,
        status: 'failed',
        rateLimited: cleanupStatus === 'failed',
        cleanup: { status: cleanupStatus },
        error: 'Original failure',
      }, identity)).rejects.toMatchObject({ name: 'Error', message: 'Original failure' })
      await expect(readFile(join(directory, `attempts/${id}-attempt-1.json`), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    }
  })
})
