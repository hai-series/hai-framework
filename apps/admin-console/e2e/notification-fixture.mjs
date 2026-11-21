import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
/** 仅 E2E 使用的通知收件箱；真实 HTTP 往返，不输出或持久化验证码/令牌。 */
import { createServer } from 'node:http'
import process from 'node:process'
import { core } from '@h-ai/core'
import { GenericContainer, Wait } from 'testcontainers'

const messages = new Map()
let ldap
const port = Number(process.env.IAM_NOTIFICATION_PORT ?? 12580)
const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`)
  response.setHeader('Content-Type', 'application/json')
  if (request.method === 'POST' && url.pathname === '/shutdown') {
    const container = ldap
    ldap = undefined
    await container?.stop()
    response.end(JSON.stringify({ stopped: true }))
    server.close()
    return
  }
  if (request.method === 'POST' && url.pathname === '/send') {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const message = JSON.parse(Buffer.concat(chunks).toString())
    const existing = messages.get(message.to) ?? []
    existing.push(message)
    messages.set(message.to, existing.slice(-20))
    response.end(JSON.stringify({ messageId: `fixture-${existing.length}` }))
    return
  }
  if (url.pathname === '/messages') {
    response.end(JSON.stringify(messages.get(url.searchParams.get('to')) ?? []))
    return
  }
  if (url.pathname === '/terms' || url.pathname === '/privacy') {
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.end('<!doctype html><html><body><h1>Test agreement</h1><p>Registration and privacy terms.</p></body></html>')
    return
  }
  response.end(JSON.stringify({ ready: true }))
})
async function start() {
  if (process.argv.includes('--ldap')) {
    // 只配置本测试夹具的容器客户端，应用仍从实际模式文件读取 LDAP 配置。
    const engine = process.env.HAI_TEST_CONTAINER_ENGINE
    if (engine && !['podman', 'docker'].includes(engine))
      throw new Error('HAI_TEST_CONTAINER_ENGINE must be podman or docker')
    if (!process.env.DOCKER_HOST && engine !== 'docker') {
      try {
        const socket = execFileSync('podman', process.platform === 'win32'
          ? [
              'machine',
              'inspect',
              '--format',
              '{{.ConnectionInfo.PodmanPipe.Path}}',
            ]
          : ['info', '--format', '{{.Host.RemoteSocket.Path}}'], { encoding: 'utf8', timeout: 5_000, windowsHide: true }).trim()
        process.env.DOCKER_HOST = process.platform === 'win32'
          ? `npipe://${socket.replaceAll('\\', '/')}`
          : socket
        if (process.platform === 'win32')
          process.env.TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE = execFileSync('podman', ['info', '--format', '{{.Host.RemoteSocket.Path}}'], { encoding: 'utf8', timeout: 5_000, windowsHide: true }).trim().replace(/^unix:\/\//, '')
      }
      catch (error) {
        if (engine === 'podman')
          throw error
      }
    }
    ldap = await new GenericContainer('docker.io/osixia/openldap:1.5.0')
      .withExposedPorts({ container: 389, host: 12583 })
      .withEnvironment({ LDAP_ORGANISATION: 'IAM UI Test', LDAP_DOMAIN: 'example.org', LDAP_ADMIN_PASSWORD: 'admin' })
      .withWaitStrategy(Wait.forLogMessage('slapd starting'))
      .start()
    // 用真实 LDAP 请求种数据，兼容不支持容器 exec 流的运行时。
    const { Client } = await import('ldapts')
    const client = new Client({ url: `ldap://${ldap.getHost()}:${ldap.getMappedPort(389)}`, timeout: 10_000, connectTimeout: 10_000 })
    try {
      await client.bind('cn=admin,dc=example,dc=org', 'admin')
      await client.add('ou=users,dc=example,dc=org', {
        objectClass: ['organizationalUnit'],
        ou: ['users'],
      })
      await client.add('uid=ldapui,ou=users,dc=example,dc=org', {
        objectClass: ['inetOrgPerson'],
        uid: ['ldapui'],
        cn: ['LDAP UI User'],
        sn: ['User'],
        mail: ['ldapui@example.org'],
        userPassword: ['LdapUiTest123'],
      })
    }
    finally { await client.unbind() }
  }
  server.listen(port, '127.0.0.1')
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
      server.close()
      void ldap?.stop()
    })
  }
}
void start().catch(async (error) => {
  process.exitCode = 1
  core.logger.error('Notification fixture failed to start', { error })
  try {
    await ldap?.stop()
    ldap = undefined
  }
  catch (cleanupError) {
    core.logger.error('Notification fixture cleanup failed', { error: cleanupError })
  }
})
