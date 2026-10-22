/** 默认补全经 typed client、真实 HTTP serv 和 OpenAI 协议 Provider 的工具往返。 */
import type { AiChatCompletionInput } from '@h-ai/api-contract'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { ai } from '@h-ai/ai'
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'
import { core } from '@h-ai/core'
import { describe, expect, it } from 'vitest'
import { createAiProcedures } from '../src/features/serv-feature-ai.js'
import { serv } from '../src/serv-main.js'

describe('ai completion HTTP protocol', () => {
  it('typed client 将完整工具、选择和各角色消息送达真实 Provider，工具调用与结果均可返回', async () => {
    const received: Array<Record<string, unknown>> = []
    const toolCall = { id: 'call_lookup', type: 'function' as const, function: { name: 'lookup', arguments: '{"ids":[1,2]}' } }
    const provider = createServer((request, response) => {
      void (async () => {
        expect(request.url).toBe('/v1/chat/completions')
        const chunks: string[] = []
        request.setEncoding('utf8')
        for await (const chunk of request)
          chunks.push(String(chunk))
        const parsed: unknown = JSON.parse(chunks.join(''))
        if (typeof parsed !== 'object' || parsed === null)
          throw new Error('Invalid provider request')
        received.push(parsed as Record<string, unknown>)
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({
          id: `completion_${received.length}`,
          object: 'chat.completion',
          created: 1,
          model: 'controlled-model',
          choices: [{
            index: 0,
            finish_reason: received.length === 1 ? 'tool_calls' : 'stop',
            message: received.length === 1
              ? { role: 'assistant', content: null, tool_calls: [toolCall] }
              : { role: 'assistant', content: 'Found both records' },
          }],
          usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
        }))
      })().catch((error: unknown) => {
        response.writeHead(500)
        response.end(error instanceof Error ? error.message : 'Provider test failed')
      })
    })
    const contract = apiContract.create({ ai: apiContract.ai })
    const client = apiClient.create(contract)
    let node: ReturnType<typeof serv.listen> | undefined
    try {
      provider.listen(0, '127.0.0.1')
      await once(provider, 'listening')
      const providerAddress = provider.address()
      if (!providerAddress || typeof providerAddress === 'string')
        throw new Error('Provider did not start')
      // 此测试不初始化 DB，明确使用开发/测试允许的临时 Store；业务调用走公开 ai 入口。
      const initialized = await ai.init({ llm: {
        apiKey: 'controlled-provider-key',
        model: 'controlled-model',
        baseUrl: `http://127.0.0.1:${providerAddress.port}/v1`,
      } })
      expect(initialized.success).toBe(true)
      const app = serv.createApp({
        contract,
        procedures: { ai: createAiProcedures({ ai }) },
        createContext: ({ request }) => ({
          requestId: 'completion-http-test',
          locale: 'en-US',
          request,
          logger: core.logger.child({ module: 'serv-test' }),
          session: { userId: 'trusted-user', roles: [], permissions: [] },
        }),
      })
      node = serv.listen(app, { host: '127.0.0.1', port: 0 })
      await once(node.server, 'listening')
      const address = node.server.address()
      if (!address || typeof address === 'string')
        throw new Error('Serv did not start')
      const clientInit = await client.init({
        baseUrl: `http://127.0.0.1:${address.port}/api/v1`,
        auth: { storage: apiClient.tokenStorage.memory() },
      })
      expect(clientInit.success).toBe(true)

      const tools: NonNullable<AiChatCompletionInput['tools']> = [{
        type: 'function',
        function: {
          name: 'lookup',
          description: 'Find records',
          strict: true,
          parameters: {
            type: 'object',
            properties: { ids: { type: 'array', items: { type: 'integer', minimum: 1 }, minItems: 1 } },
            required: ['ids'],
            additionalProperties: false,
            $defs: { record: { type: 'object', properties: { active: { const: true } } } },
          },
        },
      }]
      const messages: AiChatCompletionInput['messages'] = [
        { role: 'system', name: 'policy', content: [{ type: 'text', text: 'Use the lookup tool' }] },
        { role: 'user', name: 'requester', content: [
          { type: 'text', text: 'Find these records' },
          { type: 'image_url', image_url: { url: 'https://example.com/records.png', detail: 'low' } },
        ] },
      ]
      const choice = { type: 'function' as const, function: { name: 'lookup' } }
      const first = await client.ai.chats.createCompletion({ messages, tools, tool_choice: choice, sessionId: 'tools' })
      expect(first.success).toBe(true)
      if (!first.success)
        throw new Error(first.error.message)
      expect(first.data.choices[0]?.message.tool_calls).toEqual([toolCall])
      expect(first.data.choices[0]?.finish_reason).toBe('tool_calls')
      expect(received[0]).toMatchObject({ messages, tools, tool_choice: choice, stream: false })
      // objectId 由服务端绑定并用于历史存储，不泄漏为上游协议扩展字段。
      expect(received[0]).not.toHaveProperty('objectId')

      const continuation: AiChatCompletionInput['messages'] = [
        ...messages,
        { role: 'assistant', name: 'assistant', content: null, tool_calls: [toolCall] },
        { role: 'tool', tool_call_id: toolCall.id, content: [{ type: 'text', text: '[{"id":1},{"id":2}]' }] },
      ]
      const second = await client.ai.chats.createCompletion({ messages: continuation, tools, tool_choice: 'none', sessionId: 'tools' })
      expect(second.success).toBe(true)
      if (second.success)
        expect(second.data.choices[0]?.message.content).toBe('Found both records')
      expect(received[1]).toMatchObject({ messages: continuation, tools, tool_choice: 'none', stream: false })
      const history = await client.ai.chats.listHistory({ sessionId: 'tools' })
      expect(history.success).toBe(true)
      if (history.success) {
        expect(history.data.items).toHaveLength(2)
        expect(history.data.items.every(item => item.objectId === 'trusted-user')).toBe(true)
      }
    }
    finally {
      await client.close()
      await node?.close()
      await ai.close()
      provider.closeAllConnections()
      await new Promise<void>((resolve, reject) => provider.close(error => error ? reject(error) : resolve()))
    }
  })
})
