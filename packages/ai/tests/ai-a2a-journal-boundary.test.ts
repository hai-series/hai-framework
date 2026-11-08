/** 删除旧 TaskStore 后仍完整实现 SDK 协议；权威任务仅写共享 journal。 */
import { ExtendedAgentCardNotConfiguredError, PushNotificationNotSupportedError, toJsonRpcError } from '@a2a-js/sdk/errors'
import { expect, it, vi } from 'vitest'
import { createA2AOperations, createA2AStores } from '../src/a2a/ai-a2a-functions.js'
import { createMemoryStoreProvider } from '../src/store/providers/ai-store-provider-memory.js'

it('不再注册旧 tasks 表，未实现 RPC 保留 SDK 标准错误且不执行或改写任务', async () => {
  const provider = createMemoryStoreProvider()
  const createRelStore = vi.spyOn(provider, 'createRelStore')
  const stores = createA2AStores(provider)
  expect(createRelStore.mock.calls.map(([name]) => name)).toEqual([
    'hai_ai_a2a_journal',
    'hai_ai_a2a_contexts',
    'hai_ai_a2a_messages',
  ])
  const execute = vi.fn()
  const api = createA2AOperations({
    agentCard: { name: 'journal-only', url: 'https://agent.example' },
    executor: {
      execute,
      cancelTask: vi.fn(),
    },
  }, stores)
  const unsupportedPush = toJsonRpcError(new PushNotificationNotSupportedError())
  const unsupportedCard = toJsonRpcError(new ExtendedAgentCardNotConfiguredError())
  try {
    for (const [method, params] of [
      [
        'CreateTaskPushNotificationConfig',
        {
          taskId: 'unused',
          pushNotificationConfig: { id: 'config', url: 'https://notify.example' },
        },
      ],
      [
        'GetTaskPushNotificationConfig',
        { id: 'unused' },
      ],
      [
        'ListTaskPushNotificationConfigs',
        { id: 'unused' },
      ],
      [
        'DeleteTaskPushNotificationConfig',
        { id: 'unused', pushNotificationConfigId: 'config' },
      ],
    ]) {
      const result = await api.handleRequest({
        jsonrpc: '2.0',
        id: 'unsupported',
        method,
        params,
      }, { agentId: 'owner' })
      expect(result).toMatchObject({
        streaming: false,
        body: { error: unsupportedPush },
      })
    }
    expect(await api.handleRequest({ jsonrpc: '2.0', id: 'extended', method: 'GetExtendedAgentCard' }, { agentId: 'owner' }))
      .toMatchObject({
        streaming: false,
        body: { error: unsupportedCard },
      })
    expect(execute).not.toHaveBeenCalled()
    expect(await stores.journalStore.query({})).toEqual([])
    expect(api.getAgentCard()).toMatchObject({
      success: true,
      data: {
        capabilities: { pushNotifications: false, streaming: true },
      },
    })
  }
  finally {
    await api.close()
  }
})
