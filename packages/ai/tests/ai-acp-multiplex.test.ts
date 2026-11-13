import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { connectACP } from '../src/acp/ai-acp-client.js'

it('routes interleaved events by native session and closes only the requested session', async () => {
  const connection = await connectACP({
    type: 'stdio',
    command: process.execPath,
    args: [
      fileURLToPath(new URL('./fixtures/acp-multiplex.mjs', import.meta.url)),
    ],
  })
  try {
    const left = connection.channel()
    const right = connection.channel()
    const a = await left.createSession('/left')
    const b = await right.createSession('/right')
    expect(a.sessionId).not.toBe(b.sessionId)
    const [x, y] = await Promise.all([
      left.prompt([
        { type: 'text', text: 'left' },
      ]),
      right.prompt([
        { type: 'text', text: 'right' },
      ]),
    ])
    expect(x.text).toBe('left')
    expect(y.text).toBe('right')
    expect(x.events.every(event => event.sessionId === a.sessionId)).toBe(true)
    expect(y.events.every(event => event.sessionId === b.sessionId)).toBe(true)
    await left.closeSession()
    await expect(left.prompt([
      { type: 'text', text: 'closed' },
    ])).rejects.toMatchObject({ kind: 'missing' })
    expect((await right.prompt([
      { type: 'text', text: 'still open' },
    ])).text).toBe('still open')
  }
  finally {
    await connection.close()
  }
})
