import process from 'node:process'
import { core } from '@h-ai/core'
import { serv } from '@h-ai/serv'
import { createApiServiceApp } from './app.js'
import { initApp } from './lib/server/init.js'

const DEFAULT_PORT = 3000
const logger = core.logger.child({ app: 'api-service', scope: 'entrypoint' })

async function main(): Promise<void> {
  await initApp()

  const port = Number(process.env.PORT ?? DEFAULT_PORT)
  const app = createApiServiceApp()
  const server = serv.adapters.node.listen(app, {
    port,
    onListening: info => logger.info('API service listening', { address: info.address, port: info.port }),
  })

  const close = async () => {
    await server.close()
  }

  process.once('SIGINT', () => {
    void close()
  })
  process.once('SIGTERM', () => {
    void close()
  })
}

main().catch((error: unknown) => {
  logger.error('API service failed to start', { error })
  process.exitCode = 1
})
