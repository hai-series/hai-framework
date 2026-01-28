/**
 * =============================================================================
 * hai Admin Console - 用户列表页面服务端
 * =============================================================================
 */

import type { PageServerLoad } from './$types'

/**
 * 模拟用户数据
 */
const mockUsers = [
    {
        id: 'user_001',
        username: 'admin',
        email: 'admin@example.com',
        role: 'admin',
        status: 'active',
        createdAt: '2024-01-01',
    },
    {
        id: 'user_002',
        username: 'zhangsan',
        email: 'zhangsan@example.com',
        role: 'user',
        status: 'active',
        createdAt: '2024-01-15',
    },
    {
        id: 'user_003',
        username: 'lisi',
        email: 'lisi@example.com',
        role: 'user',
        status: 'inactive',
        createdAt: '2024-02-01',
    },
    {
        id: 'user_004',
        username: 'wangwu',
        email: 'wangwu@example.com',
        role: 'editor',
        status: 'active',
        createdAt: '2024-02-15',
    },
    {
        id: 'user_005',
        username: 'zhaoliu',
        email: 'zhaoliu@example.com',
        role: 'user',
        status: 'active',
        createdAt: '2024-03-01',
    },
]

export const load: PageServerLoad = async ({ url }) => {
    const page = Number(url.searchParams.get('page')) || 1
    const limit = Number(url.searchParams.get('limit')) || 10
    const search = url.searchParams.get('search') || ''

    // 模拟搜索过滤
    let users = mockUsers
    if (search) {
        users = users.filter(
            u => u.username.includes(search) || u.email.includes(search)
        )
    }

    return {
        users,
        total: users.length,
        page,
        limit,
    }
}
