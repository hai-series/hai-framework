/** 两个真实HTTP进程共享Redis限流，调用者地址由socket提供。 */
import { createServer } from 'node:http'
import process from 'node:process'
import { cache } from '@h-ai/cache'
import { kit } from '@h-ai/kit'

async function main() {
  const config = JSON.parse(process.env.KIT_RATE_LIMIT_WORKER)
  const initialized = await cache.init(config.cache)
  if (!initialized.success)
    throw new Error('Cache initialization failed')
  const actualNow = Date.now.bind(Date)
  Date.now = () => actualNow() + config.clockSkew
  const middleware = kit.middleware.rateLimit({ windowMs: 3000, maxRequests: 5, store: kit.middleware.createCacheRateLimitStore(cache, { namespace: config.namespace }) })
  const server = createServer(async (request, response) => {
    try {
      const result = await middleware({ event: { getClientAddress: () => request.socket.remoteAddress }, requestId: 'process-request' }, async () => new Response('allowed'))
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
main().catch(() => {
  process.exitCode = 1
})
