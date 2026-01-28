/**
 * =============================================================================
 * @hai/kit - Guards 测试
 * =============================================================================
 */

import { describe, it, expect, vi } from 'vitest'
import {
    authGuard,
    roleGuard,
    permissionGuard,
    allGuards,
    anyGuard,
    notGuard,
    conditionalGuard,
} from '../src/guards/index.js'
import type { SessionData } from '../src/types.js'

/**
 * 创建模拟 RequestEvent
 */
function createMockEvent(path = '/') {
    const url = new URL(`http://localhost${path}`)

    return {
        request: new Request(url),
        url,
        params: {},
        route: { id: path },
    } as any
}

describe('authGuard', () => {
    it('应该允许已认证用户', () => {
        const guard = authGuard()
        const session: SessionData = {
            userId: 'user1',
            roles: [],
            permissions: [],
        }

        const result = guard(createMockEvent(), session)

        expect(result.allowed).toBe(true)
    })

    it('应该拒绝未认证用户并重定向', () => {
        const guard = authGuard({ loginUrl: '/auth/login' })

        const result = guard(createMockEvent('/protected'), undefined)

        expect(result.allowed).toBe(false)
        expect(result.redirect).toContain('/auth/login')
        expect(result.redirect).toContain('returnUrl')
    })

    it('应该在 API 模式下返回 401', () => {
        const guard = authGuard({ apiMode: true })

        const result = guard(createMockEvent(), undefined)

        expect(result.allowed).toBe(false)
        expect(result.status).toBe(401)
        expect(result.message).toBe('Authentication required')
    })
})

describe('roleGuard', () => {
    const adminSession: SessionData = {
        userId: 'admin1',
        roles: ['admin', 'user'],
        permissions: [],
    }

    const userSession: SessionData = {
        userId: 'user1',
        roles: ['user'],
        permissions: [],
    }

    it('应该允许具有所需角色的用户', () => {
        const guard = roleGuard({ roles: ['admin'] })

        const result = guard(createMockEvent(), adminSession)

        expect(result.allowed).toBe(true)
    })

    it('应该拒绝没有所需角色的用户', () => {
        const guard = roleGuard({ roles: ['admin'] })

        const result = guard(createMockEvent(), userSession)

        expect(result.allowed).toBe(false)
    })

    it('应该支持 requireAll 选项', () => {
        const guard = roleGuard({ roles: ['admin', 'superadmin'], requireAll: true })

        const result = guard(createMockEvent(), adminSession)

        expect(result.allowed).toBe(false)
    })

    it('应该支持任意角色匹配', () => {
        const guard = roleGuard({ roles: ['admin', 'moderator'] })

        const result = guard(createMockEvent(), adminSession)

        expect(result.allowed).toBe(true)
    })
})

describe('permissionGuard', () => {
    const session: SessionData = {
        userId: 'user1',
        roles: [],
        permissions: ['users:read', 'users:write', 'admin:*'],
    }

    it('应该允许具有所需权限的用户', () => {
        const guard = permissionGuard({ permissions: ['users:read'] })

        const result = guard(createMockEvent(), session)

        expect(result.allowed).toBe(true)
    })

    it('应该拒绝没有所需权限的用户', () => {
        const guard = permissionGuard({ permissions: ['system:delete'] })

        const result = guard(createMockEvent(), session)

        expect(result.allowed).toBe(false)
    })

    it('应该支持通配符权限', () => {
        const guard = permissionGuard({ permissions: ['admin:dashboard'] })

        const result = guard(createMockEvent(), session)

        expect(result.allowed).toBe(true) // 因为有 admin:*
    })

    it('应该支持超级权限', () => {
        const superSession: SessionData = {
            userId: 'super1',
            roles: [],
            permissions: ['*'],
        }

        const guard = permissionGuard({ permissions: ['anything:anywhere'] })

        const result = guard(createMockEvent(), superSession)

        expect(result.allowed).toBe(true)
    })

    it('应该支持 requireAll 选项', () => {
        const guard = permissionGuard({
            permissions: ['users:read', 'users:delete'],
            requireAll: true,
        })

        const result = guard(createMockEvent(), session)

        expect(result.allowed).toBe(false) // 没有 users:delete
    })
})

describe('allGuards', () => {
    it('应该在所有守卫通过时允许', async () => {
        const guard = allGuards(
            () => ({ allowed: true }),
            () => ({ allowed: true }),
        )

        const result = await guard(createMockEvent(), undefined)

        expect(result.allowed).toBe(true)
    })

    it('应该在任意守卫失败时拒绝', async () => {
        const guard = allGuards(
            () => ({ allowed: true }),
            () => ({ allowed: false, message: 'failed' }),
        )

        const result = await guard(createMockEvent(), undefined)

        expect(result.allowed).toBe(false)
        expect(result.message).toBe('failed')
    })
})

describe('anyGuard', () => {
    it('应该在任意守卫通过时允许', async () => {
        const guard = anyGuard(
            () => ({ allowed: false }),
            () => ({ allowed: true }),
        )

        const result = await guard(createMockEvent(), undefined)

        expect(result.allowed).toBe(true)
    })

    it('应该在所有守卫失败时拒绝', async () => {
        const guard = anyGuard(
            () => ({ allowed: false, message: 'first failed' }),
            () => ({ allowed: false, message: 'second failed' }),
        )

        const result = await guard(createMockEvent(), undefined)

        expect(result.allowed).toBe(false)
        expect(result.message).toBe('second failed')
    })
})

describe('notGuard', () => {
    it('应该反转守卫结果', async () => {
        const guard = notGuard(
            () => ({ allowed: true }),
            { message: 'Should not be allowed' },
        )

        const result = await guard(createMockEvent(), undefined)

        expect(result.allowed).toBe(false)
        expect(result.message).toBe('Should not be allowed')
    })

    it('应该在原守卫失败时允许', async () => {
        const guard = notGuard(() => ({ allowed: false }))

        const result = await guard(createMockEvent(), undefined)

        expect(result.allowed).toBe(true)
    })
})

describe('conditionalGuard', () => {
    it('应该在条件为真时执行守卫', async () => {
        const innerGuard = vi.fn().mockReturnValue({ allowed: true })
        const guard = conditionalGuard(() => true, innerGuard)

        await guard(createMockEvent(), undefined)

        expect(innerGuard).toHaveBeenCalled()
    })

    it('应该在条件为假时跳过守卫', async () => {
        const innerGuard = vi.fn().mockReturnValue({ allowed: false })
        const guard = conditionalGuard(() => false, innerGuard)

        const result = await guard(createMockEvent(), undefined)

        expect(innerGuard).not.toHaveBeenCalled()
        expect(result.allowed).toBe(true)
    })
})
