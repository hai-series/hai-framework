import type { IamFunctions } from '../src/iam-types.js'
import { describe, expect, it } from 'vitest'
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

    it('updateCurrentUser should update displayName', async () => {
      await getIam().user.register({
        username: 'current_update_user',
        password: TEST_PASSWORD,
      })

      const loginResult = await getIam().auth.login({
        identifier: 'current_update_user',
        password: TEST_PASSWORD,
      })
      expect(loginResult.success).toBe(true)
      if (!loginResult.success) {
        return
      }

      const updated = await getIam().user.updateCurrentUser(loginResult.data.accessToken, {
        displayName: 'New Display Name',
      })
      expect(updated.success).toBe(true)
      if (updated.success) {
        expect(updated.data.displayName).toBe('New Display Name')
      }
    })
  }

  defineIamSuite('sqlite+memory', sqliteMemoryEnv(), getIam => defineCurrentProfileSuite(getIam))
  defineIamSuite('postgres+redis', postgresRedisEnv, getIam => defineCurrentProfileSuite(getIam))
})
