/** 真实独立节点；配置文件仅在用例私有临时目录中存在，退出后由父进程回收。 */
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { reach } from '@h-ai/reach'
import { reldb } from '@h-ai/reldb'

async function main() {
  const [bundle, configFile, offset] = process.argv.slice(2)
  const { audit } = await import(bundle)
  const now = Date.now.bind(Date)
  Date.now = () => now() + Number(offset)
  try {
    const config = JSON.parse(await readFile(configFile, 'utf8'))
    const connected = await reldb.init(config.database)
    if (!connected.success)
      throw new Error(connected.error.message)
    const notified = await reach.init({ providers: [{ name: 'notify', type: 'api', url: config.url, timeout: 5000 }] })
    if (!notified.success)
      throw new Error(notified.error.message)
    const initialized = await audit.init({ reach, alerts: config.alerts })
    if (!initialized.success)
      throw new Error(initialized.error.message)
    process.send({ ready: true })
    await once(process, 'message')
    const result = await audit.checkAlerts()
    process.send({ result })
  }
  catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Alert worker failed'}\n`)
    process.exitCode = 1
  }
  finally {
    await audit.close()
    await reach.close()
    await reldb.close()
    if (process.connected)
      process.disconnect()
  }
}

main().catch(() => {
  process.exitCode = 1
})
