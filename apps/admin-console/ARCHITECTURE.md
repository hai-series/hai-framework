# Admin Console 架构设计

> 基于 hai-framework 构建的 SvelteKit 管理后台示例应用，展示框架全模块集成能力。

---

## 已实现功能

### 认证流

- 登录：用户名密码登录（`/auth/login`）
- 注册：新用户注册（`/auth/register`）
- 忘记密码：邮箱验证找回密码（`/auth/forgot-password`）
- 重置密码：Token 验证重置密码（`/auth/reset-password`）
- 登出：清除会话（`/api/auth/logout`）

### IAM 管理

- 用户管理：用户 CRUD、角色分配（`/admin/iam/users`）
- 角色管理：角色 CRUD、权限绑定（`/admin/iam/roles`）
- 权限管理：权限 CRUD（`/admin/iam/permissions`）

### 个人中心

- 个人资料：查看/编辑用户名、邮箱、头像、手机号（`/admin/profile`）
- 修改密码：旧密码验证 + 新密码设置（集成 `@h-ai/ui` ChangePasswordForm）

### Dashboard

- 统计卡片：用户数、角色数、权限数、活跃用户数
- 近期活动：审计日志时间线
- 审计统计：近 7 天操作分布

### 审计日志

- 操作日志：记录所有 IAM CRUD、认证事件（通过 `audit.ts` 服务记录）

### UI Gallery

- 分类展示：Primitives / Compounds / Overlays / Scenes（`/admin/ui-gallery`）

### 模块演示

- 交互式示例：Core / DB / Cache / Storage / AI / Crypto 等（`/admin/modules`）

### 设置

- 主题切换：DaisyUI 主题（`/admin/settings`）
- 语言切换：中文 / English（Paraglide i18n）

---

## 路由结构

```
src/routes/
├── +layout.svelte                      # 全局根布局（ThemeProvider + Toast）
├── +page.server.ts                     # 首页（重定向到 /admin）
│
├── (auth)/                             # 认证页面（无 Sidebar 布局）
│   ├── +layout.svelte                  # 居中卡片布局
│   ├── +layout.server.ts               # 已登录则重定向到 /admin
│   └── auth/
│       ├── login/+page.svelte
│       ├── register/
│       │   ├── +page.svelte
│       │   └── +page.server.ts         # 加载 IAM 注册配置
│       ├── forgot-password/+page.svelte
│       └── reset-password/+page.svelte
│
├── admin/                              # 管理后台（需登录）
│   ├── +layout.svelte                  # Sidebar + TopBar 布局
│   ├── +layout.server.ts               # Session 校验 + 用户/权限注入
│   ├── +page.svelte                    # Dashboard
│   ├── +page.server.ts                 # Dashboard 数据加载
│   ├── iam/
│   │   ├── +page.server.ts             # IAM 子路由重定向
│   │   ├── users/
│   │   │   ├── +page.svelte            # 用户列表 + CRUD 弹窗
│   │   │   └── +page.server.ts         # 加载用户/角色数据
│   │   ├── roles/
│   │   │   ├── +page.svelte            # 角色列表 + 权限配置弹窗
│   │   │   └── +page.server.ts         # 加载角色/权限数据
│   │   └── permissions/
│   │       ├── +page.svelte            # 权限列表 + CRUD 弹窗
│   │       └── +page.server.ts         # 加载权限数据
│   ├── profile/
│   │   ├── +page.svelte                # 个人资料 + 修改密码
│   │   └── +page.server.ts             # 加载当前用户信息
│   ├── ui-gallery/
│   │   ├── +layout.svelte              # Gallery 分类导航布局
│   │   ├── +page.svelte                # Gallery 首页
│   │   ├── primitives/+page.svelte     # 原子组件
│   │   ├── compounds/+page.svelte      # 组合组件
│   │   ├── overlays/+page.svelte       # 覆盖层组件
│   │   └── scenes/+page.svelte         # 场景组件
│   ├── logs/
│   │   ├── +page.svelte                # 审计日志
│   │   └── +page.server.ts             # 权限检查 + 分页加载
│   ├── modules/+page.svelte            # 模块演示
│   └── settings/+page.svelte           # 主题 + 语言设置
│
└── api/                                # REST API
    ├── auth/
    │   ├── login/+server.ts
    │   ├── register/+server.ts
    │   ├── logout/+server.ts
    │   ├── forgot-password/+server.ts
    │   ├── reset-password/+server.ts
    │   ├── me/+server.ts               # GET 当前用户信息
    │   └── profile/
    │       ├── +server.ts              # PUT 更新资料
    │       ├── avatar/+server.ts       # POST 上传头像
    │       └── password/+server.ts     # PUT 修改密码
    ├── iam/
    │   ├── users/+server.ts            # GET(list), POST(create)
    │   ├── users/[id]/+server.ts       # GET, PUT, DELETE
    │   ├── roles/+server.ts            # GET(list), POST(create)
    │   ├── roles/[id]/+server.ts       # GET, PUT, DELETE
    │   ├── permissions/+server.ts      # GET(list), POST(create)
    │   └── permissions/[id]/+server.ts # GET, PUT, DELETE
    ├── health/+server.ts               # 健康检查
    └── public/
        └── iam-config/+server.ts       # 无需认证的 IAM 公共配置
```

---

## 服务端架构

### 初始化流程（`src/lib/server/init.ts`）

```
core.init → db.init → cache.init → reach.init(可选) → iam.init → createBusinessTables
```

- 配置文件位于 `config/_<module>.yml`，支持 `${ENV_VAR:default}` 语法
- 初始化失败后 promise 自动清除，下次请求触发重试

### 数据库

IAM 相关表（users, roles, permissions, sessions 等）由 `@h-ai/iam` 模块自动创建管理。

admin-console 仅维护一张业务表：

```sql
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  username TEXT,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id TEXT,
  details TEXT,
  ip TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### 服务层（`src/lib/server/services/`）

| 文件            | 职责                                                                       |
| --------------- | -------------------------------------------------------------------------- |
| `audit.ts`      | 审计日志 CRUD + 快捷记录函数（`logCreate` / `logUpdate` / `logDelete` 等） |
| `permission.ts` | 权限业务封装（查询、CRUD、角色绑定）                                       |
| `role.ts`       | 角色业务封装（查询、CRUD、权限 / 用户关联）                                |
| `user.ts`       | 用户类型定义（`AdminUser` / `UserDetail`）                                 |
| `index.ts`      | 服务统一导出                                                               |

### Hooks 架构（`src/hooks.server.ts`）

```
i18nHandle → haiHandle
                ├── Cookie 加密代理（SM4-CBC，可配置加密字段）
                ├── Session 解析（validateSession → iam.user / iam.authz 查询）
                ├── Guards（authGuard → /admin/* 和 /api/* 需登录）
                ├── Middleware chain
                │   ├── 传输加密（配置 SM2 公钥时自动注入）
                │   ├── loggingMiddleware
                │   ├── rateLimitMiddleware
                │   └── csrfMiddleware
                └── resolve(event)
```

---

## 框架模块依赖

| 模块            | 用途                                                          |
| --------------- | ------------------------------------------------------------- |
| `@h-ai/core`    | 配置管理、日志、Result 模式、ID 生成                          |
| `@h-ai/db`      | SQLite（可切换 PostgreSQL / MySQL）                           |
| `@h-ai/iam`     | 用户认证、RBAC、会话管理                                      |
| `@h-ai/cache`   | 内存缓存（可切换 Redis）                                      |
| `@h-ai/storage` | 文件存储（本地 / S3，用于头像上传）                           |
| `@h-ai/crypto`  | SM2 / SM3 / SM4（Cookie 加密 + 传输加密）                     |
| `@h-ai/ai`      | AI 集成（模块演示页面使用）                                   |
| `@h-ai/reach`   | 通知触达（密码重置邮件，可选）                                |
| `@h-ai/kit`     | SvelteKit hooks / guards / middleware / validation / response |
| `@h-ai/ui`      | UI 组件库（自动导入）                                         |

---

## 配置文件

### config/ 目录

| 文件          | 模块          | 说明           |
| ------------- | ------------- | -------------- |
| `_core.yml`   | @h-ai/core    | 日志级别、环境 |
| `_db.yml`     | @h-ai/db      | 数据库连接     |
| `_cache.yml`  | @h-ai/cache   | 缓存类型与连接 |
| `_iam.yml`    | @h-ai/iam     | 会话、密码策略 |
| `_reach.yml`  | @h-ai/reach   | 邮件通知       |
| `storage.yml` | @h-ai/storage | 存储后端       |

### 环境变量

参见 `.env.example`。核心变量：

| 变量                 | 说明                     | 默认值            |
| -------------------- | ------------------------ | ----------------- |
| `HAI_ENV`            | 运行环境                 | `development`     |
| `HAI_DB_TYPE`        | 数据库类型               | `sqlite`          |
| `HAI_DB_DATABASE`    | 数据库路径/名称          | `./data/admin.db` |
| `HAI_SESSION_SECRET` | 会话签名密钥（≥32 字符） | —                 |
| `HAI_CACHE_TYPE`     | 缓存类型                 | `memory`          |
| `HAI_STORAGE_TYPE`   | 存储类型                 | `local`           |
