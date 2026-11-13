import { readFileSync, writeFileSync } from 'node:fs'
import process from 'node:process'
import { createInterface } from 'node:readline'

const channel = createInterface({ input: process.stdin })
function send(message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)
}

channel.on('line', (line) => {
  const { id, method, params } = JSON.parse(line)
  const reply = result => send({ id, result })
  if (method === 'initialize') {
    return reply({
      protocolVersion: 1,
      agentCapabilities: {
        sessionCapabilities: { close: {} },
      },
      authMethods: [],
    })
  }
  if (method === 'session/new')
    return reply({ sessionId: 'native-workspace' })
  if (method === 'session/close')
    return reply({})
  if (method === 'session/prompt') {
    const path = '/input/notes.txt'
    const source = readFileSync(path, 'utf8')
    let readOnly = false
    try {
      writeFileSync(path, 'changed')
    }
    catch (error) {
      readOnly = ['EROFS', 'EACCES'].includes(error.code)
    }
    writeFileSync('/workspace/notes.txt', `${source} private copy`)
    const text = JSON.stringify({
      source,
      readOnly,
      privateCopy: readFileSync('/workspace/notes.txt', 'utf8'),
      mountHint: params.prompt.some(block => block.text?.includes('/input')),
    })
    send({
      method: 'session/update',
      params: {
        sessionId: params.sessionId,
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text },
        },
      },
    })
    return reply({ stopReason: 'end_turn' })
  }
  return undefined
})
