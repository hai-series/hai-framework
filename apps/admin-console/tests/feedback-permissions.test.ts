/** 宿主沿用现有 IAM 角色，只给默认 user 提交权，不放大管理权限。 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  permissions: new Map<string, { id: string, code: string }>(),
  getRoleByCode: vi.fn(),
  getPermissionByCode: vi.fn(),
  createPermission: vi.fn(),
  assignPermissionToRole: vi.fn(),
}))
vi.mock('@h-ai/iam', () => ({ iam: { authz: state } }))
const { getFeedbackContext, seedFeedbackPermissions } = await import('../src/lib/server/feedback.js')

beforeEach(() => {
  vi.clearAllMocks()
  state.permissions.clear()
  state.getRoleByCode.mockImplementation(async (code: string) => ({ success: true, data: { id: `${code}-role`, code } }))
  state.getPermissionByCode.mockImplementation(async (code: string) => ({ success: true, data: state.permissions.get(code) ?? null }))
  state.createPermission.mockImplementation(async (input: { code: string }) => {
    const permission = { id: input.code, code: input.code }
    state.permissions.set(input.code, permission)
    return { success: true, data: permission }
  })
  state.assignPermissionToRole.mockResolvedValue({ success: true })
})

describe('admin feedback IAM integration', () => {
  it('沿用 admin/user 角色，管理员获得五项权限，普通用户仅可提交', async () => {
    await seedFeedbackPermissions()
    expect(state.getRoleByCode.mock.calls.map(([code]) => code)).toEqual(['admin', 'user'])
    expect([...state.permissions.keys()]).toEqual(['feedback:create', 'feedback:read', 'feedback:process', 'feedback:reopen', 'feedback:export'])
    expect(state.assignPermissionToRole.mock.calls.filter(([role]) => role === 'user-role')).toEqual([['user-role', 'feedback:create']])
    expect(state.assignPermissionToRole.mock.calls.filter(([role]) => role === 'admin-role').map(([, permission]) => permission)).toEqual([...state.permissions.keys()])
  })

  it('重复启动复用已注册权限，不重新创建权限记录', async () => {
    await seedFeedbackPermissions()
    await seedFeedbackPermissions()
    expect(state.createPermission).toHaveBeenCalledTimes(5)
  })

  it('授权存储失败阻止初始化，不把未授权的入口标为成功', async () => {
    state.assignPermissionToRole.mockResolvedValueOnce({ success: false, error: { message: 'Permission assignment unavailable' } })
    await expect(seedFeedbackPermissions()).rejects.toThrow('Permission assignment unavailable')
  })

  it('从已验证 session 产生固定 scope，匿名无身份上下文', () => {
    // 此边界仅读取 locals.session 的 userId 与 permissions，其他 RequestEvent 字段不会参与。
    const anonymous = { locals: {} } as Parameters<typeof getFeedbackContext>[0]
    const signedIn = { locals: { session: { userId: 'ordinary-user', permissions: ['feedback:create'] } } } as Parameters<typeof getFeedbackContext>[0]
    expect(getFeedbackContext(anonymous)).toBeNull()
    expect(getFeedbackContext(signedIn)).toEqual({ scopeId: 'admin-console', userId: 'ordinary-user', permissions: ['feedback:create'] })
  })
})
