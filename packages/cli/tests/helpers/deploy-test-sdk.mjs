/** 真正调用公开 SDK；独立进程让测试取消可以回收其 SSH/打包命令树。 */
import process from 'node:process'
import { deploy, getDeployCommandState } from '@h-ai/deploy'

let remoteUnknown = false

try {
  const { config, service, artifactDir, runtime } = JSON.parse(process.argv[2])
  const initialized = await deploy.init(config)
  if (!initialized.success)
    throw new Error(initialized.error.message)
  const result = await deploy.deployApp(service, { environment: 'test', artifactDir, runtime })
  if (!result.success) {
    remoteUnknown = getDeployCommandState(result.error)?.remoteExecution === 'unknown'
    throw new Error(result.error.message)
  }
  if (result.data.healthCheck !== 'passed')
    throw new Error('SDK deployment did not pass its health check')
}
catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message.slice(-6000) : 'SDK deployment failed'}\n`)
  // 固定测试私有退出码只传递 unknown 状态，不把配置/密钥载荷写入诊断。
  process.exitCode = remoteUnknown ? 76 : 1
}
finally {
  await deploy.close()
}
