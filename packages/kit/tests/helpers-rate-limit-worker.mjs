/** 两个真实HTTP进程共享Redis限流，调用者地址由socket提供。 */
import { createServer } from 'node:http'
import process from 'node:process'
import { apiContract } from '@h-ai/api-contract'
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { kit } from '@h-ai/kit'
import { serv } from '@h-ai/serv'

async function main() {
  const config = JSON.parse(process.env.KIT_RATE_LIMIT_WORKER)
  const initialized = await cache.init(config.cache)
  if (!initialized.success)
    throw new Error('Cache initialization failed')
  const actualNow = Date.now.bind(Date)
  Date.now = () => actualNow() + config.clockSkew
  const rateLimit = {
    windowMs: 3000,
    maxRequests: 5,
    store: core.access.createCacheRateLimitStore(cache, { namespace: config.namespace }),
  }
  if (config.host === 'serv') {
    const contract = apiContract.create({})
    const app = serv.createApp({
      contract,
      procedures: serv.implement(contract).context().build(),
      http: { rateLimit },
      middlewares: [
        {
          middleware: () => new Response('allowed'),
        },
      ],
    })
    const listening = Promise.withResolvers()
    const server = serv.listen(app, { host: '127.0.0.1', port: 0, onListening: listening.resolve })
    try {
      const { port } = await listening.promise
      process.send?.({ port })
      await new Promise(resolve => process.once('message', resolve))
    }
    finally {
      await server.close()
      await cache.close()
      process.disconnect()
    }
    return
  }
  const handle = kit.createHandle({
    logging: false,
    http: { rateLimit },
  })
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      const result = await handle({
        event: {
          request: new Request(url, {
            method: request.method,
            headers: new Headers(request.headers),
          }),
          url,
          locals: {},
          route: { id: '/api/ping' },
          getClientAddress: () => request.socket.remoteAddress,
          cookies: {
            get: () => undefined,
          },
        },
        resolve: async () => new Response('allowed'),
      })
      response.writeHead(result.status, Object.fromEntries(result.headers))
      response.end(await result.text())
    }
    catch {
      response.writeHead(500)
      response.end()
    }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  process.send?.({ port: server.address().port })
  process.on('message', async () => {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    await cache.close()
    process.disconnect()
  })
}
main().catch(async (error) => {
  process.stderr.write(`${error instanceof Error
    ? error.message
    : 'Failed to start fixture'}\n`)
  await cache.close()
  if (process.connected)
    process.disconnect()
  process.exitCode = 1
})
