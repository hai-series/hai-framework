/**
 * =============================================================================
 * Admin Console - 数据库初始化
 * =============================================================================
 */

import { db } from '@hai/db'
import { getEnv } from './env.js'

/**
 * 数据库 Schema
 */
const SCHEMA = `
-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  avatar TEXT,
  display_name TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'banned')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 角色表
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  is_system INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 权限表
CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 用户-角色关联
CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

-- 角色-权限关联
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT NOT NULL,
  permission_id TEXT NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

-- 会话表
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 密码重置令牌
CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 操作日志表
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id TEXT,
  details TEXT,
  ip_address TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
`

/**
 * 初始默认数据
 */
const SEED_DATA = `
-- 插入默认角色
INSERT OR IGNORE INTO roles (id, name, description, is_system) VALUES
  ('role_admin', 'admin', '系统管理员，拥有所有权限', 1),
  ('role_user', 'user', '普通用户', 1),
  ('role_guest', 'guest', '访客，只读权限', 1);

-- 插入默认权限
INSERT OR IGNORE INTO permissions (id, name, description, resource, action) VALUES
  -- 用户管理权限
  ('perm_user_read', 'user:read', '查看用户', 'user', 'read'),
  ('perm_user_create', 'user:create', '创建用户', 'user', 'create'),
  ('perm_user_update', 'user:update', '更新用户', 'user', 'update'),
  ('perm_user_delete', 'user:delete', '删除用户', 'user', 'delete'),
  -- 角色管理权限
  ('perm_role_read', 'role:read', '查看角色', 'role', 'read'),
  ('perm_role_create', 'role:create', '创建角色', 'role', 'create'),
  ('perm_role_update', 'role:update', '更新角色', 'role', 'update'),
  ('perm_role_delete', 'role:delete', '删除角色', 'role', 'delete'),
  -- 权限管理权限
  ('perm_permission_read', 'permission:read', '查看权限', 'permission', 'read'),
  ('perm_permission_manage', 'permission:manage', '管理权限', 'permission', 'manage'),
  -- 系统管理权限
  ('perm_system_settings', 'system:settings', '系统设置', 'system', 'settings'),
  ('perm_system_logs', 'system:logs', '查看日志', 'system', 'logs'),
  -- 数据服务权限
  ('perm_database_access', 'database:access', '数据库访问', 'database', 'access'),
  ('perm_cache_access', 'cache:access', '缓存访问', 'cache', 'access'),
  ('perm_storage_access', 'storage:access', '存储访问', 'storage', 'access');

-- 为管理员角色分配所有权限
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT 'role_admin', id FROM permissions;

-- 为普通用户分配基本权限
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES
  ('role_user', 'perm_user_read'),
  ('role_user', 'perm_storage_access');

-- 为访客分配只读权限
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES
  ('role_guest', 'perm_user_read');
`

let initialized = false

/**
 * 初始化数据库
 */
export async function initDatabase(): Promise<void> {
  if (initialized)
    return

  const env = getEnv()

  // 确保数据目录存在
  const path = await import('node:path')
  const fs = await import('node:fs')
  const dbDir = path.dirname(env.DATABASE_PATH)
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  // 初始化数据库连接
  db.init({
    type: 'sqlite',
    database: env.DATABASE_PATH,
  })

  // 执行 Schema
  const statements = SCHEMA.split(';').filter(s => s.trim())
  for (const statement of statements) {
    if (statement.trim()) {
      db.sql.execute(statement)
    }
  }

  // 执行种子数据
  const seedStatements = SEED_DATA.split(';').filter(s => s.trim())
  for (const statement of seedStatements) {
    if (statement.trim()) {
      try {
        db.sql.execute(statement)
      }
      catch {
        // 忽略重复插入错误
      }
    }
  }

  initialized = true
  // eslint-disable-next-line no-console
  console.log('✅ 数据库初始化完成:', env.DATABASE_PATH)
}

/**
 * 获取数据库实例
 */
export function getDb() {
  if (!initialized) {
    throw new Error('数据库未初始化，请先调用 initDatabase()')
  }
  return db
}
