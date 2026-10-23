/**
 * =============================================================================
 * @h-ai/iam - OpenLDAP 测试容器管理
 * =============================================================================
 *
 * 使用 Testcontainers 启动 OpenLDAP 实例，为 LDAP 认证策略提供集成测试环境。
 * 容器启动后会自动创建测试用户。
 */

import type { StartedTestContainer } from 'testcontainers'
import type { LdapConfig } from '../../src/iam-config.js'
import { GenericContainer, Wait } from 'testcontainers'
import { LdapConfigSchema } from '../../src/iam-config.js'

let containerPromise: Promise<StartedTestContainer> | null = null
let refCount = 0

/** LDAP 容器配置常量 */
const LDAP_ADMIN_PASSWORD = 'admin'
const LDAP_DOMAIN = 'example.org'
const LDAP_BASE_DN = 'dc=example,dc=org'
const LDAP_ADMIN_DN = 'cn=admin,dc=example,dc=org'

/** 测试用户密码 */
const TEST_USER_PASSWORD = 'LdapTestPass123'

/** LDAP 容器租约 */
export interface LdapContainerLease {
  host: string
  port: number
  baseDn: string
  adminDn: string
  adminPassword: string
  url: string
  /** 预置测试用户信息 */
  testUser: {
    username: string
    password: string
    email: string
    displayName: string
    dn: string
  }
  ldapConfig: LdapConfig
  release: () => Promise<void>
}

/**
 * 获取 OpenLDAP 容器
 *
 * 使用引用计数管理容器生命周期。
 * 容器启动后通过 LDIF 创建测试用户。
 */
export async function acquireLdapContainer(): Promise<LdapContainerLease> {
  refCount += 1

  if (!containerPromise) {
    containerPromise = new GenericContainer('docker.io/osixia/openldap:1.5.0')
      .withExposedPorts(389)
      .withEnvironment({
        LDAP_ORGANISATION: 'Example Inc',
        LDAP_DOMAIN,
        LDAP_ADMIN_PASSWORD,
      })
      .withWaitStrategy(Wait.forLogMessage('slapd starting'))
      .start()
  }

  const container = await containerPromise
  const host = container.getHost()
  const port = container.getMappedPort(389)
  const url = `ldap://${host}:${port}`

  // 通过 heredoc + ldapadd 创建测试 OU 和用户
  await seedTestData(container)

  const ldapConfig: LdapConfig = LdapConfigSchema.parse({
    url,
    bindDn: LDAP_ADMIN_DN,
    bindPassword: LDAP_ADMIN_PASSWORD,
    searchBase: `ou=users,${LDAP_BASE_DN}`,
    searchFilter: '(uid={{username}})',
    usernameAttribute: 'uid',
    emailAttribute: 'mail',
    displayNameAttribute: 'cn',
  })

  return {
    host,
    port,
    baseDn: LDAP_BASE_DN,
    adminDn: LDAP_ADMIN_DN,
    adminPassword: LDAP_ADMIN_PASSWORD,
    url,
    testUser: {
      username: 'ldapuser',
      password: TEST_USER_PASSWORD,
      email: 'ldapuser@example.org',
      displayName: 'LDAP Test User',
      dn: `uid=ldapuser,ou=users,${LDAP_BASE_DN}`,
    },
    ldapConfig,
    release: async () => {
      refCount -= 1
      if (refCount <= 0) {
        refCount = 0
        await container.stop()
        containerPromise = null
      }
    },
  }
}

// =============================================================================
// 内部实现
// =============================================================================

/**
 * 向 LDAP 容器写入测试种子数据
 *
 * 通过 LDAP Client 创建 OU 及测试用户，已存在的条目保持不变。
 */
async function seedTestData(container: StartedTestContainer): Promise<void> {
  // 通过真实 LDAP 协议写入，避免 Windows 容器 exec 流的兼容性限制。
  const { AlreadyExistsError, Client } = await import('ldapts')
  const client = new Client({ url: `ldap://${container.getHost()}:${container.getMappedPort(389)}`, timeout: 10_000, connectTimeout: 10_000 })
  try {
    await client.bind(LDAP_ADMIN_DN, LDAP_ADMIN_PASSWORD)
    const entries: [string, Record<string, string[]>][] = [
      [`ou=users,${LDAP_BASE_DN}`, { objectClass: ['organizationalUnit'], ou: ['users'] }],
      [`uid=ldapuser,ou=users,${LDAP_BASE_DN}`, {
        objectClass: ['inetOrgPerson', 'posixAccount', 'shadowAccount'],
        uid: ['ldapuser'],
        sn: ['User'],
        cn: ['LDAP Test User'],
        mail: ['ldapuser@example.org'],
        userPassword: [TEST_USER_PASSWORD],
        uidNumber: ['10000'],
        gidNumber: ['10000'],
        homeDirectory: ['/home/ldapuser'],
      }],
    ]
    for (const [dn, attributes] of entries) {
      try {
        await client.add(dn, attributes)
      }
      catch (error) {
        if (!(error instanceof AlreadyExistsError))
          throw error
      }
    }
  }
  finally {
    await client.unbind()
  }
}
