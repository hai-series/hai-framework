import { Buffer } from 'node:buffer'
/** 仅 E2E 使用的通知收件箱；真实 HTTP 往返，不输出或持久化验证码/令牌。 */
import { createServer } from 'node:http'
import process from 'node:process'
import { GenericContainer, Wait } from 'testcontainers'

const messages = new Map()
const port = Number(process.env.IAM_NOTIFICATION_PORT ?? 12580)
const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`)
  response.setHeader('Content-Type', 'application/json')
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
  let ldap
  if (process.env.IAM_FIXTURE_LDAP === '1') {
    ldap = await new GenericContainer('osixia/openldap:latest')
      .withExposedPorts({ container: 389, host: 12583 })
      .withEnvironment({ LDAP_ORGANISATION: 'IAM UI Test', LDAP_DOMAIN: 'example.org', LDAP_ADMIN_PASSWORD: 'admin' })
      .withWaitStrategy(Wait.forLogMessage('slapd starting'))
      .start()
    const ldif = ['dn: ou=users,dc=example,dc=org', 'objectClass: organizationalUnit', 'ou: users', '', 'dn: uid=ldapui,ou=users,dc=example,dc=org', 'objectClass: inetOrgPerson', 'uid: ldapui', 'cn: LDAP UI User', 'sn: User', 'mail: ldapui@example.org', 'userPassword: LdapUiTest123', ''].join('\\n')
    const seeded = await ldap.exec(['sh', '-c', `printf '${ldif}' | ldapadd -x -D 'cn=admin,dc=example,dc=org' -w admin`])
    if (seeded.exitCode !== 0)
      throw new Error('LDAP fixture seeding failed')
  }
  server.listen(port, '127.0.0.1')
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
      server.close()
      void ldap?.stop()
    })
  }
}
void start().catch(() => {
  process.exitCode = 1
  process.stderr.write('Notification fixture failed to start')
})
