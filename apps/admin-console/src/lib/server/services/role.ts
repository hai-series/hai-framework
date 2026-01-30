/**
 * =============================================================================
 * Admin Console - 角色服务
 * =============================================================================
 */

import { core } from '@hai/core'
import { getDb } from '../database.js'

export interface Role {
  id: string
  name: string
  description: string | null
  is_system: number
  created_at: string
}

export interface RoleWithPermissions extends Role {
  permissions: string[]
}

export interface CreateRoleInput {
  name: string
  description?: string
  permissions?: string[]
}

export interface UpdateRoleInput {
  name?: string
  description?: string
  permissions?: string[]
}

/**
 * 角色服务
 */
export const roleService = {
  /**
   * 创建角色
   */
  async create(input: CreateRoleInput): Promise<RoleWithPermissions> {
    const db = getDb()
    const id = core.id.withPrefix('role_')

    const insertResult = db.sql.execute(`INSERT INTO roles (id, name, description) VALUES (?, ?, ?)`, [
      id,
      input.name,
      input.description ?? null,
    ])
    if (!insertResult.success) {
      throw new Error(`创建角色失败: ${insertResult.error.message}`)
    }

    // 分配权限
    if (input.permissions?.length) {
      for (const permId of input.permissions) {
        db.sql.execute(`INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)`, [id, permId])
      }
    }

    const role = await this.getById(id)
    if (!role) {
      throw new Error('创建角色后无法获取角色信息')
    }
    return role
  },

  /**
   * 根据 ID 获取角色
   */
  async getById(id: string): Promise<RoleWithPermissions | null> {
    const db = getDb()

    const rolesResult = db.sql.query<Role>(`SELECT * FROM roles WHERE id = ?`, [id])
    if (!rolesResult.success || !rolesResult.data.length)
      return null

    const role = rolesResult.data[0]
    const permissions = await this.getRolePermissions(id)

    return { ...role, permissions }
  },

  /**
   * 获取角色列表
   */
  async list(): Promise<RoleWithPermissions[]> {
    const db = getDb()
    const rolesResult = db.sql.query<Role>(`SELECT * FROM roles ORDER BY created_at DESC`)

    if (!rolesResult.success) {
      return []
    }

    return Promise.all(
      rolesResult.data.map(async (role) => {
        const permissions = await this.getRolePermissions(role.id)
        return { ...role, permissions }
      }),
    )
  },

  /**
   * 更新角色
   */
  async update(id: string, input: UpdateRoleInput): Promise<RoleWithPermissions | null> {
    const db = getDb()

    // 检查是否为系统角色
    const existingResult = db.sql.query<Role>(`SELECT * FROM roles WHERE id = ?`, [id])
    if (!existingResult.success || !existingResult.data.length)
      return null
    if (existingResult.data[0].is_system && input.name) {
      throw new Error('不能修改系统角色名称')
    }

    const fields: string[] = []
    const values: unknown[] = []

    if (input.name !== undefined) {
      fields.push('name = ?')
      values.push(input.name)
    }
    if (input.description !== undefined) {
      fields.push('description = ?')
      values.push(input.description)
    }

    if (fields.length > 0) {
      values.push(id)
      db.sql.execute(`UPDATE roles SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    // 更新权限
    if (input.permissions !== undefined) {
      db.sql.execute(`DELETE FROM role_permissions WHERE role_id = ?`, [id])
      for (const permId of input.permissions) {
        db.sql.execute(`INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)`, [id, permId])
      }
    }

    return this.getById(id)
  },

  /**
   * 删除角色
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb()

    // 检查是否为系统角色
    const existingResult = db.sql.query<Role>(`SELECT * FROM roles WHERE id = ?`, [id])
    if (!existingResult.success || !existingResult.data.length)
      return false
    if (existingResult.data[0].is_system) {
      throw new Error('不能删除系统角色')
    }

    const result = db.sql.execute(`DELETE FROM roles WHERE id = ?`, [id])
    return result.success && result.data.changes > 0
  },

  /**
   * 获取角色权限
   */
  async getRolePermissions(roleId: string): Promise<string[]> {
    const db = getDb()
    const resultsResult = db.sql.query<{ name: string }>(
      `SELECT p.name FROM permissions p
       INNER JOIN role_permissions rp ON p.id = rp.permission_id
       WHERE rp.role_id = ?`,
      [roleId],
    )
    return resultsResult.success ? resultsResult.data.map(r => r.name) : []
  },

  /**
   * 获取拥有某角色的用户数
   */
  async getUserCount(roleId: string): Promise<number> {
    const db = getDb()
    const result = db.sql.query<{ count: number }>(`SELECT COUNT(*) as count FROM user_roles WHERE role_id = ?`, [roleId])
    return result.success ? (result.data[0]?.count ?? 0) : 0
  },
}
