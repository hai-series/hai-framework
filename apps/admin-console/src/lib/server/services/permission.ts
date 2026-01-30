/**
 * =============================================================================
 * Admin Console - 权限服务
 * =============================================================================
 */

import { core } from '@hai/core'
import { getDb } from '../database.js'

export interface Permission {
  id: string
  name: string
  description: string | null
  resource: string
  action: string
  is_system: number
  created_at: string
}

export interface CreatePermissionInput {
  name: string
  description?: string
  resource: string
  action: string
}

export interface UpdatePermissionInput {
  name?: string
  description?: string
  resource?: string
  action?: string
}

/**
 * 权限服务
 */
export const permissionService = {
  /**
   * 创建权限
   */
  async create(input: CreatePermissionInput): Promise<Permission> {
    const db = getDb()
    const id = core.id.withPrefix('perm_')

    const insertResult = db.sql.execute(
      `INSERT INTO permissions (id, name, description, resource, action) VALUES (?, ?, ?, ?, ?)`,
      [id, input.name, input.description ?? null, input.resource, input.action],
    )
    if (!insertResult.success) {
      throw new Error(`创建权限失败: ${insertResult.error.message}`)
    }

    const perm = await this.getById(id)
    if (!perm) {
      throw new Error('创建权限后无法获取权限信息')
    }
    return perm
  },

  /**
   * 根据 ID 获取权限
   */
  async getById(id: string): Promise<Permission | null> {
    const db = getDb()
    const permissionsResult = db.sql.query<Permission>(`SELECT * FROM permissions WHERE id = ?`, [id])
    return permissionsResult.success && permissionsResult.data.length ? permissionsResult.data[0] : null
  },

  /**
   * 根据名称获取权限
   */
  async getByName(name: string): Promise<Permission | null> {
    const db = getDb()
    const permissionsResult = db.sql.query<Permission>(`SELECT * FROM permissions WHERE name = ?`, [name])
    return permissionsResult.success && permissionsResult.data.length ? permissionsResult.data[0] : null
  },

  /**
   * 获取权限列表
   */
  async list(options?: { resource?: string }): Promise<Permission[]> {
    const db = getDb()

    if (options?.resource) {
      const result = db.sql.query<Permission>(`SELECT * FROM permissions WHERE resource = ? ORDER BY created_at DESC`, [options.resource])
      return result.success ? result.data : []
    }

    const result = db.sql.query<Permission>(`SELECT * FROM permissions ORDER BY resource, action`)
    return result.success ? result.data : []
  },

  /**
   * 获取按资源分组的权限
   */
  async listGroupedByResource(): Promise<Record<string, Permission[]>> {
    const permissions = await this.list()
    const grouped: Record<string, Permission[]> = {}

    for (const perm of permissions) {
      if (!grouped[perm.resource]) {
        grouped[perm.resource] = []
      }
      grouped[perm.resource].push(perm)
    }

    return grouped
  },

  /**
   * 更新权限
   */
  async update(id: string, input: UpdatePermissionInput): Promise<Permission | null> {
    const db = getDb()

    // 检查是否为系统权限
    const existingResult = db.sql.query<Permission>(`SELECT * FROM permissions WHERE id = ?`, [id])
    if (!existingResult.success || !existingResult.data.length)
      return null
    if (existingResult.data[0].is_system && (input.name || input.resource || input.action)) {
      throw new Error('不能修改系统权限的核心字段')
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
    if (input.resource !== undefined) {
      fields.push('resource = ?')
      values.push(input.resource)
    }
    if (input.action !== undefined) {
      fields.push('action = ?')
      values.push(input.action)
    }

    if (fields.length === 0)
      return this.getById(id)

    values.push(id)
    db.sql.execute(`UPDATE permissions SET ${fields.join(', ')} WHERE id = ?`, values)

    return this.getById(id)
  },

  /**
   * 删除权限
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb()

    // 检查是否为系统权限
    const existingResult = db.sql.query<Permission>(`SELECT * FROM permissions WHERE id = ?`, [id])
    if (!existingResult.success || !existingResult.data.length)
      return false
    if (existingResult.data[0].is_system) {
      throw new Error('不能删除系统权限')
    }

    const result = db.sql.execute(`DELETE FROM permissions WHERE id = ?`, [id])
    return result.success && result.data.changes > 0
  },

  /**
   * 获取所有资源名称
   */
  async getResources(): Promise<string[]> {
    const db = getDb()
    const results = db.sql.query<{ resource: string }>(`SELECT DISTINCT resource FROM permissions ORDER BY resource`)
    return results.success ? results.data.map(r => r.resource) : []
  },

  /**
   * 获取所有操作名称
   */
  async getActions(): Promise<string[]> {
    const db = getDb()
    const results = db.sql.query<{ action: string }>(`SELECT DISTINCT action FROM permissions ORDER BY action`)
    return results.success ? results.data.map(r => r.action) : []
  },
}
