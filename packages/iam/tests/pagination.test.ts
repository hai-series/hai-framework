/**
 * =============================================================================
 * @hai/iam - 分页查询测试
 * =============================================================================
 */

import { db } from '@hai/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDbUserRepository } from '../src/repository/iam-repository-user.js'

describe('iam pagination', () => {
  beforeAll(async () => {
    await db.init({ type: 'sqlite', database: ':memory:' })
  })

  afterAll(async () => {
    await db.close()
  })

  it('userRepository.findAll 应支持分页并返回总数', async () => {
    const repo = await createDbUserRepository(db)

    await repo.create({
      username: 'user-1',
      email: 'user1@example.com',
      enabled: true,
    })
    await new Promise(resolve => setTimeout(resolve, 2))

    await repo.create({
      username: 'user-2',
      email: 'user2@example.com',
      enabled: true,
    })
    await new Promise(resolve => setTimeout(resolve, 2))

    await repo.create({
      username: 'user-3',
      email: 'user3@example.com',
      enabled: true,
    })

    const firstPage = await repo.findAll({ page: 1, pageSize: 2 })
    expect(firstPage.success).toBe(true)
    if (!firstPage.success) {
      return
    }

    expect(firstPage.data.total).toBe(3)
    expect(firstPage.data.page).toBe(1)
    expect(firstPage.data.pageSize).toBe(2)
    expect(firstPage.data.items).toHaveLength(2)
    expect(firstPage.data.items[0].username).toBe('user-3')

    const secondPage = await repo.findAll({ page: 2, pageSize: 2 })
    expect(secondPage.success).toBe(true)
    if (!secondPage.success) {
      return
    }

    expect(secondPage.data.total).toBe(3)
    expect(secondPage.data.items).toHaveLength(1)
    expect(secondPage.data.items[0].username).toBe('user-1')
  })
})
