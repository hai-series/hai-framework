# @h-ai/iam

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/audit](../audit/README.md) · [@h-ai/cache](../cache/README.md) · [@h-ai/core](../core/README.md) · [@h-ai/crypto](../crypto/README.md) · [@h-ai/reldb](../reldb/README.md) · [@h-ai/reach](../reach/README.md)

身份与访问管理模块，提供统一的 `iam` 对象实现认证、会话、授权与用户管理。

## 功能特性

| 功能           | 说明                                                                                   |
| -------------- | -------------------------------------------------------------------------------------- |
| **认证**       | 密码、OTP（邮箱/短信验证码）、LDAP、API Key 多策略认证                                 |
| **会话**       | 有状态会话（随机访问令牌 + 缓存，滑动续期可选）                                        |
| **授权**       | RBAC 角色与权限管理（DB + 缓存，通配符权限匹配）                                       |
| **用户管理**   | 注册、查询、更新、密码重置、管理员重置密码                                             |
| **API Key**    | API Key 创建、吊销、验证，支持 scope 与过期时间                                        |
| **一次性票据** | 短期、一次性能力票据（签发 / 原子消费），用于 WebSocket 等无法携带 Bearer Token 的通道 |
| **前端客户端** | HTTP API 契约定义，支持独立前端使用                                                    |

## 安装

```bash
pnpm add @h-ai/iam
```

## 依赖

- `@h-ai/reldb` — 数据库（用户/角色/权限持久化），**需在 iam.init() 前初始化**
- `@h-ai/cache` — 缓存（会话/OTP/重置令牌/权限缓存），**需在 iam.init() 前初始化**
- `@h-ai/crypto` — 密码哈希（内部使用，自动初始化）
- `@h-ai/audit` — 审计日志（RBAC 关键操作记录）

- `@h-ai/reach` — **可选**，应用安装、初始化并注入后可使用标准邮件/短信模板；自定义发送回调无需 Reach。
- `ldapts` — **可选**，仅在显式启用 LDAP 且没有注入 `ldapClientFactory` 时加载。

## 可选 LDAP 与通知接入

只使用密码、用户管理和 RBAC 时，无需安装或初始化 LDAP/Reach。两者均为可选 peer dependency，应用只安装选用的集成。下列发送、LDAP 片段位于应用启动/认证函数中，reldb/cache 必须先成功初始化；`username/password` 来自已校验输入。

### LDAP / Active Directory

使用默认客户端时执行 `pnpm add ldapts`，再显式设置 `login.ldap: true` 和 `ldap` 连接配置。只提供连接配置不会启用 LDAP。启用默认客户端却缺少 SDK 时，`iam.init()` 返回配置错误。

```yaml
# config/_iam.yml（启动前设置 LDAP_BIND_PASSWORD）
login:
  ldap: true
ldap:
  url: ldaps://ldap.example.com:636
  bindDn: cn=service,dc=example,dc=com
  bindPassword: '${LDAP_BIND_PASSWORD}'
  searchBase: ou=users,dc=example,dc=com
  searchFilter: '(uid={{username}})'
  usernameAttribute: uid
  emailAttribute: mail
  displayNameAttribute: cn
  connectTimeout: 5000
```

`ldaps://` 使用 TLS；`ldap://` 加 `useTls: true` 使用 StartTLS。Active Directory 可用 `searchFilter: "(sAMAccountName={{username}})"` 和 `usernameAttribute: sAMAccountName`；占位符会转义后搜索。首次登录默认同步本地用户并分配默认角色，账户禁用与锁定仍有效。可传 `ldapSyncUser: false` 或自定义 `ldapClientFactory`；工厂返回具备 `bind/search/unbind` 的客户端，结果均为 HaiResult。注入工厂时无需安装 ldapts。

```ts
import type { IamConfigSettingsInput } from '@h-ai/iam'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'

// core 已加载 config/，reldb 与 cache 已成功初始化。
const initialized = await iam.init(core.config.getOrThrow<IamConfigSettingsInput>('iam'))
if (!initialized.success)
  return initialized
const result = await iam.auth.loginWithLdap({ username, password })
if (!result.success)
  return result
return result
```

### 使用可选 Reach 自动发送

执行 `pnpm add @h-ai/reach`，应用负责 Reach 的配置、初始化和关闭，IAM 只使用传入的实例。以下 SMTP/HTTP Provider 为示例，SMS 网关按 [Reach 接口](../reach/README.md) 接收通知。Console 只记录元数据，不能用于实际收信。

```yaml
# config/_reach.yml；环境变量仅在服务端设置。
providers:
  - name: email
    type: smtp
    host: '${SMTP_HOST}'
    port: 465
    secure: true
    user: '${SMTP_USER}'
    pass: '${SMTP_PASSWORD}'
    from: '${MAIL_FROM}'
  - name: sms
    type: api
    url: '${SMS_GATEWAY_URL}'
templates:
  - name: otp_email
    provider: email
    subject: Verification code
    body: 'Your code is {code}.'
  - name: otp_sms
    provider: sms
    body: 'Your code is {code}.'
  - name: password_reset
    provider: email
    subject: Password reset
    body: 'Reset: {resetUrl}. Expires: {expiresAt}.'
  - name: password_reset_sms
    provider: sms
    body: 'Reset: {resetUrl}. Expires: {expiresAt}.'
```

标准模板及变量：`otp_email / otp_sms` 使用 `{code}`；`password_reset / password_reset_sms` 使用 `{token}`、`{expiresAt}`、`{resetUrl}`。`passwordReset.mode: phone` 选择短信重置。必须在 `iam.init()` 前配置模板；缺少通道时公开配置隐藏对应入口。

```ts
import type { ReachConfigInput } from '@h-ai/reach'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { reach } from '@h-ai/reach'

// core、reldb、cache 已初始化；按应用生命周期反序关闭 IAM 与 Reach。
const notification = await reach.init(core.config.getOrThrow<ReachConfigInput>('reach'))
if (!notification.success)
  return notification
const initialized = await iam.init({
  reach,
  login: { otp: true },
  otp: { email: true, sms: true },
  passwordReset: { mode: 'email', resetUrl: 'https://app.example.com/auth/reset-password' },
})
if (!initialized.success)
  return initialized
return iam.auth.sendOtp('user@example.com')
```

### 应用自定义短信 / 邮件发送

注入 `onOtpSendEmail`、`onOtpSendSms` 和 `onPasswordResetRequest` 即可接入现有发送服务；可只实现需要的回调，也可与 Reach 混用，显式回调优先。以下服务为应用实现，示例假定其 Promise 仅在投递成功时完成；若服务返回 HaiResult，须检查 `success`，失败时在回调内抛错。IAM 捕获回调异常并返回业务错误，不将验证码、令牌或内部投递详情写入用户提示。

```ts
import { iam } from '@h-ai/iam'
import { mailService, smsService } from './notifications.js'

// mailService/smsService 为应用已有的发送服务；不需要安装或初始化 Reach。
// 调用方须检查服务投递结果，失败时拒绝 Promise，不能吞掉错误。
const initialized = await iam.init({
  otp: { email: true, sms: true },
  onOtpSendEmail: async (email, code) => {
    await mailService.send({ to: email, subject: 'Verification code', text: code })
  },
  onOtpSendSms: async (phone, code) => {
    await smsService.send({ to: phone, code })
  },
  passwordReset: { mode: 'email' },
  onPasswordResetRequest: async (user, token, expiresAt) => {
    if (!user.email)
      throw new Error('Reset recipient unavailable')
    const url = new URL('https://app.example.com/auth/reset-password')
    url.searchParams.set('token', token)
    await mailService.send({ to: user.email, subject: 'Password reset', text: url.toString(), expiresAt })
  },
})
if (!initialized.success)
  return initialized
```

## 快速开始

```ts
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { reldb } from '@h-ai/reldb'

// 基础密码认证不需要安装 Reach 或 ldapts。
async function example() {
  try {
    const db = await reldb.init({ type: 'sqlite', database: './data.db' })
    if (!db.success)
      return db
    const cached = await cache.init({ type: 'memory' })
    if (!cached.success)
      return cached
    const initialized = await iam.init({})
    if (!initialized.success)
      return initialized
    const registered = await iam.user.register({ username: 'demo', password: 'Password123' })
    if (!registered.success)
      return registered
    const login = await iam.auth.login({ identifier: 'demo', password: 'Password123' })
    if (!login.success)
      return login
    return await iam.auth.verifyToken(login.data.tokens.accessToken)
  }
  finally {
    // 应用关闭时按依赖的反向顺序释放。
    await iam.close()
    await cache.close()
    await reldb.close()
  }
}

const result = await example()
if (!result.success)
  core.logger.error('Authentication example failed', { code: result.error.code })
```

默认 LDAP 关闭；OTP 需要 `otp` 配置和可用发送回调，重置需要可用通知回调，才能在 `iam.publicConfig` 中启用。

`iam.config` 返回的是**脱敏后的配置快照**：LDAP `url` / `bindPassword` 等敏感配置会自动隐藏，便于状态检查但不能代替原始配置源。

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

| 数据类型                                          | 存储位置                           | 说明                                                                                                                          |
| ------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 用户、角色、权限、关联关系、API Key               | DB（基础 5 张，可选 API Key 1 张） | `hai_iam_users`、`hai_iam_roles`、`hai_iam_permissions`、`hai_iam_role_permissions`、`hai_iam_user_roles`、`hai_iam_api_keys` |
| 会话（accessToken → Session）                     | 缓存                               | 有 TTL，滑动续期可选                                                                                                          |
| Token 映射（refreshToken → userId + accessToken） | 缓存                               | 独立 key，refresh 后旧 token 立即失效                                                                                         |
| OTP 验证码                                        | 缓存                               | 有 TTL + 尝试次数限制                                                                                                         |
| 密码重置令牌                                      | 缓存                               | 有 TTL + 最大验证次数限制                                                                                                     |
| API Key                                           | DB                                 | `hai_iam_api_keys`，明文不落库，仅存 hash；前缀用于候选检索                                                                   |

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
  → 读取当前用户状态 + 角色 JOIN + 批量权限查询（无角色时省略权限查询）
  → 用户停用或数据库读取失败时拒绝；API Key 会话再次收敛 scope
  → 返回当前 Session 对象（含 userId、roles、permissions）
```

#### 使用方式

`authz.createRole({ ..., permissionIds })` 和 `authz.updateRole(id, { ..., permissionIds })` 在同一事务中保存角色资料和完整权限集合；任一步失败均回滚。`permissionIds: []` 清空权限，省略则保持不变；重复 ID 去重，未知权限失败。并发更新以最后提交的完整集合为准，不合并两个集合。自管事务提交后同步现有用户会话；使用外部事务时，调用方仍须在提交后同步会话。Admin Console 直接使用此接口，不再拆分更新或补偿删除角色。

```ts
// 密码登录
const result = await iam.auth.login({ identifier: 'admin', password: 'Password123' })

// OTP 登录
await iam.auth.sendOtp('user@example.com')
const result = await iam.auth.loginWithOtp({ identifier: 'user@example.com', code: '123456' })

// LDAP 登录（内置客户端，可选注入 ldapClientFactory）
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

- **纯缓存存储**：不落库；Memory 重启后丢失，共享 Redis 可跨 IAM 服务重启保留会话直至 TTL 或撤销
- **滑动续期**：`sliding: true` 时每次 `get()` 自动延长 TTL
- **Refresh Rotation**：旧 refreshToken 单次使用后立即失效，检测到重放即说明 token 泄漏
- **Token 强度**：256-bit crypto random（`crypto.getRandomValues(new Uint8Array(32))`），base64url 编码

---

### 子模块：授权（authz）— `iam.authz`

角色列表通过 `iam.authz.getRoleUserCounts(roleIds)` 一次聚合当前页角色的真实成员数，返回 `HaiResult<Map<string, number>>`。无关联为 0；查询失败显示加载错误，不生成零统计。

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
- **会话同步**：缓存更新为 best-effort；受保护请求使用 `iam.auth.verifyToken`，每次读取当前状态与授权，读取失败拒绝。`iam.session.verifyToken` 仅验证会话快照。`iam.authz.getUserAuthorization(userId)` 复用角色 JOIN 与批量权限查询。
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
const users = await iam.user.listUsers({
  page: 1,
  pageSize: 20,
  search: 'alice',
  roleCode: 'editor', // 角色 code 在数据库分页前筛选，total 与 items 保持一致。
  sortBy: 'createdAt',
  sortDirection: 'desc',
  include: ['roles'],
})
const batch = await iam.user.getUsers([userId1, userId2], { include: ['roles'] }) // 上限 1000；去重保留输入顺序，缺失 ID 省略。
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
- **服务端排序**：`listUsers` 仅允许 `username`、`email`、`displayName`、`enabled`、`createdAt` 排序；字段经白名单映射，未指定时默认按创建时间倒序

---

### 子模块：API Key — `iam.apiKey`

`scopes` 与主体权限取交集，支持 `*` 和命名空间 `:*`；默认空数组只保留身份，不授予操作权限。受限 key 的会话 `roles` 为空，通过 permission 守卫访问，显式 `*` 也不能超出主体授权。API Key 登录绑定 key ID，派生会话的 get/verifyToken/refresh 每次检查持久化 key，撤销、禁用、过期或 DB 读取失败即拒绝。单独 verifyApiKey 仅返回验证后的 key 元数据，仍需主体与操作授权。

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

// 列出用户的 API Key（服务端分页）
const keys = await iam.apiKey.listApiKeys(userId, { page: 1, pageSize: 20, search: 'ci' })
// keys.data → { items, total, page, pageSize }

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

## 前端 API 调用

公共 HTTP API 由 `@h-ai/api-contract` 定义，并通过 `@h-ai/api-client` 生成 typed client 调用：

```ts
import { apiClient } from '@h-ai/api-client'

await apiClient.init({ baseUrl: '/api/v1' })

// 登录
const result = await apiClient.iam.auth.login({
  identifier: 'admin',
  password: 'Password123',
})

// 获取当前用户
const user = await apiClient.iam.auth.currentUser()

// 修改密码
await apiClient.iam.auth.changePassword({
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

## 一次性票据 — `iam.ticket`

短期、一次性能力票据。用于无法携带 Bearer Token 的通道（如 WebSocket URL）：由已认证的 HTTP 请求签发一个绑定主体、用途与操作的票据，服务端在首次校验时**原子消费**（单次有效）。

```ts
// 签发（已登录 HTTP 请求内）：绑定主体、用途与本次操作，30 秒过期
const issued = await iam.ticket.issue({
  subjectId: session.userId,
  purpose: 'ai-audio',
  grant: { operation: 'transcribe', model: 'whisper-1' },
  ttlMs: 30_000,
})
// issued.data.ticket 交给客户端，用于建立 WebSocket 连接

// 消费（服务端建连时）：原子单次，返回主体 + 用途 + grant
const consumed = await iam.ticket.consume(ticket, { purpose: 'ai-audio' })
if (consumed.success) {
  const { subjectId, grant } = consumed.data
  // 用 grant.operation / grant.model 交叉校验客户端请求
}
```

特性：密码学安全随机值、TTL、原子单次消费（并发消费仅一个成功）、用途绑定（防跨用途重放）。

## 配置驱动认证页面

服务端通过 `iam.publicConfig` 提供白名单配置，或通过客户端的 `client.iam.auth.publicConfig()` 标准 HTTP contract 获取。只展示已开启且具备依赖的登录方式；LDAP 接入见上方可选配置，默认关闭；只有选用默认客户端时才安装 ldapts。

| 配置                                                                                 | 用途                                                  |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| `login.password / otp / ldap`                                                        | 独立启用密码、验证码、企业账号                        |
| `otp.email / sms`                                                                    | 独立启用邮件、短信                                    |
| `register.enabled / defaultEnabled`                                                  | 自助注册及新账户状态                                  |
| `passwordReset.enabled / mode / resetUrl`                                            | 启用重置、选择 email/phone 渠道、配置重置页面绝对地址 |
| `agreements.showOnRegister / showOnLogin`                                            | 注册/登录协议弹窗显示；链接只接受 HTTP(S)             |
| `ui.variant / title / subtitle / brandTitle / brandText / logoUrl / illustrationUrl` | 卡片/分栏布局、标题、品牌、Logo 和配图                |

选用 Reach 时，在 reldb/cache/Reach 初始化成功后使用 `iam.init({ ...settings, reach })` 自动接入 Reach 的 `otp_email`、`otp_sms`、`password_reset`、`password_reset_sms` 模板。模板绑定对应邮件/短信 Provider；显式发送回调可覆盖默认行为。Console Provider 只记录元数据，实际收信需配置 SMTP、短信或 HTTP 通知服务。发送失败返回错误，不会伪报已发送。

SvelteKit 使用 `kit.auth.createApi(iam)` 导出标准 handler，匿名端点白名单使用 `kit.auth.publicPaths`。客户端通过 `kit.client.createAuthActions()` 连接 Cookie 端点；独立 HTTP 客户端通过 `apiClient.createAuthActions(client)` 连接 IAM contract 并自动保存 Token 到已配置安全存储。将配置及动作直接传入 `AuthPanel`，完成登录、注册、找回及重置；单独使用 `LoginForm` 可传 `methods`、`onsendotp`、`resendInterval`，密码表单可传完整 `passwordPolicy`。

管理员使用 `iam.user.createUser()` 建用户，调用端必须校验管理员权限；关闭自助注册不影响管理端。注册与密码登录开关独立，`registerAndLogin` 在注册完成后创建会话；默认禁用账户不会创建会话。

协议在 Modal 中打开，关闭后保留表单输入。使用 URL 时，协议页面须允许 iframe 嵌入；禁止脚本执行，并提供新窗口查看入口。`LoginForm/RegisterForm` 提供 `header/extraFields/footer` snippet，`AuthPanel` 透传 `loginHeader/loginFields/loginFooter` 和 `registerHeader/registerFields/registerFooter`；自定义字段由应用绑定状态并在动作中处理。示例见 [UI 用法](../ui/README.md#配置驱动认证页面)。

### Markdown 协议内容

协议支持 `agreements.userAgreementMarkdown` 与 `privacyPolicyMarkdown` 直接从配置加载；YAML 的 `|` 保留 Markdown 段落和换行。弹窗复用安全 MarkdownRenderer，关闭原始 HTML、脚本和代码复制工具。同主题同时提供正文与 URL 时优先正文，URL 可作为额外查看入口；只有 URL 时使用隔离 iframe。

```yaml
agreements:
  showOnRegister: true
  showOnLogin: false
  userAgreementMarkdown: |
    # 用户协议

    **账户使用条款**

    - 请妥善保管账户凭据。
  privacyPolicyMarkdown: |
    # 隐私政策

    注册资料用于账户管理，会话信息用于身份认证。
  # 可选 URL；同主题同时配置 Markdown 和 URL 时，弹窗优先显示 Markdown。
  # userAgreementUrl: https://example.com/terms
  # privacyPolicyUrl: https://example.com/privacy
```

### 分布式安全与边界

所有节点必须共享同一数据库和 Redis；Memory 仅用于单进程。登录 `maxLoginAttempts / lockoutDuration` 使用数据库原子更新，到期后的失败重新计数。OTP `maxAttempts / resendInterval` 使用共享锁和独立发送间隔状态，耗尽或消费验证码不能绕过重发限制，并发只消费一次。重置 `tokenExpiresIn / maxAttempts` 使用共享缓存 TTL 和每用户共享锁；每次有效令牌请求（包括密码策略失败）计数，最新令牌有效且只成功消费一次。重置后撤销旧会话、解除登录锁定；禁用用户不能通过密码、LDAP、OTP 登录。密码策略以服务端为准。

可选字段（如 `ldap`）若尚未写入 YAML，请先声明该字段，或通过 `HAI_IAM` 的 JSON 值整体覆盖模块配置；已有字段支持 `HAI_IAM_LOGIN_OTP` 等环境变量覆盖。

标准 HTTP 入口：`GET /auth/config`、`POST /auth/login/ldap`、`POST /auth/password-reset/request`、`POST /auth/password-reset/confirm`；验证码继续使用 `/auth/otp/send` 与 `/auth/login/otp`。安全错误：`SECURITY_BUSY (hai:iam:023)`、`PASSWORD_RESET_DISABLED (hai:iam:024)`。

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
