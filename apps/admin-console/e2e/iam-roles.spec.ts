import { expect, test } from '@playwright/test'
import { registerAndLoginViaApi } from './helpers'

test.describe('IAM Roles API', () => {
  test('role codes remain unique for Chinese and emoji names', async ({ request }) => {
    await registerAndLoginViaApi(request, 'unicode_role')
    const names = ['管理员甲', '管理员乙', '😀', '😀', 'Admin', 'admin']
    const codes: string[] = []
    // 顺序请求避免把角色标识验证混入 SQLite 写锁竞争。
    for (const name of names) {
      const response = await request.post('/api/iam/roles', { data: { name, permissions: [] } })
      expect(response.ok()).toBe(true)
      const body = await response.json()
      expect(body.success).toBe(true)
      expect(body.data.name).toBe(name)
      expect(body.data.code).toMatch(/^role_.+/)
      codes.push(body.data.code)
    }
    expect(new Set(codes).size).toBe(names.length)
  })
})
