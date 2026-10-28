/** 用真实 Node HTTP 与 typed client 验证安全策略不能只停留在 IAM 内部。 */
import type { User } from '@h-ai/iam'
import { once } from 'node:events'
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'
import { audit } from '@h-ai/audit'
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { HaiIamError, iam } from '@h-ai/iam'
import { reldb } from '@h-ai/reldb'
import { pbkdf2, solveChallenge } from 'altcha/lib'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createIamProcedures } from '../src/features/serv-feature-iam.js'
import { serv } from '../src/serv-main.js'

const contract = apiContract.create({ iam: apiContract.iam })
const client = apiClient.create(contract)
let server: ReturnType<typeof serv.listen> | undefined
let httpBaseUrl = ''
let proof: string | undefined
const password = 'ExampleOnly123!'
let writerRoleId = ''

beforeAll(async () => {
  expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  expect((await cache.init({ type: 'memory' })).success).toBe(true)
  expect((await audit.init()).success).toBe(true)
  expect((await iam.init({})).success).toBe(true)
  const permission = await iam.authz.createPermission({ code: 'iam.users.write', name: 'User management' })
  if (!permission.success)
    throw new Error(permission.error.message)
  const role = await iam.authz.createRole({ code: 'http-security-writer', name: 'HTTP fixture writer', permissionIds: [permission.data.id] })
  if (!role.success)
    throw new Error(role.error.message)
  writerRoleId = role.data.id
  const app = serv.createApp({ contract, procedures: { iam: createIamProcedures({ iam }) }, iam })
  server = serv.listen(app, { host: '127.0.0.1', port: 0 })
  await once(server.server, 'listening')
  const address = server.server.address()
  if (!address || typeof address === 'string')
    throw new Error('Security HTTP fixture did not start')
  httpBaseUrl = `http://127.0.0.1:${address.port}`
  expect((await client.init({ baseUrl: `http://127.0.0.1:${address.port}/api/v1`, headers: () => ({ 'x-forwarded-for': '192.0.2.9', ...(proof ? { 'x-hai-reauthentication': proof } : {}) }), auth: { storage: apiClient.tokenStorage.memory() } })).success).toBe(true)
})

afterAll(async () => {
  await client.close()
  await server?.close()
  await iam.close()
  await audit.close()
  await cache.close()
  await reldb.close()
})

async function signInAdmin() {
  const registered = await iam.user.register({ username: `http-admin-${crypto.randomUUID()}`, password })
  if (!registered.success)
    throw new Error(registered.error.message)
  expect((await iam.authz.assignRole(registered.data.user.id, writerRoleId)).success).toBe(true)
  const actions = apiClient.createAuthActions(client)
  expect((await actions.login({ identifier: registered.data.user.username, password })).success).toBe(true)
}

it('真实 HTTP 生成并核对轻量挑战，客户端映射不丢证明且重放失败', async () => {
  await iam.close()
  expect((await iam.init({ captcha: { enabled: true, cost: 100, maxCounter: 2 } })).success).toBe(true)
  try {
    const username = `captcha-http-${crypto.randomUUID()}`
    expect((await iam.user.createUser({ username, password })).success).toBe(true)
    const actions = apiClient.createAuthActions(client)
    expect(await actions.login({ identifier: username, password })).toMatchObject({ success: false, error: { code: HaiIamError.CAPTCHA_REQUIRED.code } })
    const created = await actions.createCaptcha({ operation: 'login' })
    if (!created.success)
      throw new Error(created.error.message)
    const solution = await solveChallenge({ challenge: created.data.challenge, deriveKey: pbkdf2.deriveKey })
    expect(solution).not.toBeNull()
    const captcha = JSON.stringify({ id: created.data.id, solution })
    expect((await actions.login({ identifier: username, password, captcha })).success).toBe(true)
    expect(await actions.login({ identifier: username, password, captcha })).toMatchObject({ success: false, error: { code: HaiIamError.CAPTCHA_INVALID.code } })
  }
  finally {
    await iam.close()
    expect((await iam.init({})).success).toBe(true)
  }
})

it('真实 HTTP 拒绝事件携带已验证身份、可信连接地址和关联编号', async () => {
  await signInAdmin()
  const auditRequestId = `audit-http-${crypto.randomUUID()}`
  await core.context.run({ requestId: auditRequestId }, async () => {
    expect(await client.iam.roles.create({ code: 'forbidden-role', name: 'Forbidden role' })).toMatchObject({ success: false })
    const logs = await audit.list({ requestId: auditRequestId, action: 'request.execute' })
    expect(logs).toMatchObject({ success: true, data: { total: 1, items: [{ resource: 'iam.roles.create', category: 'system', outcome: 'denied', severity: 'warning', requestId: auditRequestId, actorSnapshot: { roles: expect.arrayContaining(['http-security-writer']) } }] } })
    if (logs.success) {
      expect(logs.data.items[0]!.ipAddress).toMatch(/127\.0\.0\.1/)
      expect(logs.data.items[0]!.details).not.toContain(password)
    }
  })
})

it('契约校验前失败与缺失路由也留下安全事件，不记录输入内容', async () => {
  const requestId = `audit-validation-${crypto.randomUUID()}`
  const response = await fetch(`${httpBaseUrl}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-request-id': requestId, 'x-forwarded-for': '192.0.2.9' }, body: JSON.stringify({ password: 'Private invalid input' }) })
  expect(response.status).toBe(400)
  const logs = await audit.list({ requestId, action: 'http.reject' })
  expect(logs).toMatchObject({ success: true, data: { total: 1, items: [{ category: 'system', outcome: 'failure', actorSnapshot: null }] } })
  if (logs.success) {
    expect(logs.data.items[0]!.ipAddress).toMatch(/127\.0\.0\.1/)
    expect(JSON.stringify(logs.data.items)).not.toContain('Private invalid input')
  }
  const missingId = `audit-missing-${crypto.randomUUID()}`
  expect((await fetch(`${httpBaseUrl}/missing/Private-path`, { headers: { 'x-request-id': missingId } })).status).toBe(404)
  const missing = await audit.list({ requestId: missingId, action: 'http.reject' })
  expect(missing).toMatchObject({ success: true, data: { total: 1 } })
  if (missing.success)
    expect(JSON.stringify(missing.data.items)).not.toContain('Private-path')
})

it('首次改密端点完成后才能取得普通会话，typed client 使用新契约', async () => {
  await iam.close()
  expect((await iam.init({ password: { requireInitialChange: true } })).success).toBe(true)
  const username = `http-initial-${crypto.randomUUID()}`
  expect((await iam.user.createUser({ username, password })).success).toBe(true)
  expect(await client.iam.auth.login({ identifier: username, password })).toMatchObject({ success: false, error: { code: HaiIamError.PASSWORD_CHANGE_REQUIRED.code } })
  const reused = await client.iam.auth.renewPassword({ identifier: username, password, newPassword: password })
  expect(reused).toMatchObject({ success: false, error: { code: HaiIamError.PASSWORD_REUSE_NOT_ALLOWED.code, traceId: expect.any(String) } })
  for (const identifier of [username, `missing-${username}`]) {
    const rejected = await client.iam.auth.renewPassword({ identifier, password: 'IncorrectPassword123!', newPassword: 'SelectedPassword123!' })
    expect(rejected).toMatchObject({ success: false, error: { code: HaiIamError.INVALID_CREDENTIALS.code, traceId: expect.any(String) } })
    if (!rejected.success) {
      expect(rejected.error.message).toMatch(/用户名或密码不正确|Username or password is incorrect/)
      expect(rejected.error).not.toHaveProperty('cause')
    }
  }
  expect(await client.iam.auth.login({ identifier: username, password })).toMatchObject({ success: false, error: { code: HaiIamError.PASSWORD_CHANGE_REQUIRED.code } })
  expect((await client.iam.auth.renewPassword({ identifier: username, password, newPassword: 'SelectedPassword123!' })).success).toBe(true)
  expect((await client.iam.auth.login({ identifier: username, password: 'SelectedPassword123!' })).success).toBe(true)
})

it('连接地址由 Node adapter 提供，伪造转发头不能绕过地址策略', async () => {
  await iam.close()
  expect((await iam.init({ loginAccess: { enabled: true, allowIps: ['192.0.2.0/24'] } })).success).toBe(true)
  const username = `http-ip-${crypto.randomUUID()}`
  expect((await iam.user.register({ username, password })).success).toBe(true)
  expect(await client.iam.auth.login({ identifier: username, password })).toMatchObject({ success: false, error: { code: HaiIamError.LOGIN_ACCESS_DENIED.code } })
  await iam.close()
  expect((await iam.init({ loginAccess: { enabled: true, allowIps: ['127.0.0.0/8'] } })).success).toBe(true)
  expect((await client.iam.auth.login({ identifier: username, password })).success).toBe(true)
})

it('hTTP 写操作读取单次证明，不能仅通过隐藏按钮实现再鉴别', async () => {
  await iam.close()
  expect((await iam.init({ reauthentication: { enabled: true, operations: ['iam.users.delete'] } })).success).toBe(true)
  await signInAdmin()
  const victim = await iam.user.createUser({ username: `http-victim-${crypto.randomUUID()}`, password })
  if (!victim.success)
    throw new Error(victim.error.message)
  expect(await client.iam.users.delete({ id: victim.data.user.id })).toMatchObject({ success: false, error: { code: HaiIamError.REAUTHENTICATION_REQUIRED.code } })
  const issued = await client.iam.auth.reauthenticate({ password, operation: 'iam.users.delete' })
  if (!issued.success)
    throw new Error(issued.error.message)
  proof = issued.data.ticket
  try {
    expect((await client.iam.users.delete({ id: victim.data.user.id })).success).toBe(true)
    expect(await client.iam.users.delete({ id: victim.data.user.id })).toMatchObject({ success: false, error: { code: HaiIamError.TICKET_INVALID.code } })
  }
  finally { proof = undefined }
})

it('管理端邀请契约不接收密码，接收人可通过重置端点完成设密', async () => {
  const deliveries: { user: User, token: string }[] = []
  await iam.close()
  expect((await iam.init({ initialCredentials: { enabled: true }, onPasswordResetRequest: async (user, token) => {
    deliveries.push({ user, token })
  } })).success).toBe(true)
  await signInAdmin()
  const created = await client.iam.users.invite({ username: `http-invite-${crypto.randomUUID()}`, email: 'invited@example.com' })
  expect(created.success).toBe(true)
  expect(deliveries).toHaveLength(1)
  const delivery = deliveries[0]!
  expect((await client.iam.auth.confirmPasswordReset({ token: delivery.token, newPassword: 'InvitedPassword123!' })).success).toBe(true)
  expect((await client.iam.auth.login({ identifier: delivery.user.username, password: 'InvitedPassword123!' })).success).toBe(true)
})

it.each(['iam.profile.update', 'iam.profile.avatar'])('标准资料入口也执行 %s 再认证，不能绕过独立资料入口', async (operation) => {
  await iam.close()
  expect((await iam.init({ reauthentication: { enabled: true, operations: [operation] } })).success).toBe(true)
  await signInAdmin()
  const input = operation.endsWith('avatar') ? { avatarUrl: 'https://example.test/avatar.png' } : { displayName: 'Updated profile' }
  const unprotected = operation.endsWith('avatar') ? { displayName: 'Unprotected profile' } : { avatarUrl: 'https://example.test/unprotected-avatar.png' }
  expect((await client.iam.auth.updateCurrentUser(unprotected)).success).toBe(true)
  expect(await client.iam.auth.updateCurrentUser({ displayName: 'Mixed update', avatarUrl: 'https://example.test/mixed-avatar.png' })).toMatchObject({ success: false, error: { code: HaiIamError.REAUTHENTICATION_REQUIRED.code } })
  expect(await client.iam.auth.updateCurrentUser(input)).toMatchObject({ success: false, error: { code: HaiIamError.REAUTHENTICATION_REQUIRED.code } })
  const issued = await client.iam.auth.reauthenticate({ password, operation })
  expect(issued.success).toBe(true)
  if (!issued.success)
    return
  proof = issued.data.ticket
  try {
    expect((await client.iam.auth.updateCurrentUser(input)).success).toBe(true)
    expect((await client.iam.auth.updateCurrentUser(input)).success).toBe(false)
  }
  finally { proof = undefined }
})
