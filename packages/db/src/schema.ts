/**
 * =============================================================================
 * @hai/db - 基础 Schema 定义
 * =============================================================================
 * 提供框架内置的数据表 schema
 * 
 * 包含:
 * - 用户表 (users)
 * - 角色表 (roles)
 * - 用户角色关联表 (user_roles)
 * - 会话表 (sessions)
 * - 审计日志表 (audit_logs)
 * =============================================================================
 */

import { relations, sql } from 'drizzle-orm'
import {
    integer,
    primaryKey,
    sqliteTable,
    text,
} from 'drizzle-orm/sqlite-core'

/**
 * 用户表
 */
export const users = sqliteTable('users', {
    /** 用户 ID */
    id: text('id').primaryKey(),
    /** 用户名 */
    username: text('username').notNull().unique(),
    /** 邮箱 */
    email: text('email').unique(),
    /** 手机号 */
    phone: text('phone').unique(),
    /** 密码哈希 (Argon2) */
    passwordHash: text('password_hash'),
    /** 显示名称 */
    displayName: text('display_name'),
    /** 头像 URL */
    avatarUrl: text('avatar_url'),
    /** 账户状态: active, disabled, locked */
    status: text('status').notNull().default('active'),
    /** 邮箱是否已验证 */
    emailVerified: integer('email_verified', { mode: 'boolean' }).default(false),
    /** 手机是否已验证 */
    phoneVerified: integer('phone_verified', { mode: 'boolean' }).default(false),
    /** 最后登录时间 */
    lastLoginAt: integer('last_login_at', { mode: 'timestamp' }),
    /** 登录失败次数 */
    loginAttempts: integer('login_attempts').default(0),
    /** 锁定截止时间 */
    lockedUntil: integer('locked_until', { mode: 'timestamp' }),
    /** 元数据 (JSON) */
    metadata: text('metadata', { mode: 'json' }),
    /** 创建时间 */
    createdAt: integer('created_at', { mode: 'timestamp' })
        .notNull()
        .default(sql`(unixepoch())`),
    /** 更新时间 */
    updatedAt: integer('updated_at', { mode: 'timestamp' })
        .notNull()
        .default(sql`(unixepoch())`),
})

/**
 * 角色表
 */
export const roles = sqliteTable('roles', {
    /** 角色 ID */
    id: text('id').primaryKey(),
    /** 角色名称 */
    name: text('name').notNull().unique(),
    /** 角色描述 */
    description: text('description'),
    /** 权限列表 (JSON 数组) */
    permissions: text('permissions', { mode: 'json' }).$type<string[]>().default([]),
    /** 是否为系统角色 */
    isSystem: integer('is_system', { mode: 'boolean' }).default(false),
    /** 创建时间 */
    createdAt: integer('created_at', { mode: 'timestamp' })
        .notNull()
        .default(sql`(unixepoch())`),
    /** 更新时间 */
    updatedAt: integer('updated_at', { mode: 'timestamp' })
        .notNull()
        .default(sql`(unixepoch())`),
})

/**
 * 用户角色关联表
 */
export const userRoles = sqliteTable(
    'user_roles',
    {
        /** 用户 ID */
        userId: text('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        /** 角色 ID */
        roleId: text('role_id')
            .notNull()
            .references(() => roles.id, { onDelete: 'cascade' }),
        /** 分配时间 */
        assignedAt: integer('assigned_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`(unixepoch())`),
    },
    table => ({
        pk: primaryKey({ columns: [table.userId, table.roleId] }),
    }),
)

/**
 * 会话表
 */
export const sessions = sqliteTable('sessions', {
    /** 会话 ID */
    id: text('id').primaryKey(),
    /** 用户 ID */
    userId: text('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    /** 会话令牌哈希 */
    tokenHash: text('token_hash').notNull(),
    /** 用户代理 */
    userAgent: text('user_agent'),
    /** IP 地址 */
    ipAddress: text('ip_address'),
    /** 过期时间 */
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    /** 创建时间 */
    createdAt: integer('created_at', { mode: 'timestamp' })
        .notNull()
        .default(sql`(unixepoch())`),
    /** 最后活动时间 */
    lastActiveAt: integer('last_active_at', { mode: 'timestamp' })
        .notNull()
        .default(sql`(unixepoch())`),
})

/**
 * 审计日志表
 */
export const auditLogs = sqliteTable('audit_logs', {
    /** 日志 ID */
    id: text('id').primaryKey(),
    /** 用户 ID (可为空表示系统操作) */
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    /** 操作类型 */
    action: text('action').notNull(),
    /** 资源类型 */
    resourceType: text('resource_type'),
    /** 资源 ID */
    resourceId: text('resource_id'),
    /** 操作详情 (JSON) */
    details: text('details', { mode: 'json' }),
    /** IP 地址 */
    ipAddress: text('ip_address'),
    /** 用户代理 */
    userAgent: text('user_agent'),
    /** 请求 ID (用于追踪) */
    requestId: text('request_id'),
    /** 创建时间 */
    createdAt: integer('created_at', { mode: 'timestamp' })
        .notNull()
        .default(sql`(unixepoch())`),
})

// ============================================================================
// Relations
// ============================================================================

/**
 * 用户关系
 */
export const usersRelations = relations(users, ({ many }) => ({
    userRoles: many(userRoles),
    sessions: many(sessions),
    auditLogs: many(auditLogs),
}))

/**
 * 角色关系
 */
export const rolesRelations = relations(roles, ({ many }) => ({
    userRoles: many(userRoles),
}))

/**
 * 用户角色关系
 */
export const userRolesRelations = relations(userRoles, ({ one }) => ({
    user: one(users, {
        fields: [userRoles.userId],
        references: [users.id],
    }),
    role: one(roles, {
        fields: [userRoles.roleId],
        references: [roles.id],
    }),
}))

/**
 * 会话关系
 */
export const sessionsRelations = relations(sessions, ({ one }) => ({
    user: one(users, {
        fields: [sessions.userId],
        references: [users.id],
    }),
}))

/**
 * 审计日志关系
 */
export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
    user: one(users, {
        fields: [auditLogs.userId],
        references: [users.id],
    }),
}))

// ============================================================================
// Type Exports
// ============================================================================

/** 用户类型 */
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

/** 角色类型 */
export type Role = typeof roles.$inferSelect
export type NewRole = typeof roles.$inferInsert

/** 用户角色关联类型 */
export type UserRole = typeof userRoles.$inferSelect
export type NewUserRole = typeof userRoles.$inferInsert

/** 会话类型 */
export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert

/** 审计日志类型 */
export type AuditLog = typeof auditLogs.$inferSelect
export type NewAuditLog = typeof auditLogs.$inferInsert
