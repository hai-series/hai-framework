/** 生命周期字段仅允许管理入口，输出和日期转换保持端到端语义。 */
import { expect, it } from 'vitest'
import { IamAdminCreateUserInputSchema, IamAdminUpdateUserInputSchema, IamListUsersInputSchema, IamRegisterInputSchema, IamUserSchema } from '../src/index.js'

it('管理接口保留临时账号日期与状态，用户响应不剥离生命周期', () => {
  const date = '2027-01-01T00:00:00.000Z'
  const input = IamAdminCreateUserInputSchema.parse({ username: 'temporary', password: 'ExampleOnly123!', accountType: 'temporary', accountStatus: 'active', accountExpiresAt: date })
  expect(input.accountExpiresAt).toEqual(new Date(date))
  const output = IamUserSchema.parse({ ...input, id: 'user-1', accountStatus: 'active', createdAt: date, updatedAt: date, lastLoginAt: date })
  expect(output.accountType).toBe('temporary')
  expect(output.lastLoginAt).toEqual(new Date(date))
  expect(IamAdminUpdateUserInputSchema.parse({ id: 'user-1', accountType: 'permanent', accountExpiresAt: null }).accountExpiresAt).toBeNull()
})

it('公开注册不能自行设置账号状态、期限或管理员启用标记', () => {
  const input = IamRegisterInputSchema.parse({ username: 'public-user', password: 'ExampleOnly123!', accountStatus: 'active', accountType: 'permanent', enabled: true, accountExpiresAt: '2099-01-01' })
  expect(input).not.toHaveProperty('accountStatus')
  expect(input).not.toHaveProperty('accountType')
  expect(input).not.toHaveProperty('enabled')
  expect(input).not.toHaveProperty('accountExpiresAt')
})

it('管理更新拒绝非法状态或无效时间，不能静默改变语义', () => {
  expect(IamAdminUpdateUserInputSchema.safeParse({ id: 'user-1', accountStatus: 'administrator' }).success).toBe(false)
  expect(IamAdminUpdateUserInputSchema.safeParse({ id: 'user-1', accountExpiresAt: 'invalid' }).success).toBe(false)
  expect(IamAdminUpdateUserInputSchema.safeParse({ id: 'user-1', enabled: false }).success).toBe(false)
  expect(IamListUsersInputSchema.safeParse({ enabled: true }).success).toBe(false)
  expect(IamListUsersInputSchema.safeParse({ sortBy: 'enabled' }).success).toBe(false)
})

it('用户列表保留服务端排序白名单并拒绝未知字段和方向', () => {
  expect(IamListUsersInputSchema.parse({ sortBy: 'username', sortDirection: 'asc' })).toMatchObject({ sortBy: 'username', sortDirection: 'asc' })
  expect(IamListUsersInputSchema.safeParse({ sortBy: 'roles' }).success).toBe(false)
  expect(IamListUsersInputSchema.safeParse({ sortBy: 'username; DROP TABLE users' }).success).toBe(false)
  expect(IamListUsersInputSchema.safeParse({ sortDirection: 'up' }).success).toBe(false)
})
