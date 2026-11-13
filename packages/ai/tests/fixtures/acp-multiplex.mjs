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
      if (params.prompt[0].text === 'approval') {
        const requestId = `permission-${params.sessionId}-${id}`
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
        send({
          id: requestId,
          method: 'session/request_permission',
          params: {
            sessionId: params.sessionId,
            toolCall: {
              toolCallId: 'fixture-tool',
              title: 'Read project',
              kind: 'read',
              rawInput: { id: 'project' },
            },
            options: [
              { optionId: 'once', name: 'Allow once', kind: 'allow_once' },
            ],
          },
        })
        return undefined
      }
      setTimeout(() => {
        send({
          method: 'session/update',
          params: {
            sessionId: params.sessionId,
            update: { sessionUpdate: 'agent_message_chunk', content: params.prompt[0] },
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
