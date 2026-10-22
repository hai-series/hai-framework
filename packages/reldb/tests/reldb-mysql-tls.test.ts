/** 真实 CA/DNS 验证及双向 TLS；不用跳过验证冒充安全握手。 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { HaiReldbError, reldb, ReldbConfigSchema } from '../src/index.js'
import { createMysqlTlsFixture } from './helpers/mysql-tls-fixture.js'

describe('mysql TLS configuration', () => {
  it('defaults an empty TLS object to certificate and hostname checks and rejects unsupported flags', () => {
    const parsed = ReldbConfigSchema.parse({ type: 'mysql', database: 'test', ssl: {} })
    expect(parsed.type === 'mysql' && parsed.ssl).toEqual({ rejectUnauthorized: true, verifyIdentity: true })
    for (const ssl of [true, 'require', 'prefer', 'allow', 'disable', { unknown: true }, { cert: 'cert-only' }, { key: 'key-only' }])
      expect(ReldbConfigSchema.safeParse({ type: 'mysql', database: 'test', ssl }).success).toBe(false)
    for (const url of ['mysql://localhost/test?ssl=false', 'mysql://localhost/test#ssl'])
      expect(ReldbConfigSchema.safeParse({ type: 'mysql', url }).success).toBe(false)
    expect(ReldbConfigSchema.safeParse({ type: 'mysql', database: 'test', ssl: false }).success).toBe(true)
    expect(ReldbConfigSchema.safeParse({ type: 'postgresql', database: 'test', ssl: true }).success).toBe(true)
  })
})

describe('mysql real TLS', () => {
  let fixture: Awaited<ReturnType<typeof createMysqlTlsFixture>>
  beforeAll(async () => {
    fixture = await createMysqlTlsFixture('localhost')
  }, 180_000)
  afterEach(async () => {
    expect((await reldb.close()).success).toBe(true)
  })
  afterAll(async () => {
    await fixture?.close()
  }, 30_000)

  /** 服务端实际 TLS 会话必须有密码套件，不能仅检查配置或连接成功。 */
  async function expectEncrypted(): Promise<void> {
    const cipher = await reldb.sql.get<{ Value: string }>('SHOW SESSION STATUS LIKE \'Ssl_cipher\'')
    expect(cipher.success).toBe(true)
    if (cipher.success)
      expect(cipher.data?.Value).toMatch(/^TLS_|^ECDHE-/)
  }

  it('authenticates a trusted CA and matching DNS name before executing an encrypted query', async () => {
    expect((await reldb.init(fixture.config)).success).toBe(true)
    await expectEncrypted()
  })

  it('rejects a wrong CA before publishing the pool', async () => {
    const result = await reldb.init({ ...fixture.config, ssl: { ca: fixture.wrongCa } })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiReldbError.CONNECTION_FAILED.code)
    expect(reldb.isInitialized).toBe(false)
  })

  it('requires a paired client certificate and key for an account requiring X509', async () => {
    expect((await reldb.init(fixture.clientConfig)).success).toBe(true)
    await expectEncrypted()
    const snapshot = reldb.config
    expect(snapshot?.type).toBe('mysql')
    expect(typeof (snapshot?.type === 'mysql' && snapshot.ssl)).toBe('object')
    const exposed = snapshot?.type === 'mysql' && snapshot.ssl && snapshot.ssl.key !== '[REDACTED]'
    // 只断言布尔值，失败日志也不能输出实际私钥。
    expect(Boolean(exposed)).toBe(false)
    expect((await reldb.close()).success).toBe(true)
    const withoutClient = await reldb.init({ ...fixture.clientConfig, ssl: fixture.config.ssl })
    expect(withoutClient.success).toBe(false)
    if (!withoutClient.success)
      expect(withoutClient.error.code).toBe(HaiReldbError.CONNECTION_FAILED.code)
  })

  it('rejects IP hostname verification and permits explicitly unauthenticated TLS with a risk log', async () => {
    const verified = await reldb.init({ ...fixture.config, host: '127.0.0.1' })
    expect(verified.success).toBe(false)
    if (!verified.success)
      expect(verified.error.code).toBe(HaiReldbError.CONFIG_ERROR.code)
    expect((await reldb.init({ ...fixture.config, host: '127.0.0.1', ssl: { rejectUnauthorized: false } })).success).toBe(true)
    await expectEncrypted()
  })
})

it('rejects a trusted chain with a different DNS SAN before executing SQL', async () => {
  const fixture = await createMysqlTlsFixture('different.invalid')
  try {
    const result = await reldb.init(fixture.config)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiReldbError.CONNECTION_FAILED.code)
      expect(result.error.cause).toHaveProperty('code', 'HANDSHAKE_SSL_ERROR')
    }
    expect(reldb.isInitialized).toBe(false)
  }
  finally {
    expect((await reldb.close()).success).toBe(true)
    await fixture.close()
  }
}, 180_000)
