/**
 * =============================================================================
 * @hai/iam - OpenLDAP 测试容器管理
 * =============================================================================
 *
 * 使用 Testcontainers 启动 OpenLDAP 实例，为 LDAP 认证策略提供集成测试环境。
 * 容器启动后会自动创建测试用户。
 */

import type { StartedTestContainer } from 'testcontainers'
import type { LdapClient, LdapClientFactory, LdapSearchEntry } from '../../src/authn/ldap/iam-authn-ldap-strategy.js'
import type { LdapConfig } from '../../src/iam-config.js'
import type { IamError } from '../../src/iam-types.js'
import { err, ok } from '@hai/core'
import { GenericContainer, Wait } from 'testcontainers'
import { IamErrorCode } from '../../src/iam-config.js'

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
  ldapClientFactory: LdapClientFactory
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
    containerPromise = new GenericContainer('osixia/openldap:latest')
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

  const ldapConfig: LdapConfig = {
    url,
    bindDn: LDAP_ADMIN_DN,
    bindPassword: LDAP_ADMIN_PASSWORD,
    searchBase: `ou=users,${LDAP_BASE_DN}`,
    searchFilter: '(uid={{username}})',
    usernameAttribute: 'uid',
    emailAttribute: 'mail',
    displayNameAttribute: 'cn',
  }

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
    ldapClientFactory: createTestLdapClientFactory(),
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
 * 通过 sh -c 执行 heredoc + ldapadd 创建 OU 及测试用户。
 * 若资源已存在（exitCode = 68），静默忽略。
 */
async function seedTestData(container: StartedTestContainer): Promise<void> {
  const ldifLines = [
    `dn: ou=users,${LDAP_BASE_DN}`,
    'objectClass: organizationalUnit',
    'ou: users',
    '',
    `dn: uid=ldapuser,ou=users,${LDAP_BASE_DN}`,
    'objectClass: inetOrgPerson',
    'objectClass: posixAccount',
    'objectClass: shadowAccount',
    'uid: ldapuser',
    'sn: User',
    'cn: LDAP Test User',
    'mail: ldapuser@example.org',
    `userPassword: ${TEST_USER_PASSWORD}`,
    'uidNumber: 10000',
    'gidNumber: 10000',
    'homeDirectory: /home/ldapuser',
  ]

  // 使用 printf + 管道向 ldapadd 传入 LDIF 数据
  const ldifEscaped = ldifLines.join('\\n')
  const cmd = `printf '${ldifEscaped}' | ldapadd -x -D '${LDAP_ADMIN_DN}' -w '${LDAP_ADMIN_PASSWORD}'`

  const execResult = await container.exec(['sh', '-c', cmd])

  // exitCode 68 = already exists，静默忽略
  if (execResult.exitCode !== 0 && execResult.exitCode !== 68) {
    console.warn(`ldapadd exited with code ${execResult.exitCode}: ${execResult.output}`)
  }
}

/**
 * 创建测试用 LDAP 客户端工厂
 *
 * 基于容器内 ldapwhoami/ldapsearch 命令实现，避免引入 ldapjs 依赖。
 */
function createTestLdapClientFactory(): LdapClientFactory {
  return async (_config: LdapConfig): Promise<Result<LdapClient, IamError>> => {
    const client = createSimpleLdapClient(_config)
    return ok(client)
  }
}

/**
 * 简易 LDAP 客户端
 *
 * 通过容器内 ldapwhoami/ldapsearch 命令执行 LDAP 操作。
 * 避免引入 ldapjs 依赖。
 */
function createSimpleLdapClient(config: LdapConfig): LdapClient {
  return {
    async bind(dn: string, password: string): Promise<Result<void, IamError>> {
      try {
        const container = await containerPromise
        if (!container) {
          return err({
            code: IamErrorCode.LDAP_CONNECTION_FAILED,
            message: 'LDAP container not available',
          })
        }

        // 使用容器内 ldapwhoami 验证绑定凭证
        const result = await container.exec([
          'ldapwhoami',
          '-x',
          '-H',
          'ldap://localhost:389',
          '-D',
          dn,
          '-w',
          password,
        ])

        if (result.exitCode !== 0) {
          return err({
            code: IamErrorCode.LDAP_BIND_FAILED,
            message: `Bind failed for ${dn}: ${result.output}`,
          })
        }

        return ok(undefined)
      }
      catch (error) {
        return err({
          code: IamErrorCode.LDAP_BIND_FAILED,
          message: `Bind failed: ${(error as Error).message}`,
        })
      }
    },

    async search(base: string, filter: string, attributes: string[]): Promise<Result<LdapSearchEntry[], IamError>> {
      try {
        const container = await containerPromise
        if (!container) {
          return err({
            code: IamErrorCode.LDAP_SEARCH_FAILED,
            message: 'LDAP container not available',
          })
        }

        const args = [
          'ldapsearch',
          '-x',
          '-H',
          'ldap://localhost:389',
          '-D',
          config.bindDn,
          '-w',
          config.bindPassword,
          '-b',
          base,
          '-LLL',
          filter,
          ...attributes,
        ]

        const result = await container.exec(args)

        // exitCode 32 = no such object（搜索结果为空），返回空数组
        if (result.exitCode === 32) {
          return ok([])
        }

        if (result.exitCode !== 0) {
          return err({
            code: IamErrorCode.LDAP_SEARCH_FAILED,
            message: `Search failed: ${result.output}`,
          })
        }

        const entries = parseLdifOutput(result.output)
        return ok(entries)
      }
      catch (error) {
        return err({
          code: IamErrorCode.LDAP_SEARCH_FAILED,
          message: `Search failed: ${(error as Error).message}`,
        })
      }
    },

    async unbind(): Promise<Result<void, IamError>> {
      return ok(undefined)
    },
  }
}

/**
 * 解析 ldapsearch 的 LDIF 输出为结构化条目
 */
function parseLdifOutput(output: string): LdapSearchEntry[] {
  const entries: LdapSearchEntry[] = []
  const blocks = output.split('\n\n').filter(b => b.trim())

  for (const block of blocks) {
    const lines = block.split('\n').filter(l => l.trim() && !l.startsWith('#'))
    let dn = ''
    const attributes: Record<string, string | string[]> = {}

    for (const line of lines) {
      const colonIdx = line.indexOf(':')
      if (colonIdx === -1)
        continue

      const key = line.substring(0, colonIdx).trim()
      let value = line.substring(colonIdx + 1).trim()

      // 处理 base64 编码值（以 :: 分隔）
      if (line.charAt(colonIdx + 1) === ':') {
        const { Buffer: NodeBuffer } = await import('node:buffer')
        value = NodeBuffer.from(value, 'base64').toString('utf-8')
      }

      if (key === 'dn') {
        dn = value
      }
      else {
        const existing = attributes[key]
        if (existing) {
          if (Array.isArray(existing)) {
            existing.push(value)
          }
          else {
            attributes[key] = [existing, value]
          }
        }
        else {
          attributes[key] = value
        }
      }
    }

    if (dn) {
      entries.push({ dn, attributes })
    }
  }

  return entries
}
