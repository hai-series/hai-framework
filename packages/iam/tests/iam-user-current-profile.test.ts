import type { IamFunctions } from '../src/iam-types.js'
import { describe, expect, it } from 'vitest'
import { IamErrorCode } from '../src/iam-config.js'
import { defineIamSuite, postgresRedisEnv, sqliteMemoryEnv, TEST_PASSWORD } from './helpers/iam-test-suite.js'

describe('iam.user current profile operations', () => {
  const defineCurrentProfileSuite = (getIam: () => IamFunctions) => {
    it('changeCurrentUserPassword should change password by access token', async () => {
      await getIam().user.register({
        username: 'current_pwd_user',
        password: TEST_PASSWORD,
      })

      const loginResult = await getIam().auth.login({
        identifier: 'current_pwd_user',
        password: TEST_PASSWORD,
      })
      expect(loginResult.success).toBe(true)
      if (!loginResult.success) {
        return
      }

      const changed = await getIam().user.changeCurrentUserPassword(
        loginResult.data.accessToken,
        TEST_PASSWORD,
        'NewPass789!',
      )
      expect(changed.success).toBe(true)

      const oldLogin = await getIam().auth.login({
        identifier: 'current_pwd_user',
        password: TEST_PASSWORD,
      })
      expect(oldLogin.success).toBe(false)

      const newLogin = await getIam().auth.login({
        identifier: 'current_pwd_user',
        password: 'NewPass789!',
      })
      expect(newLogin.success).toBe(true)
    })

    it('updateCurrentUser should reject duplicated username', async () => {
      await getIam().user.register({
        username: 'current_dup_a',
        password: TEST_PASSWORD,
      })
      await getIam().user.register({
        username: 'current_dup_b',
        password: TEST_PASSWORD,
      })

      const loginResult = await getIam().auth.login({
        identifier: 'current_dup_b',
        password: TEST_PASSWORD,
      })
      expect(loginResult.success).toBe(true)
      if (!loginResult.success) {
        return
      }

      const updated = await getIam().user.updateCurrentUser(loginResult.data.accessToken, {
        username: 'current_dup_a',
      })
      expect(updated.success).toBe(false)
      if (!updated.success) {
        expect(updated.error.code).toBe(IamErrorCode.USER_ALREADY_EXISTS)
      }
    })
  }

  defineIamSuite('sqlite+memory', sqliteMemoryEnv(), getIam => defineCurrentProfileSuite(getIam))
  defineIamSuite('postgres+redis', postgresRedisEnv, getIam => defineCurrentProfileSuite(getIam))
})
