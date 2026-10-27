/** 独立生产模式节点；配置和结果只经 IPC 传递，不打印凭据。 */
import process from 'node:process'
import { audit } from '@h-ai/audit'
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { reldb } from '@h-ai/reldb'

const input = JSON.parse(process.env.IAM_POLICY_FIXTURE)
let settings = input.iam
let releaseSeed
const seedGate = new Promise((resolve) => {
  releaseSeed = resolve
})
let paused = false
core.init({ logging: { level: 'fatal' } })
function checked(result) {
  if (!result.success)
    throw new Error(String(result.error.code))
  return result.data
}
async function close() {
  await iam.close()
  await audit.close()
  await cache.close()
  await reldb.close()
}
async function execute(action, args) {
  switch (action) {
    case 'login': return iam.auth.login(args.credentials, args.context)
    case 'captcha': return iam.auth.createCaptcha(args)
    case 'verify': return iam.auth.verifyToken(args.token)
    case 'refresh': return iam.session.refresh(args.token)
    case 'reauthenticate': return iam.auth.reauthenticate(args.token, args.password, args.operation)
    case 'checkSensitive': return iam.auth.checkSensitiveOperation(args.token, args.operation, args.ticket)
    case 'permission': return iam.authz.checkPermission(args.userId, args.permission)
    case 'renameRole': return iam.authz.updateRole(args.id, { code: args.code })
    case 'updateUser': return iam.user.updateUser(args.id, args.data)
    case 'setRules': return iam.authz.setPermissionSensitiveOperations(args.id, args.operations)
    case 'publicConfig': return iam.getPublicConfig()
    case 'configure':
      await iam.close()
      settings = { ...input.iam, ...args }
      return iam.init(settings)
    case 'disconnectCache': return cache.close()
    case 'reconnectCache': return cache.init(input.cache)
    case 'disconnectDatabase': return reldb.close()
    case 'reconnectDatabase':
      // 显式依赖生命周期重建时同步重建 IAM；不同于驱动自动重连。
      await iam.close()
      checked(await reldb.init(input.db))
      return iam.init(settings)
    case 'close':
      await close()
      return { success: true, data: null }
    default: throw new Error('fixture:unknown-action')
  }
}
process.on('message', (message) => {
  if (message.action === 'releaseSeed') {
    releaseSeed()
    return
  }
  void execute(message.action, message.args ?? {}).then((result) => {
    process.send?.({ id: message.id, result }, () => {
      if (message.action === 'close')
        process.disconnect()
    })
  }).catch(async () => {
    process.send?.({ id: message.id, failed: true })
    process.exitCode = 1
    await close()
    process.disconnect()
  })
})
async function main() {
  checked(await reldb.init(input.db))
  checked(await cache.init(input.cache))
  checked(await audit.init())
  if (input.seedBarrier) {
    const pause = async (sql, params, execute) => {
      if (!paused && /INSERT INTO\s+"?hai_iam_roles/i.test(sql)) {
        paused = true
        process.send?.({ phase: 'seed-ready' })
        await seedGate
      }
      return execute(sql, params)
    }
    const begin = reldb.tx.begin
    reldb.tx.begin = async () => {
      const started = await begin()
      if (started.success) {
        const execute = started.data.execute
        started.data.execute = (sql, params) => pause(sql, params, execute)
      }
      return started
    }
  }
  checked(await iam.init(settings))
  process.send?.({ phase: 'ready' })
}
void main().catch(async (error) => {
  process.send?.({ phase: 'failed', code: /^hai:[\w-]+:\d{3}$/.test(error.message) ? error.message : 'fixture:failed' })
  process.exitCode = 1
  await close()
  process.disconnect()
})
