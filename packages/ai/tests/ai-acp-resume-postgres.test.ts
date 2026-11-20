import type { HaiResult } from '@h-ai/core'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { reldb } from '@h-ai/reldb'
import { expect, it, vi } from 'vitest'
import { postgresEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'
import { ai, HaiAIError } from '../src/index.js'

const fixture = fileURLToPath(new URL('./fixtures/acp-agent.mjs', import.meta.url))

function value<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(JSON.stringify(result.error))
  return result.data
}

it('按配置内容恢复经 PostgreSQL JSONB 读取的原生会话', async () => {
  const database = await postgresEnv()
  let directory: string | undefined
  try {
    const workspacePath = await mkdtemp(join(tmpdir(), 'hai-acp-jsonb-'))
    directory = workspacePath
    value(await reldb.close())
    value(await reldb.init(database.config))
    vi.stubEnv('ACP_RESUME_FIXTURE_FIRST', 'first-value')
    vi.stubEnv('ACP_RESUME_FIXTURE_SECOND', 'second-value')
    const agent = {
      id: 'configured-agent',
      name: 'JSONB resume fixture',
      mode: 'embedded' as const,
      adapter: 'codex',
      command: process.execPath,
      args: [fixture, 'first', 'second'],
      modelIds: ['coding'],
      environmentRefs: {
        ACP_TEST_SECOND: 'ACP_RESUME_FIXTURE_SECOND',
        ACP_TEST_THIRD: 'ACP_RESUME_FIXTURE_FIRST',
        ACP_TEST_ONE: 'ACP_RESUME_FIXTURE_FIRST',
      },
    }
    async function initialize(configured = agent, contextWindow = 16_384) {
      value(await ai.init({
        llm: {
          apiKey: 'fixture-only',
          protocol: 'responses',
          models: [
            {
              id: 'coding',
              model: 'fixture-model',
              capabilities: { contextWindow },
            },
          ],
        },
        acp: {
          agents: [configured],
          workspaces: [
            {
              id: 'project',
              storage: { type: 'directory', path: workspacePath },
            },
          ],
        },
      }))
    }

    await initialize()
    const session = value(await ai.acp.sessions.create({ agentId: agent.id, workspaceId: 'project' }))
    value(await ai.acp.sessions.close(session.id))
    const saved = value(await session.info())
    expect(saved.nativeId).toBe('native-fixture')
    await ai.close()

    const sameAgent = {
      ...agent,
      environmentRefs: {
        ACP_TEST_THIRD: agent.environmentRefs.ACP_TEST_THIRD,
        ACP_TEST_SECOND: agent.environmentRefs.ACP_TEST_SECOND,
        ACP_TEST_ONE: agent.environmentRefs.ACP_TEST_ONE,
      },
    }
    await initialize(sameAgent)
    // 配置清单仍保留原始键顺序，会话快照已通过真实 JSONB 存储重新读取。
    const current = value(await ai.acp.agents.get(agent.id)).value
    expect(saved.agent).toEqual(current)
    expect(Object.keys(saved.agent)).not.toEqual(Object.keys(current))
    expect(Object.keys(saved.agent.environmentRefs)).not.toEqual(Object.keys(current.environmentRefs))

    const resumed = value(await ai.acp.sessions.resume(session.id))
    expect(value(await resumed.info()).nativeId).toBe(saved.nativeId)
    expect(value(await resumed.prompt([
      { type: 'text', text: 'continue' },
    ]))).toMatchObject({
      text: 'continue',
      stopReason: 'end_turn',
    })
    value(await resumed.close())
    await ai.close()

    const changedEnvironment = {
      ...sameAgent,
      environmentRefs: { ...sameAgent.environmentRefs, ACP_TEST_ONE: 'ACP_RESUME_FIXTURE_SECOND' },
    }
    const changedArgs = {
      ...sameAgent,
      args: [fixture, 'second', 'first'],
    }
    for (const [changed, contextWindow] of [
      [changedEnvironment, 16_384],
      [changedArgs, 16_384],
      [sameAgent, 32_768],
    ] as const) {
      await initialize(changed, contextWindow)
      expect(await ai.acp.sessions.resume(session.id)).toMatchObject({
        success: false,
        error: { code: HaiAIError.ACP_CONFLICT.code },
      })
      await ai.close()
    }
  }
  finally {
    try {
      await ai.close()
      await reldb.close()
    }
    finally {
      vi.unstubAllEnvs()
      await Promise.all([
        database.release?.(),
        directory && rm(directory, { recursive: true, force: true }),
      ])
    }
  }
}, 120_000)
