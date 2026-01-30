/**
 * =============================================================================
 * Admin Console - 用户服务
 * =============================================================================
 */

import { core } from '@hai/core'
import { crypto } from '@hai/crypto'
import { getDb } from '../database.js'

export interface User {
  id: string
  username: string
  email: string
  password_hash: string
  avatar: string | null
  display_name: string | null
  status: 'active' | 'inactive' | 'banned'
  created_at: string
  updated_at: string
}

export interface UserWithRoles extends Omit<User, 'password_hash'> {
  roles: string[]
  permissions: string[]
}

export interface CreateUserInput {
  username: string
  email: string
  password: string
  display_name?: string
  avatar?: string
  roles?: string[]
}

export interface UpdateUserInput {
  username?: string
  email?: string
  display_name?: string
  avatar?: string
  status?: 'active' | 'inactive' | 'banned'
}

/**
 * 用户服务
 */
export const userService = {
  /**
   * 创建用户
   */
  async create(input: CreateUserInput): Promise<UserWithRoles> {
    const db = getDb()
    const id = core.id.withPrefix('user_')

    // 哈希密码
    const hashResult = crypto.sm3.hash(input.password)
    if (!hashResult.success) {
      throw new Error('密码哈希失败')
    }

    // 插入用户
    const insertResult = db.sql.execute(
      `INSERT INTO users (id, username, email, password_hash, display_name, avatar)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, input.username, input.email, hashResult.data, input.display_name ?? null, input.avatar ?? null],
    )
    if (!insertResult.success) {
      throw new Error(`创建用户失败: ${insertResult.error.message}`)
    }

    // 分配角色（默认 user 角色）
    const roles = input.roles?.length ? input.roles : ['role_user']
    for (const roleId of roles) {
      const roleResult = db.sql.execute(`INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`, [id, roleId])
      if (!roleResult.success) {
        throw new Error(`分配角色失败: ${roleResult.error.message}`)
      }
    }

    const user = await this.getById(id)
    if (!user) {
      throw new Error('创建用户后无法获取用户信息')
    }
    return user
  },

  /**
   * 根据 ID 获取用户
   */
  async getById(id: string): Promise<UserWithRoles | null> {
    const db = getDb()

    const usersResult = db.sql.query<User>(`SELECT * FROM users WHERE id = ?`, [id])
    if (!usersResult.success || !usersResult.data.length)
      return null

    const user = usersResult.data[0]
    const { roles, permissions } = await this.getUserRolesAndPermissions(id)

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      display_name: user.display_name,
      status: user.status,
      created_at: user.created_at,
      updated_at: user.updated_at,
      roles,
      permissions,
    }
  },

  /**
   * 根据用户名或邮箱获取用户
   */
  async getByIdentifier(identifier: string): Promise<User | null> {
    const db = getDb()
    const usersResult = db.sql.query<User>(`SELECT * FROM users WHERE username = ? OR email = ?`, [identifier, identifier])
    if (!usersResult.success || !usersResult.data.length)
      return null
    return usersResult.data[0]
  },

  /**
   * 验证密码
   */
  async verifyPassword(user: User, password: string): Promise<boolean> {
    const hashResult = crypto.sm3.hash(password)
    if (!hashResult.success)
      return false
    return hashResult.data === user.password_hash
  },

  /**
   * 获取用户列表
   */
  async list(
    options: {
      page?: number
      pageSize?: number
      search?: string
      status?: string
    } = {},
  ): Promise<{ users: UserWithRoles[], total: number }> {
    const db = getDb()
    const { page = 1, pageSize = 20, search, status } = options

    let whereClause = '1=1'
    const params: unknown[] = []

    if (search) {
      whereClause += ` AND (username LIKE ? OR email LIKE ? OR display_name LIKE ?)`
      params.push(`%${search}%`, `%${search}%`, `%${search}%`)
    }

    if (status) {
      whereClause += ` AND status = ?`
      params.push(status)
    }

    // 获取总数
    const countResult = db.sql.query<{ count: number }>(`SELECT COUNT(*) as count FROM users WHERE ${whereClause}`, params)
    const total = countResult.success ? (countResult.data[0]?.count ?? 0) : 0

    // 获取分页数据
    const offset = (page - 1) * pageSize
    const usersResult = db.sql.query<User>(
      `SELECT * FROM users WHERE ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    )

    if (!usersResult.success) {
      return { users: [], total: 0 }
    }

    // 获取每个用户的角色和权限
    const usersWithRoles = await Promise.all(
      usersResult.data.map(async (user) => {
        const { roles, permissions } = await this.getUserRolesAndPermissions(user.id)
        return {
          id: user.id,
          username: user.username,
          email: user.email,
          avatar: user.avatar,
          display_name: user.display_name,
          status: user.status,
          created_at: user.created_at,
          updated_at: user.updated_at,
          roles,
          permissions,
        }
      }),
    )

    return { users: usersWithRoles, total }
  },

  /**
   * 更新用户
   */
  async update(id: string, input: UpdateUserInput): Promise<UserWithRoles | null> {
    const db = getDb()

    const fields: string[] = []
    const values: unknown[] = []

    if (input.username !== undefined) {
      fields.push('username = ?')
      values.push(input.username)
    }
    if (input.email !== undefined) {
      fields.push('email = ?')
      values.push(input.email)
    }
    if (input.display_name !== undefined) {
      fields.push('display_name = ?')
      values.push(input.display_name)
    }
    if (input.avatar !== undefined) {
      fields.push('avatar = ?')
      values.push(input.avatar)
    }
    if (input.status !== undefined) {
      fields.push('status = ?')
      values.push(input.status)
    }

    if (fields.length === 0) {
      return this.getById(id)
    }

    fields.push('updated_at = datetime(\'now\')')
    values.push(id)

    const updateResult = db.sql.execute(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values)
    if (!updateResult.success) {
      throw new Error(`更新用户失败: ${updateResult.error.message}`)
    }

    return this.getById(id)
  },

  /**
   * 删除用户
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb()
    const result = db.sql.execute(`DELETE FROM users WHERE id = ?`, [id])
    return result.success && result.data.changes > 0
  },

  /**
   * 修改密码
   */
  async changePassword(id: string, oldPassword: string, newPassword: string): Promise<boolean> {
    const db = getDb()
    const usersResult = db.sql.query<User>(`SELECT * FROM users WHERE id = ?`, [id])
    if (!usersResult.success || !usersResult.data.length)
      return false

    const user = usersResult.data[0]
    const isValid = await this.verifyPassword(user, oldPassword)
    if (!isValid)
      return false

    const hashResult = crypto.sm3.hash(newPassword)
    if (!hashResult.success)
      return false

    const updateResult = db.sql.execute(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`, [hashResult.data, id])
    return updateResult.success
  },

  /**
   * 重置密码
   */
  async resetPassword(id: string, newPassword: string): Promise<boolean> {
    const db = getDb()
    const hashResult = crypto.sm3.hash(newPassword)
    if (!hashResult.success)
      return false

    const result = db.sql.execute(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`, [
      hashResult.data,
      id,
    ])
    return result.success && result.data.changes > 0
  },

  /**
   * 获取用户角色和权限
   */
  async getUserRolesAndPermissions(userId: string): Promise<{ roles: string[], permissions: string[] }> {
    const db = getDb()

    // 获取角色
    const roleResults = db.sql.query<{ name: string }>(
      `SELECT r.name FROM roles r
       INNER JOIN user_roles ur ON r.id = ur.role_id
       WHERE ur.user_id = ?`,
      [userId],
    )
    const roles = roleResults.success ? roleResults.data.map(r => r.name) : []

    // 获取权限
    const permResults = db.sql.query<{ name: string }>(
      `SELECT DISTINCT p.name FROM permissions p
       INNER JOIN role_permissions rp ON p.id = rp.permission_id
       INNER JOIN user_roles ur ON rp.role_id = ur.role_id
       WHERE ur.user_id = ?`,
      [userId],
    )
    const permissions = permResults.success ? permResults.data.map(p => p.name) : []

    return { roles, permissions }
  },

  /**
   * 分配角色给用户
   */
  async assignRoles(userId: string, roleIds: string[]): Promise<void> {
    const db = getDb()

    // 先删除现有角色
    db.sql.execute(`DELETE FROM user_roles WHERE user_id = ?`, [userId])

    // 添加新角色
    for (const roleId of roleIds) {
      db.sql.execute(`INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`, [userId, roleId])
    }
  },
}
