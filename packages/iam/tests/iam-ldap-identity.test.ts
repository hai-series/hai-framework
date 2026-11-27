import type { HaiResult } from '@h-ai/core'
import type { LdapClientFactory } from '../src/index.js'
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { HaiReldbError, reldb } from '@h-ai/reldb'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mysqlEnv, postgresEnv, sqliteMemoryEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'
import { migrateLdapIdentities } from '../src/authn/ldap/iam-authn-ldap-repository.js'
import { HaiIamError, iam } from '../src/index.js'
import { createDbUserRepository } from '../src/user/iam-user-repository-user.js'
import { initIam, readLoginFailures, TEST_PASSWORD } from './helpers/iam-test-suite.js'

const ldap = {
  url: 'ldap://fixture.invalid',
  bindDn: 'cn=directory-reader',
  bindPassword: 'fixture-only',
  searchBase: 'dc=fixture',
  directoryId: 'staff',
}
const first = '45437b37-4fb8-4408-abc5-42c42cd26562'
const second = '2c9cbe6c-5f7b-42a6-b430-bd972ef08d09'
const table = 'hai_iam_ldap_identities'

function data<T>(result: HaiResult<T>): T {
  expect(result.success, result.success ? undefined : result.error.message).toBe(true)
  if (!result.success)
    throw new Error(String(result.error.code))
  return result.data
}

function directory(username: string, entryId: string, search = vi.fn()) {
  const factory: LdapClientFactory = async () => core.ok({
    bind: async () => core.ok(undefined),
    search: async (...args) => {
      search(...args)
      return core.ok([
        {
          dn: `uid=${username},dc=fixture`,
          attributes: { uid: username, entryUUID: entryId },
        },
      ])
    },
    unbind: async () => core.ok(undefined),
  })
  return factory
}

for (const [backend, environment] of [
  ['sqlite', sqliteMemoryEnv],
  ['postgresql', postgresEnv],
  ['mysql', mysqlEnv],
] as const) {
  describe(`LDAP identity bindings (${backend})`, () => {
    let release: (() => Promise<void>) | undefined

    beforeAll(async () => {
      const env = await environment()
      release = env.release
      data(await reldb.init(env.config))
      data(await cache.init({ type: 'memory' }))
    }, 150_000)

    beforeEach(async () => {
      await iam.close()
      data(await reldb.ddl.dropTable(table, true))
    })

    afterAll(async () => {
      await iam.close()
      await cache.close()
      await reldb.close()
      await release?.()
    })

    it('只导入核验过的账号映射并保留主键，重复导入是幂等的', async () => {
      const username = `migrated-${backend}`
      // 迁移入口只依赖现有用户表。单独建表也可验证 MySQL 的迁移契约。
      const repo = await createDbUserRepository()
      data(await repo.create({
        username,
        metadata: { ldapDn: `uid=${username},dc=fixture`, authSource: 'ldap' },
      }))
      const local = data(await repo.findByUsername(username))!
      const manifest = {
        directoryId: ldap.directoryId,
        bindings: [
          { entryId: first, userId: local.id },
        ],
      }
      expect(data(await migrateLdapIdentities(manifest, false))).toEqual({ apply: false, newBindings: 1, existingBindings: 0 })
      expect(data(await reldb.schemaColumns(table))).toEqual([])
      expect(data(await migrateLdapIdentities(manifest, true))).toEqual({ apply: true, newBindings: 1, existingBindings: 0 })
      expect(data(await migrateLdapIdentities(manifest, true))).toEqual({ apply: true, newBindings: 0, existingBindings: 1 })

      if (backend !== 'mysql') {
        await initIam({
          ldap,
          login: { ldap: true },
          ldapSyncUser: false,
          ldapClientFactory: directory(`${username}-renamed`, first),
        })
        const result = data(await iam.auth.loginWithLdap({ username: `${username}-renamed`, password: TEST_PASSWORD }))
        expect(result.user.id).toBe(local.id)
        expect(result.user.username).toBe(username)
      }
      const otherName = `other-${backend}`
      data(await repo.create({ username: otherName }))
      const other = data(await repo.findByUsername(otherName))!
      expect(await migrateLdapIdentities({
        directoryId: ldap.directoryId,
        bindings: [
          { entryId: second, userId: other.id },
          { entryId: first, userId: other.id },
        ],
      }, true)).toMatchObject({ success: false })
      expect(await migrateLdapIdentities({
        directoryId: ldap.directoryId,
        bindings: [
          { entryId: first, userId: other.id },
        ],
      }, true)).toMatchObject({
        success: false,
        error: { code: HaiIamError.CONFLICT.code },
      })
      expect(data(await reldb.sql.query(`SELECT entry_id FROM ${table}`))).toEqual([
        { entry_id: first },
      ])
      data(await repo.deleteById(local.id))
      expect(data(await reldb.sql.query(`SELECT user_id FROM ${table}`))).toEqual([])
    }, 30_000)

    if (backend === 'mysql')
      return

    it('同名本地账号的资料和失败计数保持原值', async () => {
      const username = `local-${backend}`
      await initIam({
        ldap,
        login: { ldap: true },
        ldapClientFactory: directory(username, first),
      })
      const local = data(await iam.user.register({
        username,
        password: TEST_PASSWORD,
        displayName: 'Local account',
      })).user
      expect(await iam.auth.loginWithLdap({ username, password: TEST_PASSWORD })).toMatchObject({
        success: false,
        error: { code: HaiIamError.INVALID_CREDENTIALS.code },
      })
      expect(data(await iam.user.getUser(local.id))).toMatchObject({ displayName: 'Local account' })
      expect(await readLoginFailures(local.id)).toBeNull()
      expect(data(await reldb.sql.query(`SELECT user_id FROM ${table}`))).toEqual([])
      expect(data(await iam.auth.login({ identifier: username, password: TEST_PASSWORD })).user.id).toBe(local.id)
    }, 30_000)

    it('绑定写入失败时回滚新用户，可重新完成首登', async () => {
      const username = `rollback-${backend}`
      await initIam({
        ldap,
        login: { ldap: true },
        ldapClientFactory: directory(username, first),
      })
      const start = reldb.tx.begin
      const unavailable = vi.spyOn(reldb.tx, 'begin').mockImplementationOnce(async () => {
        const result = await start()
        if (result.success) {
          const execute = result.data.execute
          result.data.execute = (sql, params) => sql.startsWith(`INSERT INTO ${table}`)
            ? Promise.resolve(core.err(HaiReldbError.QUERY_FAILED, 'Fixture write unavailable'))
            : execute(sql, params)
        }
        return result
      })
      try {
        expect(await iam.auth.loginWithLdap({ username, password: TEST_PASSWORD })).toMatchObject({
          success: false,
          error: { code: HaiIamError.REPOSITORY_ERROR.code },
        })
      }
      finally {
        unavailable.mockRestore()
      }
      expect(data(await reldb.sql.query('SELECT id FROM hai_iam_users WHERE username = ?', [username]))).toEqual([])
      expect(data(await reldb.sql.query(`SELECT user_id FROM ${table}`))).toEqual([])
      const created = data(await iam.auth.loginWithLdap({ username, password: TEST_PASSWORD }))
      expect((await iam.auth.loginWithLdap({ username, password: TEST_PASSWORD })).success).toBe(true)
      expect(data(await reldb.sql.query(`SELECT user_id FROM ${table}`))).toEqual([
        { user_id: created.user.id },
      ])
    }, 30_000)
  })
}
