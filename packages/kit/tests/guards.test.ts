/**
 * =============================================================================
 * @h-ai/kit - Guards 测试
 * =============================================================================
 */

import type { SessionData } from '../src/kit-types.js'
import { describe, expect, it, vi } from 'vitest'
import {
  allGuards,
  anyGuard,
  assertPermission,
  authGuard,
  conditionalGuard,
  hasPermission,
  matchPermission,
  notGuard,
  permissionGuard,
  requirePermission,
  roleGuard,
} from '../src/guards/index.js'

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
    expect(result.message).toBe('需要身份认证')
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

// =============================================================================
// matchPermission / hasPermission / assertPermission
// =============================================================================

describe('matchPermission', () => {
  it('完全匹配时返回 true', () => {
    expect(matchPermission('user:read', ['user:read', 'user:create'])).toBe(true)
  })

  it('无匹配时返回 false', () => {
    expect(matchPermission('user:delete', ['user:read', 'user:create'])).toBe(false)
  })

  it('通配符 * 匹配所有权限', () => {
    expect(matchPermission('user:read', ['*'])).toBe(true)
    expect(matchPermission('role:delete', ['*'])).toBe(true)
  })

  it('前缀通配符 admin:* 匹配同前缀权限', () => {
    expect(matchPermission('admin:read', ['admin:*'])).toBe(true)
    expect(matchPermission('admin:write', ['admin:*'])).toBe(true)
  })

  it('前缀通配符不匹配不同前缀', () => {
    expect(matchPermission('user:read', ['admin:*'])).toBe(false)
  })

  it('空权限列表返回 false', () => {
    expect(matchPermission('user:read', [])).toBe(false)
  })
})

describe('hasPermission', () => {
  it('session 为 null/undefined 时返回 false', () => {
    expect(hasPermission(null, 'user:read')).toBe(false)
    expect(hasPermission(undefined, 'user:read')).toBe(false)
  })

  it('有对应权限时返回 true', () => {
    const session: SessionData = { userId: 'u1', roles: [], permissions: ['user:read', 'role:read'] }
    expect(hasPermission(session, 'user:read')).toBe(true)
  })

  it('无对应权限时返回 false', () => {
    const session: SessionData = { userId: 'u1', roles: [], permissions: ['user:read'] }
    expect(hasPermission(session, 'user:delete')).toBe(false)
  })

  it('支持通配符', () => {
    const session: SessionData = { userId: 'u1', roles: [], permissions: ['user:*'] }
    expect(hasPermission(session, 'user:read')).toBe(true)
    expect(hasPermission(session, 'user:delete')).toBe(true)
    expect(hasPermission(session, 'role:read')).toBe(false)
  })
})

describe('assertPermission', () => {
  it('session 为 undefined 时返回 401 Response', () => {
    const result = assertPermission(undefined, 'user:read')
    expect(result).toBeInstanceOf(Response)
    expect(result!.status).toBe(401)
  })

  it('session 为 null 时返回 401 Response', () => {
    const result = assertPermission(null, 'user:read')
    expect(result).toBeInstanceOf(Response)
    expect(result!.status).toBe(401)
  })

  it('权限不足时返回 403 Response', async () => {
    const session: SessionData = { userId: 'u1', roles: [], permissions: ['user:read'] }
    const result = assertPermission(session, 'user:delete')
    expect(result).toBeInstanceOf(Response)
    expect(result!.status).toBe(403)
    const body = await result!.json()
    expect(body.success).toBe(false)
  })

  it('有权限时返回 undefined', () => {
    const session: SessionData = { userId: 'u1', roles: [], permissions: ['user:read'] }
    const result = assertPermission(session, 'user:read')
    expect(result).toBeUndefined()
  })

  it('通配符权限时返回 undefined', () => {
    const session: SessionData = { userId: 'u1', roles: [], permissions: ['*'] }
    const result = assertPermission(session, 'user:delete')
    expect(result).toBeUndefined()
  })
})

describe('requirePermission', () => {
  it('session 为 undefined 时 throw 401 Response', () => {
    expect(() => requirePermission(undefined, 'user:read')).toThrow()
    try {
      requirePermission(undefined, 'user:read')
    }
    catch (error) {
      expect(error).toBeInstanceOf(Response)
      expect((error as Response).status).toBe(401)
    }
  })

  it('session 为 null 时 throw 401 Response', () => {
    expect(() => requirePermission(null, 'user:read')).toThrow()
    try {
      requirePermission(null, 'user:read')
    }
    catch (error) {
      expect(error).toBeInstanceOf(Response)
      expect((error as Response).status).toBe(401)
    }
  })

  it('权限不足时 throw 403 Response', async () => {
    const session: SessionData = { userId: 'u1', roles: [], permissions: ['user:read'] }
    try {
      requirePermission(session, 'user:delete')
      expect.fail('Should have thrown')
    }
    catch (error) {
      expect(error).toBeInstanceOf(Response)
      expect((error as Response).status).toBe(403)
      const body = await (error as Response).json()
      expect(body.success).toBe(false)
    }
  })

  it('有权限时不 throw', () => {
    const session: SessionData = { userId: 'u1', roles: [], permissions: ['user:read'] }
    expect(() => requirePermission(session, 'user:read')).not.toThrow()
  })

  it('通配符权限时不 throw', () => {
    const session: SessionData = { userId: 'u1', roles: [], permissions: ['*'] }
    expect(() => requirePermission(session, 'user:delete')).not.toThrow()
  })
})
