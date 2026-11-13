import process from 'node:process'
import { createInterface } from 'node:readline'

let count = 0
const sessions = new Set()
const approvals = new Map()
const input = createInterface({ input: process.stdin })
function send(message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)
}
input.on('line', (line) => {
  const { id, method, params } = JSON.parse(line)
  const reply = result => send({ id, result })
  if (!method && approvals.has(id)) {
    const waiting = approvals.get(id)
    approvals.delete(id)
    waiting(params ?? JSON.parse(line).result)
    return
  }
  switch (method) {
    case 'initialize':
      return reply({
        protocolVersion: 1,
        agentCapabilities: {
          mcpCapabilities: { http: true },
          sessionCapabilities: { close: {} },
        },
        authMethods: [],
      })
    case 'session/new': {
      const sessionId = `native-${++count}`
      sessions.add(sessionId)
      return reply({ sessionId })
    }
    case 'session/close':
      sessions.delete(params.sessionId)
      return reply({})
    case 'session/prompt':
      if (!sessions.has(params.sessionId)) {
        return send({
          id,
          error: { code: -32602, message: 'Unknown session' },
        })
      }
      if ([
        'approval',
        'approval-metadata',
        'approval-missing',
        'approval-conflict',
      ].includes(params.prompt[0].text)) {
        const operation = params.prompt[0].text
        const requestId = `permission-${params.sessionId}-${id}`
        const toolCall = {
          toolCallId: 'fixture-tool',
          title: 'Read project',
          kind: 'read',
          rawInput: { id: 'project' },
        }
        approvals.set(requestId, (decision) => {
          send({
            method: 'session/update',
            params: {
              sessionId: params.sessionId,
              update: {
                sessionUpdate: 'agent_message_chunk',
                content: { type: 'text', text: decision?.outcome?.optionId ?? 'denied' },
              },
            },
          })
          reply({ stopReason: 'end_turn' })
        })
        if (operation === 'approval-metadata' || operation === 'approval-conflict') {
          send({
            method: 'session/update',
            params: {
              sessionId: params.sessionId,
              update: { sessionUpdate: 'tool_call', ...toolCall },
            },
          })
        }
        send({
          id: requestId,
          method: 'session/request_permission',
          params: {
            sessionId: params.sessionId,
            toolCall: operation === 'approval'
              ? toolCall
              : operation === 'approval-conflict'
                ? {
                    ...toolCall,
                    rawInput: { id: 'another-project' },
                  }
                : { toolCallId: toolCall.toolCallId },
            options: [
              { optionId: 'once', name: 'Allow once', kind: 'allow_once' },
            ],
          },
        })
        return undefined
      }
      setTimeout(() => {
        const content = params.prompt.at(-1).text === 'inspect-history'
          ? {
              type: 'text',
              text: JSON.stringify(params.prompt.map(item => item.text)),
            }
          : params.prompt[0]
        send({
          method: 'session/update',
          params: {
            sessionId: params.sessionId,
            update: { sessionUpdate: 'agent_message_chunk', content },
          },
        })
        reply({ stopReason: 'end_turn' })
      }, 5)
      return undefined
    default:
      if (id !== undefined) {
        send({
          id,
          error: { code: -32601, message: 'Unknown method' },
        })
      }
  }
})
