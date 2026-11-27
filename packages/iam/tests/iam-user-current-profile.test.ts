import type { IamFunctions } from '../src/iam-types.js'
import { reldb } from '@h-ai/reldb'
import { describe, expect, it } from 'vitest'
import { defineIamSuite, initIam, sqliteMemoryEnv, TEST_PASSWORD } from './helpers/iam-test-suite.js'

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
        loginResult.data.tokens.accessToken,
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

      const updated = await getIam().user.updateCurrentUser(loginResult.data.tokens.accessToken, {
        displayName: 'New Display Name',
      })
      expect(updated.success).toBe(true)
      if (updated.success) {
        expect(updated.data.displayName).toBe('New Display Name')
      }
    })

    it('updates contact credentials and verification state in the same profile transaction', async () => {
      const iam = await initIam({
        onPasswordResetRequest: async () => {},
      })
      const login = await iam.auth.registerAndLogin({
        username: 'contact-update',
        email: 'original@example.invalid',
        phone: '13900139001',
        password: TEST_PASSWORD,
      })
      expect(login.success).toBe(true)
      if (!login.success)
        return
      const { user, tokens } = login.data
      expect(await iam.user.updateUser(user.id, { emailVerified: true, phoneVerified: true })).toMatchObject({ success: true })
      expect(await iam.user.updateCurrentUser(tokens.accessToken, { email: 'Original@EXAMPLE.INVALID' })).toMatchObject({
        success: true,
        data: { emailVerified: true, phoneVerified: true },
      })
      expect(await iam.user.requestPasswordReset(user.username)).toMatchObject({ success: true })

      expect(await iam.user.updateCurrentUser(tokens.accessToken, { email: 'current@example.invalid' })).toMatchObject({
        success: true,
        data: { email: 'current@example.invalid', emailVerified: false, phoneVerified: true },
      })
      expect(await reldb.sql.get('SELECT reset_hash, reset_expires_at FROM hai_iam_users WHERE id = ?', [user.id])).toMatchObject({
        success: true,
        data: { reset_hash: null, reset_expires_at: null },
      })
      expect((await iam.auth.verifyToken(tokens.accessToken)).success).toBe(false)
      expect((await iam.auth.login({ identifier: user.username, password: TEST_PASSWORD })).success).toBe(true)
    })
  }

  defineIamSuite('sqlite+memory', sqliteMemoryEnv(), getIam => defineCurrentProfileSuite(getIam))
})
