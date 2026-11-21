/** 框架专项测试夹具：条件写入真实 .env.test；服务始终运行原 package script。 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { parseEnv } from 'node:util'

// 从公开安装入口加载，避免仓库 IDE 路径映射把 Playwright 引向未构建源码。
const { core }: typeof import('@h-ai/core') = await import(pathToFileURL(createRequire(path.resolve('package.json')).resolve('@h-ai/core')).href)

/** 为专项功能选择明确测试配置，不返回或注入子进程环境。普通应用启动不调用此夹具。 */
export function testServer<T extends { command: string, cwd?: string }>(profile: Record<string, string> | string, server: T, envDir = server.cwd ?? process.cwd()): T {
  // Playwright worker 只执行用例；--list 只发现用例，均不得改写运行配置。
  if (process.env.TEST_WORKER_INDEX !== undefined || process.argv.includes('--list'))
    return server
  const cwd = server.cwd ?? process.cwd()
  const data = process.env.HAI_E2E_DATA_ROOT
  if (!data || !path.isAbsolute(data))
    throw new Error('Run framework scenario tests through their managed test entrypoint')
  const values = typeof profile === 'string'
    ? parseEnv(readFileSync(path.resolve(cwd, profile), 'utf8'))
    : { ...profile }
  if (values.HAI_CRYPTO_TRANSPORT_SERVERKEYRING !== undefined)
    throw new Error('Scenario fixtures cannot supply a server keyring; use the actual test configuration')
  const backupFile = path.join(data, 'environment-backups.json')
  const backups: Record<string, string> = existsSync(backupFile)
    ? JSON.parse(readFileSync(backupFile, 'utf8'))
    : {}
  {
    const directory = path.resolve(envDir)
    const file = path.join(directory, '.env.test')
    if (!existsSync(file))
      throw new Error('The application must declare its test environment before scenario tests')
    const before = readFileSync(file, 'utf8')
    if (!Object.hasOwn(backups, file)) {
      backups[file] = before
      writeFileSync(backupFile, JSON.stringify(backups), { mode: 0o600 })
    }
    const configured: Record<string, string> = {}
    for (const [name, value] of Object.entries({
      ...parseEnv(before),
      ...values,
    })) {
      if (value !== undefined)
        configured[name] = value
    }
    if (configured.HAI_DB || configured.HAI_DB_DATABASE)
      configured.HAI_DB_DATABASE = path.join(data, 'app.db')
    if (configured.HAI_STORAGE || configured.HAI_STORAGE_ROOT)
      configured.HAI_STORAGE_ROOT = path.join(data, 'uploads')
    if (configured.HAI_VECDB || configured.HAI_VECDB_PATH)
      configured.HAI_VECDB_PATH = path.join(data, 'vecdb')
    writeFileSync(file, core.config.stringifyEnv(configured))
  }
  return server
}

/** 专项通知用例使用已登记的本机 HTTP 收件箱，配置仍经应用正常 dotenv 入口加载。 */
export function notificationConfig(): Record<string, string> {
  const address = process.env.IAM_NOTIFICATION_URL
  if (!address)
    return {}
  const url = new URL(address)
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password)
    throw new Error('Notification scenario requires its loopback HTTP fixture')
  return {
    HAI_IAM_LOGIN_OTP: 'true',
    HAI_IAM_PASSWORDRESET_ENABLED: 'true',
    HAI_REACH_PROVIDERS: JSON.stringify(['email', 'sms'].map(name => ({ name, type: 'api', url: new URL('/send', url).href }))),
    HAI_REACH_TEMPLATES: JSON.stringify([
      { name: 'otp_email', provider: 'email', body: 'Code: {code}' },
      { name: 'otp_sms', provider: 'sms', body: 'Code: {code}' },
      { name: 'password_reset', provider: 'email', body: 'Reset: {token}' },
      { name: 'password_reset_sms', provider: 'sms', body: 'Reset: {token}' },
    ]),
    HAI_IAM_AGREEMENTS: JSON.stringify({
      showOnRegister: true,
      showOnLogin: true,
      userAgreementMarkdown: '# Configured registration agreement\n\n**Registration terms**\n\n- Keep your account credentials secure.',
      userAgreementUrl: new URL('/terms', url).href,
      privacyPolicyUrl: new URL('/privacy', url).href,
    }),
  }
}

/** 用例读取应用真正消费的初始密码；缺项直接报错，不能用测试密码掩盖。 */
export function configuredPassword(name: string): string {
  const loaded = core.config.loadEnvFiles({
    mode: 'test',
    envDir: process.cwd(),
  })
  if (!loaded.success)
    throw new Error(loaded.error.message)
  const value = loaded.data[name]
  if (!value)
    throw new Error(`Missing actual test configuration: ${name}`)
  return value
}
