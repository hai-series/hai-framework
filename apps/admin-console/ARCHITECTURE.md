# Admin Console 架构设计

> 这是一个可直接使用的管理后台模板，基于 hai-framework 构建，支持 SQLite 数据存储。

## 模块功能清单

### @h-ai/ui 组件库

- **Primitives (14)**: Avatar, Badge, Button, Checkbox, IconButton, Input, Progress, Radio, Select, Spinner, Switch, Tag, Textarea
- **Compounds (31)**: Alert, Breadcrumb, Card, Confirm, DataTable, Drawer, Dropdown, Empty, FeedbackModal, Form, FormField, LanguageSwitch, Modal, MultiSelect, PageHeader, Pagination, Popover, Result, ScoreBar, SettingsModal, SeverityBadge, Skeleton, Steps, Table, Tabs, TagInput, ThemeToggle, Toast, ToastContainer, Tooltip
- **Scenes**:
  - IAM: LoginForm, RegisterForm, ForgotPasswordForm, ResetPasswordForm, ChangePasswordForm
  - Storage: FileUpload, ImageUpload, AvatarUpload, FileList
  - Crypto: PasswordInput, EncryptedInput, HashDisplay
- **自动导入**：通过 `@h-ai/ui/auto-import` 预处理器在编译阶段自动注入 `@h-ai/ui` 组件 import

### @h-ai/kit SvelteKit 集成

- Guards: authGuard, roleGuard, permissionGuard, allGuards, anyGuard, notGuard, conditionalGuard
- Hooks: createHandle, sequence
- Middleware: loggingMiddleware, rateLimitMiddleware, corsMiddleware, csrfMiddleware
- Response: ok, created, badRequest, unauthorized, forbidden, notFound, conflict, validationError, error, redirect
- Validation: validateForm, validateQuery, validateParams
- Modules: createIamHandle, createIamActions, requireAuth, requireRole, requirePermission

### @h-ai/core 核心工具

- Logger: info, warn, error, debug
- ID: generate (nanoid)
- Config: load, get, set
- Utils: type, object, string, array, async, time

### @h-ai/db 数据库

- DDL: createTable, dropTable, addColumn, createIndex
- SQL: query, execute, transaction
- 支持: SQLite, PostgreSQL, MySQL

### @h-ai/cache 缓存

- 基础: get, set, del, exists, expire, ttl
- Hash: hget, hset, hdel, hgetall
- List: lpush, rpush, lpop, rpop, lrange
- Set: sadd, srem, smembers, sismember
- SortedSet: zadd, zrem, zrange, zscore

### @h-ai/storage 存储

- File: put, get, delete, exists, copy, move
- Directory: list, create, delete
- Presign: getUploadUrl, getDownloadUrl

### @h-ai/crypto 加密

- SM2: generateKeyPair, encrypt, decrypt, sign, verify
- SM3: hash, hmac, verify
- SM4: encrypt, decrypt, encryptWithIV, decryptWithIV, generateKey

### @h-ai/iam 身份认证

- Auth: login, logout, validateSession
- User: register, getById, update, delete, list, changePassword, resetPassword
- Role: create, update, delete, list, assignToUser, removeFromUser
- Permission: create, update, delete, list, assignToRole, removeFromRole

### @h-ai/ai 人工智能

- LLM: chat, chatStream
- MCP: registerTool, callTool, registerResource, getResource
- Skills: register, execute, list

---

## 导航结构

```
├── Dashboard (/)
│   └── 概览统计、快速入口
│
├── IAM 身份管理
│   ├── 用户管理 (/admin/iam/users)
│   │   ├── 用户列表
│   │   ├── 新建用户
│   │   └── 用户详情/编辑
│   ├── 角色管理 (/admin/iam/roles)
│   │   ├── 角色列表
│   │   ├── 新建角色
│   │   └── 角色权限配置
│   └── 权限管理 (/admin/iam/permissions)
│       ├── 权限列表
│       └── 新建权限
│
├── 数据服务
│   ├── 数据库 (/admin/services/database)
│   │   ├── 表管理
│   │   ├── SQL 控制台
│   │   └── 数据导入导出
│   ├── 缓存 (/admin/services/cache)
│   │   ├── Key 浏览
│   │   ├── 数据操作
│   │   └── 统计信息
│   └── 存储 (/admin/services/storage)
│       ├── 文件浏览器
│       ├── 上传文件
│       └── Bucket 设置
│
├── 工具
│   ├── 加密工具 (/admin/tools/crypto)
│   │   ├── SM2 加解密
│   │   ├── SM3 哈希
│   │   └── SM4 对称加密
│   └── AI 助手 (/admin/tools/ai)
│       └── 对话界面
│
├── UI 组件库
│   ├── Primitives (/admin/ui/primitives)
│   │   └── 所有原子组件示例
│   ├── Compounds (/admin/ui/compounds)
│   │   └── 所有组合组件示例
│   └── Scenes (/admin/ui/scenes)
│       └── 所有场景组件示例
│
└── 系统设置 (/admin/settings)
    ├── 个人资料
    ├── 安全设置（修改密码）
    ├── 主题设置
    └── 语言设置
```

---

## 路由规划

```
src/routes/
├── +layout.svelte              # 根布局
├── +page.svelte                # 首页重定向
│
├── (auth)/                     # 认证相关（无侧边栏布局）
│   ├── +layout.svelte
│   ├── login/+page.svelte
│   ├── register/+page.svelte
│   ├── forgot-password/+page.svelte
│   └── reset-password/+page.svelte
│
├── admin/                      # 管理后台（需登录）
│   ├── +layout.svelte          # 后台布局（侧边栏+顶栏）
│   ├── +layout.server.ts       # 会话验证
│   ├── +page.svelte            # Dashboard
│   │
│   ├── iam/
│   │   ├── users/
│   │   │   ├── +page.svelte    # 用户列表
│   │   │   ├── new/+page.svelte
│   │   │   └── [id]/+page.svelte
│   │   ├── roles/
│   │   │   ├── +page.svelte
│   │   │   ├── new/+page.svelte
│   │   │   └── [id]/+page.svelte
│   │   └── permissions/
│   │       ├── +page.svelte
│   │       └── new/+page.svelte
│   │
│   ├── services/
│   │   ├── database/+page.svelte
│   │   ├── cache/+page.svelte
│   │   └── storage/+page.svelte
│   │
│   ├── tools/
│   │   ├── crypto/+page.svelte
│   │   └── ai/+page.svelte
│   │
│   ├── ui/
│   │   ├── primitives/+page.svelte
│   │   ├── compounds/+page.svelte
│   │   └── scenes/+page.svelte
│   │
│   └── settings/
│       ├── +page.svelte        # 个人资料
│       ├── security/+page.svelte
│       └── preferences/+page.svelte
│
├── api/
│   ├── auth/
│   │   ├── login/+server.ts
│   │   ├── register/+server.ts
│   │   ├── logout/+server.ts
│   │   ├── forgot-password/+server.ts
│   │   └── reset-password/+server.ts
│   │
│   ├── users/
│   │   ├── +server.ts          # GET(list), POST(create)
│   │   └── [id]/+server.ts     # GET, PUT, DELETE
│   │
│   ├── roles/
│   │   ├── +server.ts
│   │   └── [id]/+server.ts
│   │
│   ├── permissions/
│   │   ├── +server.ts
│   │   └── [id]/+server.ts
│   │
│   ├── database/
│   │   ├── tables/+server.ts
│   │   └── query/+server.ts
│   │
│   ├── cache/
│   │   ├── keys/+server.ts
│   │   └── [key]/+server.ts
│   │
│   ├── storage/
│   │   ├── files/+server.ts
│   │   └── presign/+server.ts
│   │
│   └── crypto/
│       ├── sm2/+server.ts
│       ├── sm3/+server.ts
│       └── sm4/+server.ts
│
└── logout/+server.ts
```

---

## 数据库 Schema (SQLite)

```sql
-- 用户表
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  avatar TEXT,
  status TEXT DEFAULT 'active',  -- active, inactive, banned
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 角色表
CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 权限表
CREATE TABLE permissions (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  resource TEXT,
  action TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 用户-角色关联
CREATE TABLE user_roles (
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

-- 角色-权限关联
CREATE TABLE role_permissions (
  role_id TEXT NOT NULL,
  permission_id TEXT NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

-- 会话表
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 密码重置令牌
CREATE TABLE password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

---

## 环境变量

```env
# 应用配置
PUBLIC_APP_NAME=hai Admin Console
PUBLIC_APP_URL=http://localhost:5173

# 数据库 (SQLite)
DATABASE_PATH=./data/admin.db

# 会话配置
SESSION_SECRET=your-session-secret-min-32-chars
SESSION_COOKIE_NAME=hai_session
SESSION_MAX_AGE=604800  # 7 days

# 存储配置 (可选，默认本地存储)
STORAGE_TYPE=local
STORAGE_PATH=./data/uploads

# 缓存配置 (可选，默认内存)
CACHE_TYPE=memory

# AI 配置 (可选)
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini

# 加密配置
CRYPTO_SM4_KEY=your-sm4-key-16-bytes
```

---

## 实现步骤

### Phase 1: 基础设施

1. 创建 `src/lib/server/` 目录结构
2. 初始化 SQLite 数据库和 Schema
3. 实现基础服务层 (db, auth, user, role, permission)
4. 配置环境变量和类型定义

### Phase 2: 认证流程

1. 实现注册/登录/登出 API
2. 实现找回密码/重置密码 API
3. 创建认证相关页面
4. 集成 @h-ai/kit 的 createIamHandle

### Phase 3: 核心功能

1. 实现用户管理 CRUD
2. 实现角色管理 CRUD
3. 实现权限管理 CRUD
4. 实现数据库管理页面
5. 实现缓存管理页面
6. 实现存储管理页面

### Phase 4: 工具页面

1. 实现加密工具页面
2. 实现 AI 助手页面
3. 实现 UI 组件展示页面

### Phase 5: 完善体验

1. 优化布局和导航
2. 添加主题/语言设置
3. 完善文档和示例
4. 添加测试用例
