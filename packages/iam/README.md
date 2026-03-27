# @h-ai/iam

身份与访问管理模块，提供统一的 `iam` 对象实现认证、会话、授权与用户管理。

## 功能特性

| 功能           | 说明                                                   |
| -------------- | ------------------------------------------------------ |
| **认证**       | 密码、OTP（邮箱/短信验证码）、LDAP、API Key 多策略认证 |
| **会话**       | 有状态会话（随机访问令牌 + 缓存，滑动续期可选）        |
| **授权**       | RBAC 角色与权限管理（DB + 缓存，通配符权限匹配）       |
| **用户管理**   | 注册、查询、更新、密码重置、管理员重置密码             |
| **API Key**    | API Key 创建、吊销、验证，支持 scope 与过期时间        |
| **前端客户端** | HTTP API 契约定义，支持独立前端使用                    |

## 安装

```bash
pnpm add @h-ai/iam
```

## 依赖

- `@h-ai/reldb` — 数据库（用户/角色/权限持久化），**需在 iam.init() 前初始化**
- `@h-ai/cache` — 缓存（会话/OTP/重置令牌/权限缓存），**需在 iam.init() 前初始化**
- `@h-ai/crypto` — 密码哈希（内部使用，自动初始化）
- `@h-ai/audit` — 审计日志（RBAC 关键操作记录）

## 快速开始

```ts
import { cache } from '@h-ai/cache'
import { iam } from '@h-ai/iam'
import { reldb } from '@h-ai/reldb'

// 1. 初始化依赖
await reldb.init({ type: 'sqlite', database: './data.db' })
await cache.init({ type: 'memory' })

// 2. 初始化 IAM（自动使用已初始化的 reldb 和 cache 单例）
await iam.init({
  session: { maxAge: 86400, sliding: true },
  // OTP 回调（启用 OTP 登录时注入发送逻辑）
  onOtpSendEmail: async (email, code) => {
    await sendEmail(email, `验证码: ${code}`)
  },
  // 密码重置回调（启用密码重置时注入通知逻辑）
  onPasswordResetRequest: async (user, token, expiresAt) => {
    await sendEmail(user.email!, `重置链接: https://example.com/reset?token=${token}`)
  },
})

// 2. 注册
const userResult = await iam.user.register({
  username: 'admin',
  email: 'admin@example.com',
  password: 'Password123',
})

// 3. 登录
const loginResult = await iam.auth.login({
  identifier: 'admin',
  password: 'Password123',
})
if (loginResult.success) {
  const { user, tokens } = loginResult.data
}

// 4. 验证令牌
const session = await iam.auth.verifyToken(loginResult.data.tokens.accessToken)

// 5. OTP 验证码登录
await iam.auth.sendOtp('user@example.com')
const otpResult = await iam.auth.loginWithOtp({
  identifier: 'user@example.com',
  code: '123456',
})

// 6. 检查权限
const hasPermission = await iam.authz.checkPermission(
  loginResult.data.user.id,
  'user:read',
)

// 7. 关闭
await iam.close()
```

## 设计说明

### 架构概览

IAM 是**生命周期单例**模块，通过 `iam.init()` / `iam.close()` 管理运行时状态。内部由 5 个子模块构成，按依赖顺序初始化：

```
iam.init()
  ├─ session  （缓存会话管理，无 DB 依赖）
  ├─ authz    （RBAC 角色/权限，DB + 缓存）
  ├─ authn    （认证策略，依赖 session + authz）
  ├─ user     （用户管理，依赖 session + authz + passwordStrategy）
  └─ seed     （种子数据，依赖 authz）
```

所有子模块使用**工厂 + 闭包**模式创建（如 `createSessionOperations(deps)`），不使用 class。通过 getter 暴露给调用方（`iam.auth` / `iam.user` / `iam.authz` / `iam.session` / `iam.apiKey`）。

初始化前访问任何子模块方法，均返回 `NOT_INITIALIZED` 错误（基于 `NotInitializedKit` Proxy）。

### 数据存储分布

| 数据类型                                          | 存储位置     | 说明                                                                                                                          |
| ------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| 用户、角色、权限、关联关系、API Key               | DB（6 张表） | `hai_iam_users`、`hai_iam_roles`、`hai_iam_permissions`、`hai_iam_role_permissions`、`hai_iam_user_roles`、`hai_iam_api_keys` |
| 会话（accessToken → Session）                     | 缓存         | 有 TTL，滑动续期可选                                                                                                          |
| Token 映射（refreshToken → userId + accessToken） | 缓存         | 独立 key，refresh 后旧 token 立即失效                                                                                         |
| OTP 验证码                                        | 缓存         | 有 TTL + 尝试次数限制                                                                                                         |
| 密码重置令牌                                      | 缓存         | 有 TTL + 最大验证次数限制                                                                                                     |
| API Key                                           | DB           | `hai_iam_api_keys`，明文不落库，仅存 hash；前缀用于候选检索                                                                   |

---

### 子模块：认证（authn）— `iam.auth`

#### 关键对象

- **`AuthnOperations`** — 认证操作接口，包含 `login` / `loginWithOtp` / `loginWithLdap` / `loginWithApiKey` / `logout` / `verifyToken` / `sendOtp` / `registerAndLogin`
- **`AuthStrategy`** — 认证策略接口（`type` + `authenticate` + `challenge?`），4 种实现：密码、OTP、LDAP、API Key
- **`AuthResult`** — 登录结果，含用户信息、`TokenPair`（accessToken + refreshToken）、角色/权限列表
- **`Credentials`** — 统一凭证联合类型（`{ type: 'password' | 'otp' | 'ldap' | 'apikey' } & 具体凭证`）

#### 关键流程

**密码登录流程：**

```
login(credentials)
  → 检查密码登录已启用
  → 按 identifier 查找用户（username / email / phone 三字段匹配）
  → 用户不存在时执行 dummy hash（防 timing attack，固定耗时）
  → 检查账户是否锁定（lockoutDuration 内 loginFailedCount >= maxLoginAttempts）
  → 密码哈希验证（@h-ai/crypto）
  → 验证失败：记录失败次数，达上限则锁定账户
  → 验证成功：重置失败计数
  → 检查密码是否过期（expirationDays > 0 时检查 passwordUpdatedAt）
  → 查询用户角色 + 权限
  → 创建会话（session.create → 生成 TokenPair）
  → 返回 AuthResult { user, tokens, roles, permissions, agreements? }
```

**Token 验证流程：**

```
verifyToken(accessToken)
  → session.get(accessToken) → 缓存查询
  → 滑动续期模式下自动延长 TTL
  → 返回 Session 对象（含 userId、roles、permissions）
```

#### 使用方式

```ts
// 密码登录
const result = await iam.auth.login({ identifier: 'admin', password: 'Password123' })

// OTP 登录
await iam.auth.sendOtp('user@example.com')
const result = await iam.auth.loginWithOtp({ identifier: 'user@example.com', code: '123456' })

// LDAP 登录（需在 init 时提供 ldapClientFactory）
const result = await iam.auth.loginWithLdap({ username: 'jdoe', password: 'pass' })

// API Key 登录（需启用 login.apikey: true）
const result = await iam.auth.loginWithApiKey({ key: 'hai_xxxx...' })

// 验证令牌
const session = await iam.auth.verifyToken(accessToken)

// 注册并登录（一站式）
const result = await iam.auth.registerAndLogin({ username: 'new', password: 'Pass123' })
```

#### 特别关注

- **Timing attack 防护**：用户不存在时执行 dummy password hash，保持响应时间一致
- **账户锁定**：连续登录失败 `maxLoginAttempts` 次后锁定 `lockoutDuration` 秒
- **认证策略可独立启用/禁用**：通过 `login.password` / `login.otp` / `login.ldap` / `login.apikey` 控制
- **OTP 安全**：rejection sampling 消除模偏差，常量时间比较防 timing attack，频率限制（`resendInterval`）

---

### 子模块：会话（session）— `iam.session`

#### 关键对象

- **`SessionOperations`** — 会话操作接口：`create` / `get` / `verifyToken` / `update` / `delete` / `deleteByUserId` / `refresh` / `revokeRefresh` / `patchUserSessions`
- **`Session`** — 会话实体，含 userId、roles、permissions、accessToken、过期时间等
- **`TokenPair`** — 令牌对：`{ accessToken, refreshToken, expiresIn, tokenType: 'Bearer' }`

#### 关键流程

**Token 刷新（Rotation 策略）：**

```
refresh(refreshToken)
  → 从缓存读取 refreshToken → { userId, accessToken } 映射
  → 获取旧 session（通过 accessToken）
  → 删除旧 refreshToken（缓存 key 立即失效 → 防重放攻击）
  → 删除旧 accessToken session
  → 创建全新 session（复用旧 session 的用户上下文）
  → 返回新的 TokenPair
```

**单设备登录：**

```
create(options) [singleDevice=true]
  → 清除该用户所有已有令牌（遍历 user→tokens 映射）
  → 生成新的 accessToken + refreshToken
  → 存储 session 到缓存
```

#### 使用方式

```ts
// 创建会话（通常由 login 内部调用）
const session = await iam.session.create({
  userId: 'user-id',
  username: 'admin',
  roles: ['admin'],
  permissions: ['user:read', 'user:write'],
})

// 验证令牌
const session = await iam.session.verifyToken(accessToken)

// 刷新令牌
const newTokens = await iam.session.refresh(refreshToken)

// 强制下线
await iam.session.deleteByUserId(userId)
```

#### 特别关注

- **纯缓存存储**：不落库，重启后所有会话失效（符合安全最佳实践）
- **滑动续期**：`sliding: true` 时每次 `get()` 自动延长 TTL
- **Refresh Rotation**：旧 refreshToken 单次使用后立即失效，检测到重放即说明 token 泄漏
- **Token 强度**：256-bit crypto random（`crypto.getRandomValues(new Uint8Array(32))`），base64url 编码

---

### 子模块：授权（authz）— `iam.authz`

#### 关键对象

- **`AuthzOperations`** — 授权操作接口，覆盖角色 CRUD、权限 CRUD、角色-权限/用户-角色分配、权限检查
- **`Role`** — 角色实体：`{ id, code, name, description, isSystem }`
- **`Permission`** — 权限实体：`{ id, code, name, type, resource, action }`，type 可为 `menu` / `api` / `button`
- **`PermissionType`** — 权限类型枚举

#### 关键流程

**权限检查（`checkPermission`）：**

```
checkPermission(userId, permission)
  → RBAC 未启用 → 直接返回 true
  → 查询用户角色列表（DB）
  → 检查是否包含超管角色（缓存 superAdminRoleId）→ 是则直接返回 true
  → 逐角色查询权限代码列表（缓存优先，miss 时查 DB 并写入缓存）
  → 逐权限匹配：精确匹配 或 通配符匹配（`admin:*` 匹配 `admin:read`）
  → 返回 true / false
```

**角色/权限变更后的会话同步：**

```
assignPermissionToRole(roleId, permId)
  → DB 写入关联关系
  → 清除角色权限缓存
  → 查询该角色下所有用户 → 逐用户重新解析权限 → 更新活跃 session
  （best-effort：同步失败仅 log.error，不影响权限分配结果）
```

#### 使用方式

```ts
// 角色管理
const role = await iam.authz.createRole({ code: 'editor', name: '编辑' })
const roles = await iam.authz.getAllRoles({ page: 1, pageSize: 20 })

// 权限管理
const perm = await iam.authz.createPermission({
  code: 'article:publish',
  name: '发布文章',
  type: 'api',
  resource: 'article',
  action: 'publish',
})

// 分配与检查
await iam.authz.assignRole(userId, role.data.id)
await iam.authz.assignPermissionToRole(role.data.id, perm.data.id)
const allowed = await iam.authz.checkPermission(userId, 'article:publish')

// 批量同步角色
await iam.authz.syncRoles(userId, [roleId1, roleId2])
```

#### 特别关注

- **通配符匹配**：`admin:*` 匹配 `admin:read`、`admin:write:detail` 等（单层 `*` 匹配冒号后全部）
- **超管角色**：配置的 `rbac.superAdminRole`（默认 `super_admin`）自动拥有所有权限
- **事务保护**：`deleteRole` / `deletePermission` 使用 DB 事务，先清关联再删实体
- **会话同步延迟**：权限变更后活跃 session 中的权限列表会被同步更新，但为 best-effort（大量用户场景可能有延迟）
- **种子数据**：`seedDefaultData: true` 时自动创建 admin/user/guest 三个默认角色及基础权限，幂等执行

---

### 子模块：用户管理（user）— `iam.user`

#### 关键对象

- **`UserOperations`** — 用户操作接口：注册、查询、更新、删除、密码修改与重置、密码强度验证
- **`User`** — 用户实体（公开字段）：`{ id, username, email, phone, displayName, avatarUrl, enabled, roles? }`
- **`StoredUser`** — 内部存储用户（含 `passwordHash`、`loginFailedCount`、`lockedUntil` 等敏感字段）
- **`RegisterOptions`** / **`RegisterResult`** — 注册输入与输出
- **`UpdateCurrentUserInput`** — 当前用户可修改的白名单字段（`displayName` / `avatarUrl` / `phone` / `metadata`）

#### 关键流程

**用户注册流程：**

```
register(options)
  → 检查注册是否启用
  → 密码强度验证（Zod schema + 自定义规则）
  → 密码哈希（@h-ai/crypto）
  → DB 事务：创建用户 + 查询创建结果
  → 分配默认角色（rbac.defaultRole，事务外执行，失败仅 log）
  → 返回 RegisterResult { user, agreements? }
```

**密码重置流程：**

```
requestPasswordReset(email)
  → 按邮箱查找用户（不存在时静默返回 ok → 防枚举攻击）
  → 生成 256-bit 随机令牌
  → 缓存存储 SHA-256(token) → userId 映射（有 TTL + maxAttempts）
  → 调用 onPasswordResetRequest 回调（业务层负责发送邮件/短信）

confirmPasswordReset(token, newPassword)
  → 缓存查询 SHA-256(token) → 校验有效期和尝试次数
  → 密码强度验证 → 哈希 → 更新 DB
  → 清除该用户所有活跃会话（强制重新登录）
  → 删除已使用的重置令牌
```

#### 使用方式

```ts
// 注册
const result = await iam.user.register({
  username: 'alice',
  email: 'alice@example.com',
  password: 'Password123',
})

// 当前用户操作
const me = await iam.user.getCurrentUser(accessToken)
await iam.user.updateCurrentUser(accessToken, { displayName: '新名称' })
await iam.user.changeCurrentUserPassword(accessToken, 'oldPass', 'newPass')

// 管理操作
const users = await iam.user.listUsers({ page: 1, pageSize: 20, search: 'alice', include: ['roles'] })
await iam.user.updateUser(userId, { enabled: false }) // 禁用用户 → 自动清除会话
await iam.user.deleteUser(userId) // 删除用户 → 事务清除角色关联

// 密码重置
await iam.user.requestPasswordReset('alice@example.com')
await iam.user.confirmPasswordReset(token, 'NewPassword456')
await iam.user.adminResetPassword(userId, 'TempPassword123')

// 密码强度验证（同步方法）
const valid = iam.user.validatePassword('weak')
```

#### 特别关注

- **`toUser()` 字段脱敏**：所有对外返回的用户对象均剥离 `passwordHash`、`loginFailedCount` 等敏感字段
- **会话联动**：`deleteUser` / `updateUser({ enabled: false })` / `changePassword` / `confirmPasswordReset` 自动清除受影响用户的所有活跃会话
- **防枚举攻击**：`requestPasswordReset` 对不存在的邮箱返回 `ok(undefined)` 而非错误
- **validatePassword 是同步方法**：这是 `UserOperations` 中唯一的同步方法，其余均为异步
- **搜索模糊匹配**：`listUsers` 支持按用户名、邮箱、手机号、显示名称模糊搜索，LIKE 通配符已转义

---

### 子模块：API Key — `iam.apiKey`

#### 关键对象

- **`ApiKeyOperations`** — API Key 操作接口：`createApiKey` / `listApiKeys` / `getApiKey` / `revokeApiKey` / `verifyApiKey`
- **`ApiKey`** — API Key 实体（公开字段）：`{ id, userId, name, keyPrefix, enabled, expiresAt, scopes }`
- **`CreateApiKeyResult`** — 创建结果：`{ apiKey, rawKey }`（明文密钥仅返回一次）

#### 关键流程

**API Key 验证：**

```
verifyApiKey(rawKey)
  → 从 rawKey 提取前缀（prefix + 前 8 字符）
  → 按前缀从 DB 检索候选 API Key 列表（缩小范围）
  → 逐候选项进行 hash 验证（同步操作）
  → 验证通过 → 检查是否过期/禁用
  → 异步更新 lastUsedAt（不阻塞返回）
  → 返回 ApiKey 实体
```

#### 使用方式

```ts
// 创建 API Key
const result = await iam.apiKey.createApiKey(userId, {
  name: 'CI/CD',
  expirationDays: 90,
  scopes: ['api:read'],
})
// result.data.rawKey → 明文密钥（仅此一次展示）

// 列出用户的 API Key
const keys = await iam.apiKey.listApiKeys(userId)

// 吊销
await iam.apiKey.revokeApiKey(keyId)
```

#### 特别关注

- **明文不落库**：数据库仅存储 hash，创建时返回的 `rawKey` 是唯一获取机会
- **前缀检索**：使用 `keyPrefix` 缩小候选集，避免全表扫描
- **数量限制**：单用户最多 `maxKeysPerUser`（默认 10）个 API Key
- **需显式启用**：`login.apikey: true` 才会初始化 API Key 子功能

---

## 更多用法

详细 API 参数、错误码及集成模式请参考 Skill 模板（`packages/cli/templates/skills/hai-iam/SKILL.md`）。

## 前端 API 契约

前端通过 `@h-ai/iam/api` 导出的契约定义（`iamEndpoints`）与 `@h-ai/api-client` 配合调用：

```ts
import { api } from '@h-ai/api-client'
import { iamEndpoints } from '@h-ai/iam/api'

await api.init({ baseUrl: '/api/iam' })

// 登录
const result = await api.call(iamEndpoints.login, {
  identifier: 'admin',
  password: 'Password123',
})

// 获取当前用户
const user = await api.call(iamEndpoints.currentUser, {})

// 修改密码
await api.call(iamEndpoints.changePassword, {
  oldPassword: 'Password123',
  newPassword: 'NewPassword456',
})
```

## 密码重置

```ts
// 请求重置（即使用户不存在也返回 ok，防止枚举）
await iam.user.requestPasswordReset('admin@example.com')

// 确认重置（校验令牌有效期和尝试次数 → 更新密码 → 清除所有会话）
const result = await iam.user.confirmPasswordReset(token, 'NewPassword456')

// 管理员重置（无需旧密码）
await iam.user.adminResetPassword(userId, 'TempPassword123')
```

## 错误处理

所有操作返回 `HaiResult<T>`，通过 `HaiIamError` 做分支判断：

```ts
import { HaiIamError, iam } from '@h-ai/iam'

const result = await iam.auth.login({ identifier: 'admin', password: 'wrong' })
if (!result.success) {
  if (result.error.code === HaiIamError.INVALID_CREDENTIALS.code) {
    // 用户名或密码错误
  }
}
```

## 测试

```bash
pnpm test
```

## 许可证

Apache-2.0
