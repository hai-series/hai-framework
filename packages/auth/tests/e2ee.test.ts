/**
 * =============================================================================
 * @hai/auth - E2EE 登录测试
 * =============================================================================
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
    createE2EELoginManager,
    createPasswordService,
    E2EELoginManager,
    PasswordService,
} from '../src/e2ee.js'

describe('E2EELoginManager', () => {
    let manager: E2EELoginManager

    beforeEach(() => {
        manager = createE2EELoginManager()
    })

    describe('getPublicKey', () => {
        it('应该返回公钥', () => {
            const result = manager.getPublicKey()

            expect(result.ok).toBe(true)
            if (result.ok) {
                expect(result.value).toBeDefined()
                expect(typeof result.value).toBe('string')
                expect(result.value.length).toBeGreaterThan(0)
            }
        })

        it('应该返回相同的公钥（在轮换周期内）', () => {
            const result1 = manager.getPublicKey()
            const result2 = manager.getPublicKey()

            expect(result1.ok).toBe(true)
            expect(result2.ok).toBe(true)
            if (result1.ok && result2.ok) {
                expect(result1.value).toBe(result2.value)
            }
        })
    })

    describe('rotateKey', () => {
        it('应该生成新的密钥对', () => {
            const oldKeyResult = manager.getPublicKey()
            expect(oldKeyResult.ok).toBe(true)
            if (!oldKeyResult.ok) return

            const rotateResult = manager.rotateKey()
            expect(rotateResult.ok).toBe(true)
            if (!rotateResult.ok) return

            // 新公钥应该与旧公钥不同
            expect(rotateResult.value).not.toBe(oldKeyResult.value)
        })
    })

    describe('encryptPassword & decryptPassword', () => {
        it('应该正确加密和解密密码', () => {
            const password = 'MySecurePassword123!'

            // 获取公钥
            const publicKeyResult = manager.getPublicKey()
            expect(publicKeyResult.ok).toBe(true)
            if (!publicKeyResult.ok) return

            // 客户端加密
            const encryptResult = E2EELoginManager.encryptPassword(
                password,
                publicKeyResult.value,
            )
            expect(encryptResult.ok).toBe(true)
            if (!encryptResult.ok) return

            // 服务端解密
            const decryptResult = manager.decryptPassword(encryptResult.value)
            expect(decryptResult.ok).toBe(true)
            if (decryptResult.ok) {
                expect(decryptResult.value).toBe(password)
            }
        })

        it('应该拒绝无效公钥', () => {
            const result = E2EELoginManager.encryptPassword(
                'password',
                'invalid-public-key',
            )

            expect(result.ok).toBe(false)
            if (!result.ok) {
                expect(result.error.type).toBe('ENCRYPTION_FAILED')
            }
        })
    })
})

describe('PasswordService', () => {
    let service: PasswordService

    beforeEach(() => {
        service = createPasswordService({
            minLength: 8,
            requireUppercase: true,
            requireLowercase: true,
            requireNumbers: true,
            requireSpecial: false,
        })
    })

    describe('validatePolicy', () => {
        it('应该接受符合策略的密码', () => {
            const result = service.validatePolicy('Password123')

            expect(result.ok).toBe(true)
        })

        it('应该拒绝太短的密码', () => {
            const result = service.validatePolicy('Pass1')

            expect(result.ok).toBe(false)
            if (!result.ok) {
                expect(result.error.type).toBe('PASSWORD_POLICY_VIOLATION')
            }
        })

        it('应该拒绝没有大写字母的密码', () => {
            const result = service.validatePolicy('password123')

            expect(result.ok).toBe(false)
            if (!result.ok) {
                expect(result.error.type).toBe('PASSWORD_POLICY_VIOLATION')
            }
        })

        it('应该拒绝没有小写字母的密码', () => {
            const result = service.validatePolicy('PASSWORD123')

            expect(result.ok).toBe(false)
            if (!result.ok) {
                expect(result.error.type).toBe('PASSWORD_POLICY_VIOLATION')
            }
        })

        it('应该拒绝没有数字的密码', () => {
            const result = service.validatePolicy('Passwordabc')

            expect(result.ok).toBe(false)
            if (!result.ok) {
                expect(result.error.type).toBe('PASSWORD_POLICY_VIOLATION')
            }
        })
    })

    describe('hashPassword', () => {
        it('应该哈希有效密码', () => {
            const result = service.hashPassword('Password123')

            expect(result.ok).toBe(true)
            if (result.ok) {
                expect(result.value).toContain('$argon2')
            }
        })

        it('应该拒绝不符合策略的密码', () => {
            const result = service.hashPassword('weak')

            expect(result.ok).toBe(false)
        })
    })

    describe('verifyPassword', () => {
        it('应该验证正确的密码', () => {
            const password = 'Password123'

            const hashResult = service.hashPassword(password)
            expect(hashResult.ok).toBe(true)
            if (!hashResult.ok) return

            const verifyResult = service.verifyPassword(password, hashResult.value)
            expect(verifyResult.ok).toBe(true)
            if (verifyResult.ok) {
                expect(verifyResult.value).toBe(true)
            }
        })

        it('应该拒绝错误的密码', () => {
            const password = 'Password123'

            const hashResult = service.hashPassword(password)
            expect(hashResult.ok).toBe(true)
            if (!hashResult.ok) return

            const verifyResult = service.verifyPassword('WrongPassword123', hashResult.value)
            expect(verifyResult.ok).toBe(true)
            if (verifyResult.ok) {
                expect(verifyResult.value).toBe(false)
            }
        })
    })

    describe('verifyE2EELogin', () => {
        it('应该验证 E2EE 登录', async () => {
            const password = 'Password123'
            const e2eeManager = createE2EELoginManager()

            // 1. 哈希密码（注册时）
            const hashResult = service.hashPassword(password)
            expect(hashResult.ok).toBe(true)
            if (!hashResult.ok) return

            const storedHash = hashResult.value

            // 2. 获取公钥
            const publicKeyResult = e2eeManager.getPublicKey()
            expect(publicKeyResult.ok).toBe(true)
            if (!publicKeyResult.ok) return

            // 3. 客户端加密密码
            const encryptResult = E2EELoginManager.encryptPassword(
                password,
                publicKeyResult.value,
            )
            expect(encryptResult.ok).toBe(true)
            if (!encryptResult.ok) return

            // 4. 服务端验证 E2EE 登录
            const verifyResult = await service.verifyE2EELogin(
                encryptResult.value,
                storedHash,
                e2eeManager,
            )

            expect(verifyResult.ok).toBe(true)
            if (verifyResult.ok) {
                expect(verifyResult.value).toBe(true)
            }
        })

        it('应该拒绝错误的 E2EE 登录', async () => {
            const correctPassword = 'Password123'
            const wrongPassword = 'WrongPassword123'
            const e2eeManager = createE2EELoginManager()

            // 1. 哈希正确密码
            const hashResult = service.hashPassword(correctPassword)
            expect(hashResult.ok).toBe(true)
            if (!hashResult.ok) return

            const storedHash = hashResult.value

            // 2. 获取公钥
            const publicKeyResult = e2eeManager.getPublicKey()
            expect(publicKeyResult.ok).toBe(true)
            if (!publicKeyResult.ok) return

            // 3. 加密错误密码
            const encryptResult = E2EELoginManager.encryptPassword(
                wrongPassword,
                publicKeyResult.value,
            )
            expect(encryptResult.ok).toBe(true)
            if (!encryptResult.ok) return

            // 4. 验证应该失败
            const verifyResult = await service.verifyE2EELogin(
                encryptResult.value,
                storedHash,
                e2eeManager,
            )

            expect(verifyResult.ok).toBe(true)
            if (verifyResult.ok) {
                expect(verifyResult.value).toBe(false)
            }
        })
    })
})

describe('PasswordService with special characters', () => {
    it('应该在策略要求时验证特殊字符', () => {
        const service = createPasswordService({
            minLength: 8,
            requireUppercase: true,
            requireLowercase: true,
            requireNumbers: true,
            requireSpecial: true,
        })

        // 没有特殊字符应该失败
        const result1 = service.validatePolicy('Password123')
        expect(result1.ok).toBe(false)

        // 有特殊字符应该成功
        const result2 = service.validatePolicy('Password123!')
        expect(result2.ok).toBe(true)
    })
})
