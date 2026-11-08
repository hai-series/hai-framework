import type { HaiResult } from '@h-ai/core'
import { createServer } from 'node:http'
import { agent, methods, PROTOCOL_VERSION } from '@agentclientprotocol/sdk'
import {
  createNodeHttpHandler,
  createNodeWebSocketUpgradeHandler,
} from '@agentclientprotocol/sdk/experimental/node'
import { AcpServer } from '@agentclientprotocol/sdk/experimental/server'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocketServer } from 'ws'
import { ai } from '../src/index.js'

function value<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(JSON.stringify(result.error))
  return result.data
}
afterEach(async () => {
  await ai.close()
})
async function serve() {
  const app = agent({ name: 'remote-fixture' })
    .onRequest(methods.agent.initialize, () => ({
      protocolVersion: PROTOCOL_VERSION,
      agentCapabilities: {
        sessionCapabilities: { list: {} },
      },
      authMethods: [],
    }))
    .onRequest(methods.agent.session.new, async ({ client }) => {
      await client.notify(methods.client.session.update, {
        sessionId: 'remote',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'early' },
          messageId: 'early',
        },
      })
      return { sessionId: 'remote' }
    })
    .onRequest(methods.agent.session.prompt, async ({ client, params }) => {
      if (
        params.prompt[0]?.type === 'text'
        && params.prompt[0].text.startsWith('callbacks')
      ) {
        const sessionId = params.sessionId
        await client.request(methods.client.fs.writeTextFile, {
          sessionId,
          path: '/srv/remote/note.txt',
          content: 'written',
        })
        const file = await client.request(methods.client.fs.readTextFile, {
          sessionId,
          path: '/srv/remote/note.txt',
        })
        const terminal = await client.request(methods.client.terminal.create, {
          sessionId,
          command: 'echo',
          args: ['ok'],
        })
        const terminalRef = { sessionId, terminalId: terminal.terminalId }
        const output = await client.request(
          methods.client.terminal.output,
          terminalRef,
        )
        await client.request(methods.client.terminal.waitForExit, terminalRef)
        await client.request(methods.client.terminal.kill, terminalRef)
        await client.request(methods.client.terminal.release, terminalRef)
        const answer = await client.request(methods.client.elicitation.create, {
          sessionId,
          mode: 'form',
          message: 'Choose a name',
          requestedSchema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
          },
        })
        let foreignRejected = false
        try {
          if (params.prompt[0].text === 'callbacks-foreign') {
            await client.request(methods.client.fs.readTextFile, {
              sessionId: 'foreign',
              path: '/outside',
            })
          }
        }
        catch {
          foreignRejected = true
        }
        await client.notify(methods.client.session.update, {
          sessionId,
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: {
              type: 'text',
              text: JSON.stringify({
                file,
                output,
                answer,
                foreignRejected,
              }),
            },
            messageId: 'answer',
          },
        })
        return { stopReason: 'end_turn' }
      }
      const permission = await client.request(
        methods.client.session.requestPermission,
        {
          sessionId: params.sessionId,
          toolCall: {
            toolCallId: 'tool',
            title: 'Write file',
            status: 'pending',
          },
          options: [
            { optionId: 'allow', name: 'Allow once', kind: 'allow_once' },
            { optionId: 'deny', name: 'Reject', kind: 'reject_once' },
          ],
        },
      )
      await client.notify(methods.client.session.update, {
        sessionId: params.sessionId,
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: {
            type: 'text',
            text: JSON.stringify(permission),
          },
          messageId: 'answer',
        },
        _meta: { fixture: true },
      })
      return { stopReason: 'end_turn' }
    })
    .onRequest(methods.agent.session.list, () => ({ sessions: [] }))
  const protocol = new AcpServer({ agent: app })
  const server = createServer(createNodeHttpHandler(protocol))
  const ws = new WebSocketServer({ noServer: true })
  server.on('upgrade', createNodeWebSocketUpgradeHandler(protocol, ws))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing server address')
  return {
    port: address.port,
    async close() {
      await protocol.close()
      for (const socket of ws.clients) socket.terminate()
      ws.close()
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) =>
        server.close(error => (error
          ? reject(error)
          : resolve())),
      )
    },
  }
}
describe('aCP native remote E2E', () => {
  it.each(['http', 'ws'] as const)(
    '%s：原生握手、双向权限、早期事件、模型由服务端维护',
    async (transport) => {
      const server = await serve()
      try {
        value(await ai.init())
        value(
          await ai.acp.agents.register({
            id: 'remote',
            name: 'Remote',
            mode: 'custom-service',
            transport,
            url: `${transport}://127.0.0.1:${server.port}/acp`,
            supportedTransports: [transport],
          }),
        )
        expect(value(await ai.acp.agents.check('remote')).protocolVersion).toBe(
          1,
        )
        const events: unknown[] = []
        const session = value(
          await ai.acp.sessions.create({
            agentId: 'remote',
            cwd: '/srv/remote',
            onEvent: event => events.push(event),
          }),
        )
        const response = value(
          await session.prompt([
            { type: 'text', text: 'permission' },
          ]),
        )
        expect(JSON.parse(response.text).outcome.outcome).toBe('cancelled')
        expect(events).toHaveLength(2)
        expect(
          (
            await session.publish({
              mode: 'merge-main',
              message: 'not managed',
              author: { name: 'Test', email: 'test@example.invalid' },
            })
          ).success,
        ).toBe(false)
        value(await session.close())
        const allowed = value(
          await ai.acp.sessions.create({
            agentId: 'remote',
            cwd: '/srv/remote',
            handlers: {
              'session/request_permission': () => ({
                outcome: { outcome: 'selected', optionId: 'allow' },
              }),
            },
          }),
        )
        expect(
          JSON.parse(
            value(await allowed.prompt([
              { type: 'text', text: 'allow' },
            ])).text,
          ).outcome.optionId,
        ).toBe('allow')
        value(await allowed.close())
      }
      finally {
        await ai.close()
        await server.close()
      }
    },
    15000,
  )
  it.each(['http', 'ws'] as const)(
    '%s：文件、终端、交互提问与跨会话请求隔离',
    async (transport) => {
      const server = await serve()
      const calls: string[] = []
      try {
        value(
          await ai.init({
            acp: { promptTimeout: 3000, cancelTimeout: 100 },
          }),
        )
        const connected = value(
          await ai.acp.connect(
            {
              type: transport,
              url: `${transport}://127.0.0.1:${server.port}/acp`,
            },
            {
              capabilities: {
                fs: { readTextFile: true, writeTextFile: true },
                terminal: true,
                elicitation: { form: {} },
              },
              handlers: {
                'fs/write_text_file': ({ params }) => {
                  calls.push(params.content)
                  return {}
                },
                'fs/read_text_file': ({ params }) => {
                  calls.push(params.path)
                  return { content: 'read' }
                },
                'terminal/create': () => {
                  calls.push('create')
                  return { terminalId: 'owned-terminal' }
                },
                'terminal/output': () => ({
                  output: 'ok',
                  truncated: false,
                  exitStatus: { exitCode: 0 },
                }),
                'terminal/wait_for_exit': () => {
                  calls.push('wait')
                  return { exitCode: 0 }
                },
                'terminal/kill': () => {
                  calls.push('kill')
                  return {}
                },
                'terminal/release': () => {
                  calls.push('release')
                  return {}
                },
                'elicitation/create': () => ({
                  action: 'accept',
                  content: { name: 'project' },
                }),
              },
            },
          ),
        )
        const session = value(await connected.createSession('/srv/remote'))
        const prompt = await session.prompt([
          {
            type: 'text',
            text: transport === 'ws'
              ? 'callbacks-foreign'
              : 'callbacks',
          },
        ])
        expect(prompt.success, JSON.stringify(calls)).toBe(true)
        const response = value(prompt)
        expect(JSON.parse(response.text)).toMatchObject({
          file: { content: 'read' },
          output: { output: 'ok' },
          answer: {
            action: 'accept',
            content: { name: 'project' },
          },
          foreignRejected: transport === 'ws',
        })
        expect(calls).toEqual([
          'written',
          '/srv/remote/note.txt',
          'create',
          'wait',
          'kill',
          'release',
        ])
        value(await connected.close())
      }
      finally {
        await ai.close()
        await server.close()
      }
    },
    15000,
  )
  it('能力回调不完整时不宣称支持；连接失败不降级', async () => {
    value(await ai.init({
      acp: { requestTimeout: 300 },
    }))
    const server = await serve()
    try {
      expect(
        (
          await ai.acp.connect(
            { type: 'http', url: `http://127.0.0.1:${server.port}/acp` },
            {
              capabilities: { terminal: true },
            },
          )
        ).success,
      ).toBe(false)
    }
    finally {
      await server.close()
    }
    expect(
      (
        await ai.acp.connect({
          type: 'ws',
          url: `ws://127.0.0.1:${server.port}/acp`,
        })
      ).success,
    ).toBe(false)
  })
})
