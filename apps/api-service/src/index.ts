import type { ServConfig } from '@h-ai/serv'
import process from 'node:process'
import { core } from '@h-ai/core'
import { serv } from '@h-ai/serv'
import { createApiServiceApp } from './app.js'
import { closeApp, initApp } from './lib/server/init.js'

const logger = core.logger.child({ app: 'api-service', scope: 'entrypoint' })

async function main(): Promise<void> {
  await initApp()

  // host/port 来自 config/_serv.yml 的 server（HOST/PORT 环境变量高于配置文件）。
  const { server } = core.config.getOrThrow<ServConfig>('serv')
  serv.listen(createApiServiceApp(), {
    host: server.host,
    port: server.port,
    onListening: info => logger.info('API service listening', { address: info.address, port: info.port }),
    onClose: closeApp,
  })
}

main().catch((error: unknown) => {
  logger.error('API service failed to start', { error })
  process.exitCode = 1
})
