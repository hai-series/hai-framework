/**
 * =============================================================================
 * @hai/iam - LDAP 认证测试
 * =============================================================================
 */

import type { LdapClientFactory } from '../src/authn/ldap/iam-authn-ldap-strategy.js'
import { err, ok } from '@hai/core'
import { describe, expect, it } from 'vitest'
import { db } from '../../db/src/index.js'
import { iam } from '../src/index.js'

interface FakeLdapUser {
  username: string
  password: string
  email?: string
  displayName?: string
}

function createFakeLdapFactory(users: FakeLdapUser[]): LdapClientFactory {
  const userMap = new Map(users.map(user => [user.username, user]))

  return async (config) => {
    const entriesByDn = new Map<string, FakeLdapUser>()

    const client = {
      async bind(dn: string, password: string) {
        if (dn === config.bindDn) {
          return password === config.bindPassword
            ? ok(undefined)
            : err({ code: iam.errorCode.LDAP_BIND_FAILED, message: 'admin bind failed' })
        }

        const user = entriesByDn.get(dn)
        if (!user) {
          return err({ code: iam.errorCode.LDAP_BIND_FAILED, message: 'user not found' })
        }
        if (user.password !== password) {
          return err({ code: iam.errorCode.LDAP_BIND_FAILED, message: 'invalid credentials' })
        }
        return ok(undefined)
      },

      async search(_base: string, filter: string, _attributes: string[]) {
        const match = /\([^=]+=([^)]*)\)/.exec(filter)
        const username = match?.[1]
        if (!username) {
          return ok([])
        }
        const user = userMap.get(username)
        if (!user) {
          return ok([])
        }

        const dn = `${config.usernameAttribute}=${username},${config.searchBase}`
        entriesByDn.set(dn, user)

        return ok([
          {
            dn,
            attributes: {
              [config.usernameAttribute]: user.username,
              [config.emailAttribute]: user.email ?? '',
              [config.displayNameAttribute]: user.displayName ?? '',
            },
          },
        ])
      },

      async unbind() {
        return ok(undefined)
      },
    }

    return ok(client)
  }
}

describe('iam.auth.loginWithLdap', () => {
  it('应支持 LDAP 登录并返回会话', async () => {
    const service = iam.create()

    await db.init({ type: 'sqlite', database: ':memory:' })

    const initResult = await service.init(
      db,
      {
        login: { ldap: true },
        ldap: {
          url: 'ldap://localhost:389',
          bindDn: 'cn=admin,dc=example,dc=com',
          bindPassword: 'secret',
          searchBase: 'dc=example,dc=com',
        },
      },
      {
        ldapClientFactory: createFakeLdapFactory([
          { username: 'alice', password: 'Password123', email: 'alice@example.com', displayName: 'Alice' },
        ]),
      },
    )

    expect(initResult.success).toBe(true)

    const loginResult = await service.auth.loginWithLdap({
      username: 'alice',
      password: 'Password123',
    })

    expect(loginResult.success).toBe(true)
    if (loginResult.success) {
      expect(loginResult.data.user.username).toBe('alice')
      expect(loginResult.data.accessToken.length).toBeGreaterThan(0)
    }

    await service.close()
    await db.close()
  })

  it('应在失败次数达到上限后锁定账户', async () => {
    const service = iam.create()

    await db.init({ type: 'sqlite', database: ':memory:' })

    const initResult = await service.init(
      db,
      {
        login: { ldap: true },
        ldap: {
          url: 'ldap://localhost:389',
          bindDn: 'cn=admin,dc=example,dc=com',
          bindPassword: 'secret',
          searchBase: 'dc=example,dc=com',
        },
        security: {
          maxLoginAttempts: 2,
          lockoutDuration: 60,
        },
      },
      {
        ldapClientFactory: createFakeLdapFactory([
          { username: 'bob', password: 'LdapPass1', email: 'bob@example.com', displayName: 'Bob' },
        ]),
      },
    )

    expect(initResult.success).toBe(true)

    const registerResult = await service.user.register({
      username: 'bob',
      email: 'bob@example.com',
      password: 'Password123',
    })

    expect(registerResult.success).toBe(true)

    const first = await service.auth.loginWithLdap({ username: 'bob', password: 'WrongPass' })
    expect(first.success).toBe(false)
    if (!first.success) {
      expect(first.error.code).toBe(iam.errorCode.INVALID_CREDENTIALS)
    }

    const second = await service.auth.loginWithLdap({ username: 'bob', password: 'WrongPass' })
    expect(second.success).toBe(false)
    if (!second.success) {
      expect(second.error.code).toBe(iam.errorCode.INVALID_CREDENTIALS)
    }

    const third = await service.auth.loginWithLdap({ username: 'bob', password: 'LdapPass1' })
    expect(third.success).toBe(false)
    if (!third.success) {
      expect(third.error.code).toBe(iam.errorCode.USER_LOCKED)
    }

    await service.close()
    await db.close()
  })
})
