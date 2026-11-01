import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { createInterface } from 'node:readline'

function send(value) {
  return process.stdout.write(
    `${JSON.stringify({ jsonrpc: '2.0', ...value })}\n`,
  )
}
const state = process.env.HOME
const sessions = new Map()
let mcpServers = []
let pending
const line = createInterface({ input: process.stdin })
line.on('line', async (text) => {
  const message = JSON.parse(text)
  const { id, method, params } = message
  const reply = result => send({ id, result })
  const event = (sessionId, text) =>
    send({
      method: 'session/update',
      params: {
        sessionId,
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text },
        },
      },
    })
  if (method === 'initialize') {
    return reply({
      protocolVersion: 1,
      agentInfo: { name: 'fixture', version: '1' },
      agentCapabilities: {
        loadSession: true,
        sessionCapabilities: { resume: {}, close: {}, list: {} },
        promptCapabilities: {},
      },
      authMethods: [],
    })
  }
  if (method === 'session/new') {
    mcpServers = params.mcpServers
    const sessionId = 'native-fixture'
    sessions.set(sessionId, params.cwd)
    await mkdir(state, { recursive: true })
    await writeFile(
      join(state, 'session.json'),
      JSON.stringify({ cwd: params.cwd }),
    )
    event(sessionId, 'created')
    return reply({ sessionId })
  }
  if (method === 'session/resume' || method === 'session/load') {
    const saved = JSON.parse(
      await readFile(join(state, 'session.json'), 'utf8'),
    )
    sessions.set(params.sessionId, saved.cwd)
    return reply({})
  }
  if (method === 'session/close')
    return reply({})
  if (method === 'session/list')
    return reply({ sessions: [] })
  if (method === 'session/set_mode' || method === 'session/set_config_option')
    return reply({ configOptions: [] })
  if (method === 'session/cancel') {
    if (pending) {
      send({ id: pending, result: { stopReason: 'cancelled' } })
      pending = undefined
    }
    return
  }
  if (method === 'session/prompt') {
    const content = params.prompt[0].text
    if (content === 'mcp') {
      event(
        params.sessionId,
        mcpServers.map(server => server.name).join(','),
      )
      return reply({ stopReason: 'end_turn' })
    }
    if (content === 'wait') {
      pending = id
      return
    }
    if (content === 'hang')
      return
    if (content === 'write') {
      await writeFile(
        join(sessions.get(params.sessionId), 'files', 'agent.txt'),
        'agent output',
      )
    }
    if (content === 'overflow') {
      for (let i = 0; i < 20; i++) event(params.sessionId, 'x'.repeat(500))
      return reply({ stopReason: 'end_turn' })
    }
    event(
      params.sessionId,
      content === 'json'
        ? '{"answer":42}'
        : content === 'bad-json'
          ? 'prefix {"answer":42}'
          : content,
    )
    return reply({
      stopReason: content === 'max-tokens' ? 'max_tokens' : 'end_turn',
    })
  }
  if (id !== undefined) {
    send({
      id,
      error: { code: -32601, message: 'Unsupported fixture method' },
    })
  }
})
