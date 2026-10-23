/** 真实独立 Node：仅模型响应为本地 HTTP，状态与最终提交全部经过真实 SQLite。 */
import { createServer } from 'node:http'
import process from 'node:process'
import { ai } from '@h-ai/ai'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { vecdb } from '@h-ai/vecdb'

async function main() {
  const input = JSON.parse(process.env.CONTEXT_NODE_INPUT)
  core.init({ logging: { level: 'fatal' } })
  let reply = 'reply'
  const upstream = createServer((request, response) => {
    request.resume()
    request.once('end', () => {
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ id: 'completion', object: 'chat.completion', created: 0, model: 'test', choices: [{ index: 0, message: { role: 'assistant', content: reply }, finish_reason: 'stop' }] }))
    })
  })
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve))
  const address = upstream.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing upstream address')
  for (const initialize of [
    () => reldb.init({ type: 'sqlite', database: input.database }),
    () => vecdb.init({ type: 'lancedb', path: input.vectors }),
    () => ai.init({ llm: { apiKey: 'test', baseUrl: `http://127.0.0.1:${address.port}/v1`, model: 'test' } }),
  ]) {
    const result = await initialize()
    if (!result.success)
      throw new Error(`Context node initialization failed (${result.error.code})`)
  }
  let pause = false
  let pausedFor = 0
  const execute = reldb.sql.execute.bind(reldb.sql)
  reldb.sql.execute = async (sql, params) => {
    if (pause && sql.startsWith('UPDATE hai_ai_context SET')
      && params?.some(value => typeof value === 'string' && value.includes('"generated":"old-reply"'))) {
      pause = false
      await new Promise((resolve, reject) => process.send({ phase: 'paused' }, error => error ? reject(error) : resolve()))
      const start = Date.now()
      // 真正暂停事件循环与续租，不是只等待一个业务 Promise。
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 45_000)
      pausedFor = Date.now() - start
    }
    return execute(sql, params)
  }
  process.on('message', async (message) => {
    if (message.action === 'close') {
      await ai.close()
      await vecdb.close()
      await reldb.close()
      upstream.close()
      process.disconnect()
      return
    }
    try {
      const options = { scope: message.scope, turnCommit: message.manual ? 'manual' : 'auto', compress: { auto: false } }
      const manager = message.action === 'chat'
        ? ai.context.createManager(options)
        : await ai.context.restoreManager(message.scope, options)
      if (!manager.success)
        throw new Error(manager.error.code)
      let result
      if (message.action === 'chat') {
        pause = !!message.pause
        reply = message.reply
        result = await manager.data.chat(message.text)
      }
      else if (message.action === 'commit') {
        result = await manager.data.commitTurn(message.turnId)
      }
      else {
        result = await manager.data.reload()
      }
      process.send({ id: message.id, result, messages: manager.data.getMessages(), turns: manager.data.getTurns(), pausedFor })
    }
    catch (error) { process.send({ id: message.id, failed: error instanceof Error ? error.message : 'Context node failed' }) }
  })
  process.send({ phase: 'ready' })
}

void main().catch((error) => {
  process.stderr.write(error instanceof Error ? error.message : 'Context node failed')
  process.exitCode = 1
})
